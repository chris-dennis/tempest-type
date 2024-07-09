use actix::{Actor, Addr, Context, Handler, Message};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use rand::seq::SliceRandom;
use uuid::Uuid;
use crate::MyWebSocket;
use crate::user::User;
use crate::quotes::Quotes;

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
            members: vec![User::get_by_id(leader)],
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
        self.members.push(User::get_by_id(user_id));
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
    pub fn broadcast_finish_race(&mut self, user_id: Uuid, finish_time: u64) {
        self.finish_times.insert(user_id, finish_time);

        let mut leaderboard: Vec<_> = self.finish_times.iter().collect();
        leaderboard.sort_by_key(|&(_, &time)| time);

        let update = LeaderboardUpdate {
            code: self.code.clone(),
            leaderboard: leaderboard.iter().map(|(&id, &time)| LeaderboardEntry {
                user: User::get_by_id(id),
                finish_time: time,
            }).collect(),
        };

        for socket in self.sockets.values() {
            let _ = socket.do_send(update.clone());
        }
    }

}

lazy_static::lazy_static! {
    pub static ref PARTY_STORE: std::sync::Mutex<HashMap<String, Party>> = {
        std::sync::Mutex::new(HashMap::new())
    };
}


pub struct PartyManager;

impl Actor for PartyManager {
    type Context = Context<Self>;
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
    pub party_members: Vec<Option<User>>,
    pub leader: Uuid
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
    pub finish_time: u64,
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
    pub finish_time: u64,
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct LeaveParty {
    pub user_id: Uuid,
    pub code: String,
}

impl Handler<LeaveParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: LeaveParty, _: &mut Self::Context) {
        let mut store = PARTY_STORE.lock().unwrap();
        if let Some(party) = store.get_mut(&msg.code) {
            party.remove_member(msg.user_id);
            if party.is_empty() {
                store.remove(&msg.code);
            } else {
                let update = PartyUpdate {
                    code: msg.code.clone(),
                    party_members: party.members.clone(),
                    leader: msg.user_id
                };
                party.broadcast(update);
            }
        }
    }
}

impl Handler<CreateParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: CreateParty, _: &mut Self::Context) {
        let mut store = PARTY_STORE.lock().unwrap();
        let party = Party::new(msg.leader, msg.socket.clone());
        let code = party.code.clone();
        store.insert(code.clone(), party);

        let update = PartyUpdate {
            code: code.clone(),
            party_members: vec![User::get_by_id(msg.leader)],
            leader: msg.leader
        };

        msg.socket.do_send(update.clone());

        store.get(&code).unwrap().broadcast(update);
    }
}

impl Handler<JoinParty> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: JoinParty, _: &mut Self::Context) {
        let mut store = PARTY_STORE.lock().unwrap();
        if let Some(party) = store.get_mut(&msg.code) {
            party.add_member(msg.user_id, msg.socket.clone());

            let update = PartyUpdate {
                code: msg.code.clone(),
                party_members: party.members.clone(),
                leader: party.leader

            };

            party.broadcast(update);
        }
        else {
            println!("No party found");
            let new_party = Party::new(msg.user_id, msg.socket.clone());
            let new_code = msg.code;
            store.insert(new_code.clone(), new_party);

            let update = PartyUpdate {
                code: new_code.clone(),
                party_members: vec![User::get_by_id(msg.user_id)],
                leader: msg.user_id

            };

            msg.socket.do_send(update.clone());

            store.get(&new_code).unwrap().broadcast(update);
        }
    }
}

impl Handler<StartRace> for PartyManager {
    type Result = ();

    fn handle(&mut self, msg: StartRace, _: &mut Self::Context) {
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

    fn handle(&mut self, msg: FinishRace, _: &mut Self::Context) {
        let mut store = PARTY_STORE.lock().unwrap();
        for party in store.values_mut() {
            if party.sockets.contains_key(&msg.user_id) {
                party.broadcast_finish_race(msg.user_id, msg.finish_time);
            }
        }
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