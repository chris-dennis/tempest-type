use actix::{Actor, Addr, Context, Handler, Message};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use rand::seq::SliceRandom;
use uuid::Uuid;
use actix_web::web;
use crate::{get_or_create_user, MyWebSocket, RawMessage};
use crate::user::User;
use crate::quotes::Quotes;
use crate::database::DbPool;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Party {
    pub code: String,
    pub leader: Uuid,
    pub members: Vec<User>,
    #[serde(skip)]
    pub sockets: HashMap<Uuid, Addr<MyWebSocket>>,
    pub finish_times: HashMap<Uuid, u64>,
    #[serde(skip)]
    pub current_prompt_length: Option<usize>,
    pub member_colors: HashMap<String, String>,
}

impl Party {
    pub async fn new(leader: Uuid, socket: Addr<MyWebSocket>, db_pool: &web::Data<DbPool>) -> Result<Self, sqlx::Error> {
        let mut sockets = HashMap::new();
        sockets.insert(leader, socket);

        let leader_user = User::get_by_id(leader, db_pool).await?;
        let mut member_colors = HashMap::new();
        member_colors.insert(leader.to_string(), Self::generate_random_color());

        Ok(Self {
            code: Self::generate_party_code(),
            leader,
            members: vec![leader_user],
            sockets,
            finish_times: HashMap::new(),
            current_prompt_length: None,
            member_colors
        })
    }

    pub fn generate_party_code() -> String {
        use rand::{distributions::Alphanumeric, thread_rng, Rng};
        thread_rng()
            .sample_iter(&Alphanumeric)
            .take(5)
            .map(char::from)
            .collect()
    }

    pub fn generate_random_color() -> String {
        use rand::{thread_rng, Rng};
        let mut rng = thread_rng();

        let r = rng.gen_range(0..=255);
        let g = rng.gen_range(0..=255);
        let b = rng.gen_range(0..=255);

        format!("#{:02X}{:02X}{:02X}", r, g, b)
    }

    pub async fn add_member(&mut self, user_id: Uuid, socket: Addr<MyWebSocket>, db_pool: &web::Data<DbPool>) -> Result<(), sqlx::Error> {
        let user = User::get_by_id(user_id, db_pool).await?;
        self.members.push(user);
        self.sockets.insert(user_id, socket);

        if !self.member_colors.contains_key(&user_id.to_string()) {
            self.member_colors.insert(user_id.to_string(), Self::generate_random_color());
            println!("{:?}", self.member_colors);
        }

        Ok(())
    }

    pub fn remove_member(&mut self, user_id: Uuid) {
        self.members.retain(|member| member.id != user_id);
        self.sockets.remove(&user_id);
        self.member_colors.remove(&user_id.to_string());
    }

    pub fn is_empty(&self) -> bool {
        self.members.is_empty()
    }

    pub fn broadcast(&self, update: PartyUpdate) {
        for socket in self.sockets.values() {
            let _ = socket.do_send(update.clone());
        }
    }

    pub fn broadcast_start_race(&mut self, prompt: &String) {
        self.current_prompt_length = Some(prompt.len());
        self.finish_times.clear();

        for socket in self.sockets.values() {
            let start = StartRace{
                code: self.code.clone(),
                prompt: prompt.clone()
            };
            let _ = socket.do_send(start);
        }
    }

    pub fn broadcast_reset_race(&self, reset: ResetRace) {
        for socket in self.sockets.values() {
            let _ = socket.do_send(reset.clone());
        }
    }

    pub async fn broadcast_finish_race(&mut self, user_id: Uuid, wpm: f64, db_pool: &web::Data<DbPool>) -> Result<(), sqlx::Error> {
        self.finish_times.insert(user_id, wpm as u64);

        let mut leaderboard: Vec<_> = self.finish_times.iter().collect();
        leaderboard.sort_by_key(|&(_, &time)| std::cmp::Reverse(time));

        let mut leaderboard_entries = Vec::new();
        for (&id, &wpm_score) in leaderboard.iter() {
            match User::get_by_id(id, db_pool).await {
                Ok(user) => leaderboard_entries.push(LeaderboardEntry {
                    user: Some(user),
                    wpm: wpm_score as f64,
                }),
                Err(_) => leaderboard_entries.push(LeaderboardEntry {
                    user: None,
                    wpm: wpm_score as f64,
                }),
            }
        }


        let update = LeaderboardUpdate {
            code: self.code.clone(),
            leaderboard: leaderboard_entries,
        };

        for socket in self.sockets.values() {
            let _ = socket.do_send(update.clone());
        }

        Ok(())
    }
}

lazy_static::lazy_static! {
    pub static ref PARTY_STORE: std::sync::Mutex<HashMap<String, Party>> = {
        std::sync::Mutex::new(HashMap::new())
    };
}

pub struct PartyManager {
    pub db_pool: web::Data<DbPool>,
}

impl Actor for PartyManager {
    type Context = Context<Self>;
}

impl PartyManager {
    pub fn new(db_pool: web::Data<DbPool>) -> Self {
        Self { db_pool }
    }
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct CreateParty {
    pub leader: Uuid,
    pub socket: Addr<MyWebSocket>,
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct JoinParty {
    pub user_id: Uuid,
    pub code: String,
    pub socket: Addr<MyWebSocket>,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct PartyUpdate {
    pub code: String,
    pub party_members: Vec<User>,
    pub leader: Uuid,
    pub member_colors: HashMap<String, String>,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct StartRace {
    pub code: String,
    pub prompt: String,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct FinishRace {
    pub user_id: Uuid,
    pub wpm: f64,
    pub code: String,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct ResetRace {
    pub code: String,
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
    pub wpm: f64,
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct LeaveParty {
    pub user_id: Uuid,
    pub code: String,
}

#[derive(Message, Serialize, Clone)]
#[rtype(result = "()")]
pub struct StatsUpdate {
    pub user: User,
}


impl Handler<LeaveParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: LeaveParty, _: &mut Self::Context) {
        let mut store = PARTY_STORE.lock().unwrap();
        if let Some(party) = store.get_mut(&msg.code) {
            party.remove_member(msg.user_id);
            let members_colors = party.member_colors.clone();
            if party.is_empty() {
                store.remove(&msg.code);
            } else {
                if party.leader == msg.user_id && !party.members.is_empty() {
                    party.leader = party.members[0].id;
                }
                let update = PartyUpdate {
                    code: msg.code.clone(),
                    party_members: party.members.clone(),
                    leader: party.leader,
                    member_colors: members_colors,
                };
                party.broadcast(update);
            }
        }
    }
}

impl Handler<CreateParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: CreateParty, _: &mut Self::Context) {
        let db_pool = self.db_pool.clone();
        let socket_clone = msg.socket.clone();
        let leader_id = msg.leader;

        let future = async move {
            match Party::new(leader_id, msg.socket, &db_pool).await {
                Ok(party) => {
                    let code = party.code.clone();
                    let leader = party.leader;
                    let members_clone = party.members.clone();
                    let members_colors = party.member_colors.clone();
                    let mut store = PARTY_STORE.lock().unwrap();
                    store.insert(code.clone(), party);

                    let update = PartyUpdate {
                        code: code.clone(),
                        party_members: members_clone,
                        leader,
                        member_colors: members_colors,
                    };

                    socket_clone.do_send(update.clone());

                    if let Some(party) = store.get(&code) {
                        party.broadcast(update);
                    }
                },
                Err(e) => {
                    eprintln!("Error creating party: {:?}", e);
                }
            }
        };

        actix::spawn(future);
    }
}

impl Handler<JoinParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: JoinParty, _: &mut Self::Context) {
        let db_pool = self.db_pool.clone();
        let code = msg.code.clone();
        let user_id = msg.user_id;
        let socket_clone = msg.socket.clone();

        let future = async move {
            let mut store = PARTY_STORE.lock().unwrap();

            if let Some(party) = store.get_mut(&code) {
                if !party.member_colors.contains_key(&user_id.to_string()) {
                    party.member_colors.insert(user_id.to_string(), Party::generate_random_color());
                }
                match party.add_member(user_id, msg.socket, &db_pool).await {
                    Ok(_) => {
                        let members_colors = party.member_colors.clone();
                        let update = PartyUpdate {
                            code: code.clone(),
                            party_members: party.members.clone(),
                            leader: party.leader,
                            member_colors: members_colors,
                        };

                        party.broadcast(update);
                    },
                    Err(e) => {
                        eprintln!("Error adding member to party: {:?}", e);
                    }
                }
            } else {
                match Party::new(user_id, msg.socket, &db_pool).await {
                    Ok(mut new_party) => {
                        new_party.code = code.clone();

                        store.insert(code.clone(), new_party);

                        if let Some(party) = store.get(&code) {
                            let members_colors = party.member_colors.clone();
                            let update = PartyUpdate {
                                code: code.clone(),
                                party_members: party.members.clone(),
                                leader: user_id,
                                member_colors: members_colors,
                            };

                            socket_clone.do_send(update.clone());
                            party.broadcast(update);
                        }
                    },
                    Err(e) => {
                        eprintln!("Error creating new party: {:?}", e);
                    }
                }
            }
        };

        actix::spawn(future);
    }
}

impl Handler<StartRace> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: StartRace, _: &mut Self::Context) {
        let mut store = PARTY_STORE.lock().unwrap();
        if let Some(party) = store.get_mut(&msg.code) {
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

    fn handle(&mut self, msg: FinishRace, _: &mut Self::Context) {
        let db_pool = self.db_pool.clone();
        let user_id = msg.user_id;
        let wpm = msg.wpm;

        let future = async move {
            let mut store = PARTY_STORE.lock().unwrap();

            let party_code = store.iter().find_map(|(code, party)| {
                if party.sockets.contains_key(&user_id) {
                    Some(code.clone())
                } else {
                    None
                }
            });

            if let Some(code) = party_code {
                if let Some(party) = store.get_mut(&code) {
                    if let Err(e) = party.broadcast_finish_race(user_id, wpm, &db_pool).await {
                        eprintln!("Error in broadcast_finish_race: {:?}", e);
                    }

                    // Fetch the user and update their stats
                    match User::get_by_id(user_id, &db_pool).await {
                        Ok(mut user) => {
                            user.stats.races_completed += 1;


                            // Update avg_wpm (rolling average)
                            let total_races = user.stats.races_completed as f32;
                            user.stats.avg_wpm = ((user.stats.avg_wpm * (total_races - 1.0)) + wpm as f32) / total_races;

                            // Update top_wpm if this race was better
                            if wpm as f32 > user.stats.top_wpm {
                                user.stats.top_wpm = wpm as f32;
                            }

                            // Check if user is the winner (highest WPM)
                            let is_winner = party.finish_times.values()
                                .all(|&other_wpm| wpm >= other_wpm as f64);

                            if is_winner {
                                user.stats.races_won += 1;
                            }

                            if let Err(e) = user.update_stats(&db_pool).await {
                                eprintln!("Error updating user stats: {:?}", e);
                            }

                            // Send stats update back to user
                            if let Some(socket) = party.sockets.get(&user_id) {
                                let updated_user = User::get_by_id(user_id, &db_pool).await.ok();
                                if let Some(user_data) = updated_user {
                                    let stats_update = serde_json::json!({
                                        "type": "statsUpdate",
                                        "user": user_data
                                    });
                                    socket.do_send(RawMessage(stats_update.to_string()));
                                }
                            }
                        },
                        Err(e) => {
                            eprintln!("Error fetching user {}: {:?}", user_id, e);
                        }
                    }
                }
            }
        };

        actix::spawn(future);
    }
}

impl Handler<ResetRace> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: ResetRace, _: &mut Self::Context) {
        let mut store = PARTY_STORE.lock().unwrap();
        if let Some(party) = store.get_mut(&msg.code) {
            party.finish_times.clear();

            let reset = ResetRace {
                code: msg.code.clone(),
            };

            party.broadcast_reset_race(reset);
        }
    }
}