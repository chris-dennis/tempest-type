use actix::{Actor, Addr, Context, Handler, Message};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use rand::seq::SliceRandom;
use uuid::Uuid;
use actix_web::web;
use sqlx::Error as SqlxError;
use crate::MyWebSocket;
use crate::user::{User, Statistics};
use crate::quotes::Quotes;
use crate::database::DbPool;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Party {
    pub code: String,
    pub leader: Uuid,
    pub members: Vec<Option<User>>,
    #[serde(skip)]
    pub sockets: HashMap<Uuid, Addr<MyWebSocket>>,
    pub finish_times: HashMap<Uuid, u64>,
}

impl Party {
    pub fn new(leader: Uuid, socket: Addr<MyWebSocket>) -> Self {
        let mut sockets = HashMap::new();
        sockets.insert(leader, socket);

        Self {
            code: Self::generate_party_code(),
            leader,
            members: Vec::new(), // Will be populated after loading from DB
            sockets,
            finish_times: HashMap::new(),
        }
    }

    pub fn generate_party_code() -> String {
        use rand::{distributions::Alphanumeric, thread_rng, Rng};
        thread_rng()
            .sample_iter(&Alphanumeric)
            .take(5)
            .map(char::from)
            .collect()
    }

    pub fn add_member(&mut self, user_id: Uuid, socket: Addr<MyWebSocket>) {
        // Members list will be loaded from DB
        self.sockets.insert(user_id, socket);
    }

    pub fn remove_member(&mut self, user_id: Uuid) {
        self.members.retain(|member| member.as_ref().map(|u| u.id) != Some(user_id));
        self.sockets.remove(&user_id);
    }

    pub fn is_empty(&self) -> bool {
        self.members.is_empty()
    }

    pub fn broadcast(&self, update: PartyUpdate) {
        for socket in self.sockets.values() {
            let _ = socket.do_send(update.clone());
        }
    }

    pub fn broadcast_start_race(&self, prompt: &String) {
        for socket in self.sockets.values() {
            let start = StartRace{
                code: self.code.clone(),
                prompt: prompt.clone(),
                db_pool: None, // Already handled
            };
            let _ = socket.do_send(start);
        }
    }

    pub fn broadcast_reset_race(&self, reset: ResetRace) {
        for socket in self.sockets.values() {
            let mut reset_clone = reset.clone();
            reset_clone.db_pool = None; // Already handled
            let _ = socket.do_send(reset_clone);
        }
    }

    pub fn broadcast_finish_race(&mut self, user_id: Uuid, finish_time: u64) {
        self.finish_times.insert(user_id, finish_time);

        let mut leaderboard: Vec<_> = self.finish_times.iter().collect();
        leaderboard.sort_by_key(|&(_, &time)| time);

        let update = LeaderboardUpdate {
            code: self.code.clone(),
            leaderboard: leaderboard.iter().map(|(&id, &time)| {
                let user = self.members.iter()
                    .find_map(|m| m.as_ref().filter(|u| u.id == id).cloned());

                LeaderboardEntry {
                    user,
                    finish_time: time,
                }
            }).collect(),
        };

        for socket in self.sockets.values() {
            let _ = socket.do_send(update.clone());
        }
    }

    pub async fn load_members(&mut self, db_pool: &web::Data<DbPool>) -> Result<(), SqlxError> {
        // Get all party members
        let members = sqlx::query!(
            "SELECT u.id, u.nickname,
                    s.races_completed, s.races_won, s.avg_wpm, s.top_wpm
             FROM party_members pm
             JOIN users u ON pm.user_id = u.id
             LEFT JOIN user_stats s ON u.id = s.user_id
             WHERE pm.party_code = $1",
            self.code
        )
            .fetch_all(db_pool.get_ref())
            .await?;

        // Convert to User objects
        self.members = members
            .into_iter()
            .map(|m| Some(User {
                id: m.id,
                nickname: m.nickname,
                stats: Statistics {
                    races_completed: m.races_completed as u32,
                    races_won: m.races_won as u32,
                    avg_wpm: m.avg_wpm as f32,
                    top_wpm: m.top_wpm as f32,
                },
            }))
            .collect();

        Ok(())
    }
}

// Keep in-memory party store for active connections
lazy_static::lazy_static! {
    pub static ref PARTY_STORE: std::sync::Mutex<HashMap<String, Party>> = {
        std::sync::Mutex::new(HashMap::new())
    };
}

pub struct PartyManager {
    db_pool: Option<web::Data<DbPool>>,
}

impl PartyManager {
    pub fn new(db_pool: web::Data<DbPool>) -> Self {
        Self { db_pool: Some(db_pool) }
    }
}

impl Actor for PartyManager {
    type Context = Context<Self>;
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct CreateParty {
    pub leader: Uuid,
    pub socket: Addr<MyWebSocket>,
    pub db_pool: web::Data<DbPool>,
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct JoinParty {
    pub user_id: Uuid,
    pub code: String,
    pub socket: Addr<MyWebSocket>,
    pub db_pool: web::Data<DbPool>,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct PartyUpdate {
    pub code: String,
    pub party_members: Vec<Option<User>>,
    pub leader: Uuid
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct StartRace {
    pub code: String,
    pub prompt: String,
    #[serde(skip)]
    pub db_pool: Option<web::Data<DbPool>>,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct FinishRace {
    pub user_id: Uuid,
    pub finish_time: u64,
    pub code: String,
    #[serde(skip)]
    pub db_pool: web::Data<DbPool>,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct ResetRace {
    pub code: String,
    #[serde(skip)]
    pub db_pool: Option<web::Data<DbPool>>,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct LeaderboardUpdate {
    pub code: String,
    pub leaderboard: Vec<LeaderboardEntry>,
}

#[derive(Serialize, Clone)]
pub struct LeaderboardEntry {
    pub user: Option<User>,
    pub finish_time: u64,
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct LeaveParty {
    pub user_id: Uuid,
    pub code: String,
    pub db_pool: web::Data<DbPool>,
}

impl Handler<LeaveParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: LeaveParty, _: &mut Self::Context) -> Self::Result {
        let db_pool = msg.db_pool.clone();
        let user_id = msg.user_id;
        let code = msg.code.clone();

        // Handle in-memory state first
        let mut store = PARTY_STORE.lock().unwrap();
        if let Some(party) = store.get_mut(&msg.code) {
            party.remove_member(msg.user_id);

            if party.is_empty() {
                store.remove(&msg.code);
            } else {
                let update = PartyUpdate {
                    code: msg.code.clone(),
                    party_members: party.members.clone(),
                    leader: party.leader
                };
                party.broadcast(update);
            }
        }

        // Update database asynchronously
        actix::spawn(async move {
            // Remove member from party in database
            if let Err(e) = sqlx::query!(
                "DELETE FROM party_members WHERE party_code = $1 AND user_id = $2",
                code,
                user_id
            )
                .execute(db_pool.get_ref())
                .await {
                println!("Error removing member from party: {:?}", e);
                return;
            }

            // Check if party is empty
            let count_result = sqlx::query!(
                "SELECT COUNT(*) as count FROM party_members WHERE party_code = $1",
                code
            )
                .fetch_one(db_pool.get_ref())
                .await;

            if let Ok(count) = count_result {
                if count.count.unwrap_or(0) == 0 {
                    // Delete the party if empty
                    if let Err(e) = sqlx::query!("DELETE FROM parties WHERE code = $1", code)
                        .execute(db_pool.get_ref())
                        .await {
                        println!("Error deleting empty party: {:?}", e);
                    }
                }
            }
        });
    }
}

impl Handler<CreateParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: CreateParty, _: &mut Self::Context) -> Self::Result {
        let db_pool = msg.db_pool.clone();
        let socket = msg.socket.clone();
        let leader = msg.leader;

        // Create party in memory
        let party = Party::new(leader, socket.clone());
        let code = party.code.clone();

        // Store in memory
        {
            let mut store = PARTY_STORE.lock().unwrap();
            store.insert(code.clone(), party);
        }

        // Store in database asynchronously
        actix::spawn(async move {
            // Create party record
            if let Err(e) = sqlx::query!(
                "INSERT INTO parties (code, leader_id) VALUES ($1, $2)",
                code,
                leader
            )
                .execute(db_pool.get_ref())
                .await {
                println!("Error creating party: {:?}", e);
                return;
            }

            // Add leader as party member
            if let Err(e) = sqlx::query!(
                "INSERT INTO party_members (party_code, user_id) VALUES ($1, $2)",
                code,
                leader
            )
                .execute(db_pool.get_ref())
                .await {
                println!("Error adding leader as party member: {:?}", e);
                return;
            }

            // Get user info for response
            if let Ok(user) = User::get_by_id(leader, &db_pool).await {
                let update = PartyUpdate {
                    code: code.clone(),
                    party_members: vec![Some(user.clone())],
                    leader
                };

                socket.do_send(update);

                // Update in-memory party with member info
                let mut store = PARTY_STORE.lock().unwrap();
                if let Some(party) = store.get_mut(&code) {
                    party.members = vec![Some(user)];
                }
            }
        });
    }
}

impl Handler<JoinParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: JoinParty, _: &mut Self::Context) -> Self::Result {
        let db_pool = msg.db_pool.clone();
        let user_id = msg.user_id;
        let code = msg.code.clone();
        let socket = msg.socket.clone();

        let mut store = PARTY_STORE.lock().unwrap();

        if let Some(party) = store.get_mut(&msg.code) {
            // Add to existing party in memory
            party.add_member(msg.user_id, msg.socket.clone());

            actix::spawn(async move {
                // Add member to party in database
                if let Err(e) = sqlx::query!(
                    "INSERT INTO party_members (party_code, user_id)
                     VALUES ($1, $2)
                     ON CONFLICT (party_code, user_id) DO NOTHING",
                    code,
                    user_id
                )
                    .execute(db_pool.get_ref())
                    .await {
                    println!("Error adding member to party: {:?}", e);
                    return;
                }

                // Reload party members from database
                let members_result = sqlx::query!(
                    "SELECT u.id, u.nickname,
                            s.races_completed, s.races_won, s.avg_wpm, s.top_wpm
                     FROM party_members pm
                     JOIN users u ON pm.user_id = u.id
                     LEFT JOIN user_stats s ON u.id = s.user_id
                     WHERE pm.party_code = $1",
                    code
                )
                    .fetch_all(db_pool.get_ref())
                    .await;

                if let Ok(members) = members_result {
                    let member_users: Vec<Option<User>> = members
                        .into_iter()
                        .map(|m| Some(User {
                            id: m.id,
                            nickname: m.nickname,
                            stats: Statistics {
                                races_completed: m.races_completed as u32,
                                races_won: m.races_won as u32,
                                avg_wpm: m.avg_wpm as f32,
                                top_wpm: m.top_wpm as f32,
                            },
                        }))
                        .collect();

                    // Get party leader
                    let leader_result = sqlx::query!(
                        "SELECT leader_id FROM parties WHERE code = $1",
                        code
                    )
                        .fetch_one(db_pool.get_ref())
                        .await;

                    if let Ok(leader_row) = leader_result {
                        let leader_id = leader_row.leader_id;

                        let update = PartyUpdate {
                            code: code.clone(),
                            party_members: member_users.clone(),
                            leader: leader_id
                        };

                        // Update in-memory party
                        {
                            let mut store = PARTY_STORE.lock().unwrap();
                            if let Some(party) = store.get_mut(&code) {
                                party.members = member_users;
                                party.broadcast(update);
                            }
                        }
                    }
                }
            });
        }
        else {
            // Create new party
            let new_party = Party::new(msg.user_id, msg.socket.clone());
            let new_code = msg.code.clone();
            store.insert(new_code.clone(), new_party);

            actix::spawn(async move {
                // Create party in database
                if let Err(e) = sqlx::query!(
                    "INSERT INTO parties (code, leader_id) VALUES ($1, $2)
                     ON CONFLICT (code) DO UPDATE SET leader_id = $2",
                    code,
                    user_id
                )
                    .execute(db_pool.get_ref())
                    .await {
                    println!("Error creating party: {:?}", e);
                    return;
                }

                // Add user as party member
                if let Err(e) = sqlx::query!(
                    "INSERT INTO party_members (party_code, user_id)
                     VALUES ($1, $2)
                     ON CONFLICT (party_code, user_id) DO NOTHING",
                    code,
                    user_id
                )
                    .execute(db_pool.get_ref())
                    .await {
                    println!("Error adding member to party: {:?}", e);
                    return;
                }

                // Get user info
                if let Ok(user) = User::get_by_id(user_id, &db_pool).await {
                    let update = PartyUpdate {
                        code: code.clone(),
                        party_members: vec![Some(user.clone())],
                        leader: user_id
                    };

                    socket.do_send(update.clone());

                    // Update in-memory party with member info
                    {
                        let mut store = PARTY_STORE.lock().unwrap();
                        if let Some(party) = store.get_mut(&code) {
                            party.members = vec![Some(user)];
                            party.broadcast(update);
                        }
                    }
                }
            });
        }
    }
}

impl Handler<StartRace> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: StartRace, _: &mut Self::Context) -> Self::Result {
        let store = PARTY_STORE.lock().unwrap();
        if let Some(party) = store.get(&msg.code) {
            let quotes = Quotes::load_quotes();
            if let Some(random_quote) = quotes.choose(&mut rand::thread_rng()) {
                let prompt = &random_quote.text;
                party.broadcast_start_race(prompt);
            }
        }
    }
}

impl Handler<FinishRace> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: FinishRace, _: &mut Self::Context) -> Self::Result {
        let db_pool = msg.db_pool.clone();
        let user_id = msg.user_id;
        let finish_time = msg.finish_time;
        let code = msg.code.clone();

        // Update in-memory state
        let mut store = PARTY_STORE.lock().unwrap();
        for party in store.values_mut() {
            if party.sockets.contains_key(&msg.user_id) {
                party.broadcast_finish_race(msg.user_id, msg.finish_time);
            }
        }

        // Store race result in database
        actix::spawn(async move {
            if let Err(e) = sqlx::query!(
                "INSERT INTO race_results (party_code, user_id, wpm, finish_time)
                 VALUES ($1, $2, $3, $4)",
                code,
                user_id,
                finish_time as f64,
                finish_time as i64
            )
                .execute(db_pool.get_ref())
                .await {
                println!("Error recording race result: {:?}", e);
            }

            // Update user stats
            if let Ok(mut user) = User::get_by_id(user_id, &db_pool).await {
                user.stats.races_completed += 1;

                // Update top_wpm if this race was better
                if finish_time as f32 > user.stats.top_wpm {
                    user.stats.top_wpm = finish_time as f32;
                }

                // Update average WPM
                let old_total = user.stats.avg_wpm * (user.stats.races_completed as f32 - 1.0);
                user.stats.avg_wpm = (old_total + finish_time as f32) / user.stats.races_completed as f32;

                // Save updated stats
                if let Err(e) = user.update_stats(&db_pool).await {
                    println!("Error updating user stats: {:?}", e);
                }
            }
        });
    }
}

impl Handler<ResetRace> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: ResetRace, _: &mut Self::Context) -> Self::Result {
        let mut store = PARTY_STORE.lock().unwrap();
        if let Some(party) = store.get_mut(&msg.code) {
            party.finish_times.clear();

            let reset = ResetRace {
                code: msg.code.clone(),
                db_pool: None, // Already handled
            };
            party.broadcast_reset_race(reset);
        }
    }
}