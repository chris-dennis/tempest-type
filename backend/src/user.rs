use std::collections::HashMap;
use uuid::Uuid;
use actix_web::cookie::{Cookie, SameSite};
use serde::{Serialize, Deserialize};

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

lazy_static::lazy_static! {
    pub static ref USER_STORE: std::sync::Mutex<HashMap<Uuid, User>> = {
        std::sync::Mutex::new(HashMap::new())
    };
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
            .finish()
    }

    pub fn store(&self) {
        let mut store = USER_STORE.lock().unwrap();
        store.insert(self.id, self.clone());
    }

    pub fn get_by_id(uuid: Uuid) -> Option<User> {
        let store = USER_STORE.lock().unwrap();
        store.get(&uuid).cloned()
    }

    pub fn update_nickname(user: User, new_nickname: String) -> Result<User, String> {
        let user_id = user.id;
        let mut store = USER_STORE.lock().unwrap();
        if let Some(user) = store.get_mut(&user_id) {
            user.nickname = new_nickname;
            Ok(user.clone())
        } else {
            Err(format!("User with id: {} not found", user_id))
        }
    }
}
