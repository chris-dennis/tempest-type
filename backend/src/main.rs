mod user;
mod party;
mod quotes;

use std::path::Path;
use actix::{Actor, ActorContext, Addr, AsyncContext, Handler, StreamHandler};

use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer, get};
use actix_web_actors::ws;

use actix_cors::Cors;
use std::time::{Duration, Instant};
use serde::{Deserialize};
use ws::Message;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};

use crate::user::User;
use crate::party::{PartyManager, CreateParty, JoinParty, PartyUpdate, StartRace, FinishRace, LeaderboardUpdate, LeaveParty, ResetRace};

struct MyWebSocket {
    hb: Instant,
    user: Option<User>,
    party_manager: Addr<PartyManager>,
    party_code: Option<String>,
}

#[derive(Deserialize)]
struct AuthMessage {
    user: User,
}

#[derive(Deserialize)]
struct UpdateNickname{
    user: User,
    nickname: String,
}

struct AppState {
    party_manager: Addr<PartyManager>,
}

impl Actor for MyWebSocket {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);
    }
}

impl Handler<PartyUpdate> for MyWebSocket {
    type Result = ();

    fn handle(&mut self, msg: PartyUpdate, ctx: &mut Self::Context) {
        self.party_code = Some(msg.code.clone());
        let update = serde_json::json!({
            "type": "partyUpdate",
            "code": msg.code,
            "partyMembers": msg.party_members,
            "leader": msg.leader,
        });

        ctx.text(update.to_string());
    }
}

impl Handler<StartRace> for MyWebSocket {
    type Result = ();


    fn handle(&mut self, msg: StartRace, ctx: &mut Self::Context) {
        let start = serde_json::json!({
            "type": "startRace",
            "prompt": msg.prompt,
            "code": msg.code
        });

        ctx.text(start.to_string());
    }
}

impl Handler<FinishRace> for MyWebSocket {
    type Result = ();

    fn handle(&mut self, _msg: FinishRace, ctx: &mut Self::Context) {
        let start = serde_json::json!({
            "type": "finishRace",
        });

        ctx.text(start.to_string());
    }
}

impl Handler<ResetRace> for MyWebSocket {
    type Result = ();

    fn handle(&mut self, msg: ResetRace, ctx: &mut Self::Context) {
        let reset = serde_json::json!({
            "type": "resetRace",
            "code": msg.code
        });
        ctx.text(reset.to_string());
    }
}

impl Handler<LeaderboardUpdate> for MyWebSocket {
    type Result = ();

    fn handle(&mut self, msg: LeaderboardUpdate, ctx: &mut Self::Context) -> Self::Result {
        let update = serde_json::json!({
            "type": "leaderboardUpdate",
            "code": msg.code,
            "leaderboard": msg.leaderboard.iter().map(|entry| {
                serde_json::json!({
                    "user_id": entry.user,
                    "finish_time": entry.finish_time,
                })
            }).collect::<Vec<_>>(),
        });

        ctx.text(update.to_string());
    }
}


impl StreamHandler<Result<Message, ws::ProtocolError>> for MyWebSocket {
    fn handle(&mut self, msg: Result<Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(Message::Text(text)) => {
                let message: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
                let message_type = message.get("type").and_then(|v| v.as_str());
                match message_type {
                    Some("auth") => {
                        if let Ok(auth_message) = serde_json::from_value::<AuthMessage>(message) {
                            let user = auth_message.user;
                            user.store();
                            self.user = Some(user);
                            println!("User authenticated: {:?}", self.user);
                        }
                    },
                    Some("updateNickname") =>{
                        println!("Update nickname request");
                        if let Ok(update_message) = serde_json::from_value::<UpdateNickname>(message) {
                            let user = update_message.user;
                            let new_nickname = update_message.nickname;

                            if let Ok(updated_user) = User::update_nickname(user, new_nickname) {
                                self.user = Some(updated_user);
                                println!("User nickname updated: {:?}", self.user);
                            } else {
                                println!("Error updating user nickname");
                            }
                        } else{
                            println!("Nickname update failed");
                        }
                    },
                    Some("createParty") => {
                        println!("Create party request");
                        if let Some(user) = &self.user {
                            self.party_manager.do_send(CreateParty {
                                leader: user.id,
                                socket: ctx.address(),
                            });
                        }
                    },
                    Some("joinParty") | Some("rejoinParty") => {
                        println!("Join party request");
                        if let Some(user) = &self.user {
                            if let Some(code) = message.get("code").and_then(|v| v.as_str()) {
                                self.party_manager.do_send(JoinParty {
                                    user_id: user.id,
                                    code: code.to_string(),
                                    socket: ctx.address(),
                                });
                                self.party_code = Some(code.to_string());
                            }
                        }
                    },
                    Some("startRace") => {
                        println!("Race start request");
                        if let Some(_user) = &self.user {
                            if let Some(party_code) = &self.party_code {
                                self.party_manager.do_send(StartRace {
                                    code: party_code.clone(),
                                    prompt: "".to_string(),
                                });
                            }
                        }
                    },
                    Some("finishRace") => {
                        println!("Race completed");
                        if let Some(user) = &self.user {
                            if let Some(party_code) = &self.party_code {
                                if let Some(finish_time) = message.get("time").and_then(|v| v.as_f64()) {
                                    let finish_time_ms = (finish_time) as u64;
                                    self.party_manager.do_send(FinishRace {
                                        user_id: user.id,
                                        finish_time: finish_time_ms,
                                        code: party_code.clone(),
                                    });
                                    println!("Sent race leaderboard update")
                                } else {
                                    println!("Failed to get finish time");
                                }
                            }
                        }
                    },
                    Some("resetRace") => {
                        println!("Reset race request");
                        if let Some(_user) = &self.user {
                            if let Some(party_code) = &self.party_code {
                                self.party_manager.do_send(ResetRace {
                                    code: party_code.clone(),
                                });
                            }
                        }
                    },
                    _ => (),
                }
            },
            Ok(Message::Close(reason)) => {
                println!("Closing connection...");
                if let Some(user) = &self.user {
                    if let Some(party_code) = &self.party_code {
                        self.party_manager.do_send(LeaveParty {
                            user_id: user.id,
                            code: party_code.clone(),
                        });
                    }
                }
                ctx.close(reason);
                ctx.stop();
            }

            Ok(Message::Ping(msg)) => {
                self.hb = Instant::now();
                ctx.pong(&msg);
            }
            Ok(Message::Pong(_)) => {
                self.hb = Instant::now();
            },
            Ok(Message::Binary(bin)) if bin.is_empty() => {
                // Handle binary messages if needed
            },
            _ => {
                println!("Unhandled/unmatched message detected");
            },
        }
    }
}

async fn ws_index(req: HttpRequest, stream: web::Payload, data: web::Data<AppState>) -> Result<HttpResponse, Error> {
    let ws = MyWebSocket { hb: Instant::now(), user: None, party_manager: data.party_manager.clone(), party_code: None };
    println!("Websocket connection established");
    ws::start(ws, &req, stream)
}

impl MyWebSocket {
    fn hb(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(Duration::from_secs(10), |act, ctx| {
            if Instant::now().duration_since(act.hb) > Duration::from_secs(20) {
                println!("WebSocket Client heartbeat failed, disconnecting!");
                ctx.stop();
                return;
            }
            ctx.ping(b"");
        });
    }
}

#[get("/api/users")]
async fn get_or_create_user(req: HttpRequest) -> Result<HttpResponse, Error> {
    match req.cookie("user_id") {
        Some(cookie) => {
            let user = User::from_cookie(cookie.value()).unwrap_or_else(User::new);
            Ok(HttpResponse::Ok().json(user))
        },
        None => {
            let new_user = User::new();
            Ok(HttpResponse::Ok()
                .cookie(new_user.to_cookie())
                .json(new_user))
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("starting HTTP server");
    let party_manager = PartyManager.start();

    let privkey_path = "/etc/letsencrypt/privkey.pem";
    let fullchain_path = "/etc/letsencrypt/fullchain.pem";

    if !Path::new(privkey_path).exists() {
        panic!("Private key file not found at {}", privkey_path);
    }
    if !Path::new(fullchain_path).exists() {
        panic!("Certificate chain file not found at {}", fullchain_path);
    }

    let mut builder = SslAcceptor::mozilla_intermediate(SslMethod::tls()).unwrap();
    builder.set_private_key_file("/etc/letsencrypt/privkey.pem", SslFiletype::PEM)
        .expect("Failed to set private key file");
    builder.set_certificate_chain_file("/etc/letsencrypt/fullchain.pem")
        .expect("Failed to set certificate chain file");


    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header();

        App::new()
            .wrap(cors)
            .app_data(web::Data::new(AppState { party_manager: party_manager.clone() }))
            .route("/ws", web::get().to(ws_index))
            .service(get_or_create_user)

    })
        .bind(("0.0.0.0", 8080))?
        // .bind_openssl("0.0.0.0:8080", builder)?
        .run()
        .await
}