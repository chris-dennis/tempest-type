use uuid::Uuid;
use actix_web::cookie::{Cookie, SameSite};
use serde::{Serialize, Deserialize};
use actix_web::web;
use sqlx::Error as SqlxError;
use crate::database::DbPool;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub stats: Statistics,
    pub nickname: String
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Statistics {
    pub races_completed: u32,
    pub races_won: u32,
    pub avg_wpm: f32,
    pub top_wpm: f32,
}

impl User {
    pub fn new() -> Self {
        Self {
            id: Uuid::new_v4(),
            stats: Statistics {
                races_completed: 0,
                races_won: 0,
                avg_wpm: 0.0,
                top_wpm: 0.0,
            },
            nickname: "".to_string(),
        }
    }

    pub fn from_cookie(cookie_value: &str) -> Option<Self> {
        serde_json::from_str(cookie_value).ok()
    }

    pub fn to_cookie(&self) -> Cookie {
        let value = serde_json::to_string(self).unwrap();
        Cookie::build("user_id", value)
            .same_site(SameSite::Lax)
            .path("/")
            .secure(true)
            .http_only(false)
            .max_age(time::Duration::days(30))
            .finish()
    }

    pub async fn store(&self, db_pool: &web::Data<DbPool>) -> Result<(), SqlxError> {
        // Insert or update user
        sqlx::query!(
            "INSERT INTO users (id, nickname) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET nickname = $2",
            self.id,
            self.nickname
        )
            .execute(db_pool.get_ref())
            .await?;

        // Insert or update user stats
        sqlx::query!(
            "INSERT INTO user_stats (user_id, races_completed, races_won, avg_wpm, top_wpm)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id) DO UPDATE SET
                races_completed = $2,
                races_won = $3,
                avg_wpm = $4,
                top_wpm = $5,
                updated_at = NOW()",
            self.id,
            self.stats.races_completed as i32,
            self.stats.races_won as i32,
            self.stats.avg_wpm as f32,
            self.stats.top_wpm as f32
        )
            .execute(db_pool.get_ref())
            .await?;

        Ok(())
    }

    pub async fn get_by_id(id: Uuid, db_pool: &web::Data<DbPool>) -> Result<Self, SqlxError> {
        let user = sqlx::query!(
            "SELECT u.id, u.nickname,
                    s.races_completed, s.races_won, s.avg_wpm, s.top_wpm
             FROM users u
             LEFT JOIN user_stats s ON u.id = s.user_id
             WHERE u.id = $1",
            id
        )
            .fetch_optional(db_pool.get_ref())
            .await?;

        match user {
            Some(u) => Ok(Self {
                id: u.id,
                nickname: u.nickname,
                stats: Statistics {
                    races_completed: u.races_completed as u32,
                    races_won: u.races_won as u32,
                    avg_wpm: u.avg_wpm as f32,
                    top_wpm: u.top_wpm as f32,
                },
            }),
            None => Err(SqlxError::RowNotFound),
        }
    }

    pub async fn update_nickname(user: User, new_nickname: String, db_pool: &web::Data<DbPool>) -> Result<Self, SqlxError> {
        sqlx::query!(
            "UPDATE users SET nickname = $1 WHERE id = $2",
            new_nickname,
            user.id
        )
            .execute(db_pool.get_ref())
            .await?;

        let mut updated_user = user;
        updated_user.nickname = new_nickname;

        // Broadcast nickname update to all parties the user is in
        let mut store = crate::party::PARTY_STORE.lock().unwrap();
        for (_code, party) in store.iter_mut() {
            if party.members.iter().any(|m| m.id == updated_user.id) {

                for member in &mut party.members {
                    if member.id == updated_user.id {
                        member.nickname = updated_user.nickname.clone();
                    }
                }

                let update = crate::party::PartyUpdate {
                    code: party.code.clone(),
                    party_members: party.members.clone(),
                    leader: party.leader,
                    member_colors: party.member_colors.clone(),
                };
                party.broadcast(update);
            }
        }

        Ok(updated_user)
    }

    pub async fn update_stats(&mut self, db_pool: &web::Data<DbPool>) -> Result<(), SqlxError> {
        sqlx::query!(
            "UPDATE user_stats
             SET races_completed = $1, races_won = $2, avg_wpm = $3, top_wpm = $4, updated_at = NOW()
             WHERE user_id = $5",
            self.stats.races_completed as i32,
            self.stats.races_won as i32,
            self.stats.avg_wpm as f32,
            self.stats.top_wpm as f32,
            self.id
        )
            .execute(db_pool.get_ref())
            .await?;

        Ok(())
    }
}