mod user;
mod party;
mod quotes;
mod database;

// use std::env;
// use std::fs::File;
// use std::io::BufReader;
// use std::path::Path;
use actix::{Actor, ActorContext, Addr, AsyncContext, Handler, StreamHandler};

use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer, get};
use actix_web_actors::ws;

use actix_cors::Cors;
use std::time::{Duration, Instant};
use dotenv::dotenv;
use rand::prelude::SliceRandom;
use serde::{Deserialize, Serialize};
use ws::Message;

use crate::user::User;
use crate::party::{PartyManager, CreateParty, JoinParty, PartyUpdate, StartRace, FinishRace, LeaderboardUpdate, LeaveParty, ResetRace, StatsUpdate};
use crate::database::DbPool;

struct MyWebSocket {
    hb: Instant,
    user: Option<User>,
    party_manager: Addr<PartyManager>,
    party_code: Option<String>,
    db_pool: web::Data<DbPool>,
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

#[derive(Serialize)]
struct RaceResultResponse {
    id: uuid::Uuid,
    nickname: String,
    wpm: f32,
    party_code: Option<String>,
    completed_at: String,
}

struct AppState {
    party_manager: Addr<PartyManager>,
    db_pool: DbPool,
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
            "member_colors": msg.member_colors,
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

impl Handler<StatsUpdate> for MyWebSocket {
    type Result = ();

    fn handle(&mut self, msg: StatsUpdate, ctx: &mut Self::Context) {
        let update = serde_json::json!({
            "type": "statsUpdate",
            "user": msg.user
        });

        ctx.text(update.to_string());
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
                    "user": entry.user,
                    "wpm": entry.wpm,
                })
            }).collect::<Vec<_>>(),
        });

        ctx.text(update.to_string());
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for MyWebSocket {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(Message::Text(text)) => {
                let message: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
                let message_type = message.get("type").and_then(|v| v.as_str());
                match message_type {
                    Some("auth") => {
                        if let Ok(auth_message) = serde_json::from_value::<AuthMessage>(message) {
                            let user = auth_message.user;
                            let db_pool = self.db_pool.clone();
                            let ctx_addr = ctx.address();

                            // Task to store user in database
                            actix::spawn(async move {
                                if let Err(e) = user.store(&db_pool).await {
                                    println!("Error storing user: {:?}", e);
                                    return;
                                }

                                // Try to get the user with full info from DB
                                match User::get_by_id(user.id, &db_pool).await {
                                    Ok(db_user) => {
                                        // Send user back to websocket
                                        ctx_addr.do_send(UserAuthenticated { user: db_user });
                                        let success_msg = serde_json::json!({
                                            "type": "authSuccess"
                                        });
                                        ctx_addr.do_send(RawMessage(success_msg.to_string()));
                                    },
                                    Err(e) => {
                                        println!("Error retrieving user from DB: {:?}", e);
                                    }
                                }
                            });
                        }
                    },
                    Some("updateNickname") => {
                        println!("Update nickname request");
                        if let Ok(update_message) = serde_json::from_value::<UpdateNickname>(message) {
                            let user = update_message.user;
                            let new_nickname = update_message.nickname;
                            let db_pool = self.db_pool.clone();
                            let ctx_addr = ctx.address();

                            actix::spawn(async move {
                                match User::update_nickname(user, new_nickname, &db_pool).await {
                                    Ok(updated_user) => {
                                        ctx_addr.do_send(UserAuthenticated { user: updated_user });
                                    },
                                    Err(e) => {
                                        println!("Error updating nickname: {:?}", e);
                                    }
                                }
                            });
                        } else {
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
                                // Get a random prompt from quotes
                                use crate::quotes::Quotes;
                                let quotes = Quotes::load_quotes();
                                if let Some(random_quote) = quotes.choose(&mut rand::thread_rng()) {
                                    let prompt = random_quote.text.clone();
                                    self.party_manager.do_send(StartRace {
                                        code: party_code.clone(),
                                        prompt,
                                    });
                                }
                            }
                        }
                    },
                    Some("finishRace") => {
                        println!("Race completed");
                        if let Some(user) = &self.user {
                            if let Some(party_code) = &self.party_code {
                                if let Some(wpm) = message.get("wpm").and_then(|v| v.as_f64()) {
                                    self.party_manager.do_send(FinishRace {
                                        user_id: user.id,
                                        wpm,
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
            },
            _ => {
                println!("Unhandled/unmatched message detected");
            },
        }
    }
}

#[derive(actix::Message)]
#[rtype(result = "()")]
struct RawMessage(String);

impl Handler<RawMessage> for MyWebSocket {
    type Result = ();

    fn handle(&mut self, msg: RawMessage, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

#[derive(actix::Message)]
#[rtype(result = "()")]
struct UserAuthenticated {
    user: User,
}

impl Handler<UserAuthenticated> for MyWebSocket {
    type Result = ();

    fn handle(&mut self, msg: UserAuthenticated, _ctx: &mut Self::Context) -> Self::Result {
        self.user = Some(msg.user);
        println!("User authenticated: {:?}", self.user);
    }
}

async fn ws_index(req: HttpRequest, stream: web::Payload, data: web::Data<AppState>) -> Result<HttpResponse, Error> {
    println!("WebSocket connection request received");

    if let Some(cookie) = req.cookie("user_id") {
        println!("WebSocket request includes user_id cookie: {}", cookie.value());
    } else {
        println!("WebSocket request has no user_id cookie");
    }

    let ws = MyWebSocket {
        hb: Instant::now(),
        user: None,
        party_manager: data.party_manager.clone(),
        party_code: None,
        db_pool: web::Data::new(data.db_pool.clone()),
    };

    println!("Starting WebSocket connection");
    let resp = ws::start(ws, &req, stream)?;
    Ok(resp)
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
async fn get_or_create_user(req: HttpRequest, db_pool: web::Data<DbPool>) -> Result<HttpResponse, Error> {
    match req.cookie("user_id") {
        Some(cookie) => {
            println!("Found user_id cookie: {}", cookie.value());
            if let Some(user) = User::from_cookie(cookie.value()) {
                println!("Parsed user from cookie with ID: {}", user.id);

                // Check if user exists in DB
                match User::get_by_id(user.id, &db_pool).await {
                    Ok(db_user) => {
                        println!("Found user in database: {}", db_user.id);
                        Ok(HttpResponse::Ok()
                            .cookie(db_user.to_cookie())
                            .json(db_user))
                    },
                    Err(e) => {
                        println!("User not found in DB: {:?}, creating new entry", e);
                        // User not in DB, store it
                        if let Err(e) = user.store(&db_pool).await {
                            println!("Error storing user: {:?}", e);
                        }
                        Ok(HttpResponse::Ok()
                            .cookie(user.to_cookie())
                            .json(user))
                    }
                }
            } else {
                println!("Failed to parse user from cookie, creating new user");
                // Invalid cookie, create new user
                let new_user = User::new();
                if let Err(e) = new_user.store(&db_pool).await {
                    println!("Error storing new user: {:?}", e);
                }
                Ok(HttpResponse::Ok()
                    .cookie(new_user.to_cookie())
                    .json(new_user))
            }
        },
        None => {
            println!("No user_id cookie found, creating new user");
            let new_user = User::new();
            if let Err(e) = new_user.store(&db_pool).await {
                println!("Error storing new user: {:?}", e);
            }
            Ok(HttpResponse::Ok()
                .cookie(new_user.to_cookie())
                .json(new_user))
        }
    }
}

#[get("/api/race-results")]
async fn get_race_results(db_pool: web::Data<DbPool>) -> Result<HttpResponse, Error> {
    match fetch_race_results(&db_pool).await {
        Ok(results) => Ok(HttpResponse::Ok().json(results)),
        Err(e) => {
            eprintln!("Error fetching race results: {:?}", e);
            Ok(HttpResponse::InternalServerError().json(
                serde_json::json!({"error": "Failed to fetch race results"})
            ))
        }
    }
}

async fn fetch_race_results(db_pool: &web::Data<DbPool>) -> Result<Vec<RaceResultResponse>, sqlx::Error> {
    let results = sqlx::query!(
        r#"
        SELECT r.id, r.party_code, r.user_id, r.wpm, r.completed_at, u.nickname
        FROM race_results r
        LEFT JOIN users u ON r.user_id = u.id
        ORDER BY r.wpm DESC
        LIMIT 100
        "#
    )
        .fetch_all(db_pool.get_ref())
        .await?;

    Ok(results
        .into_iter()
        .map(|row| RaceResultResponse {
            id: row.id,
            nickname: row.nickname,
            wpm: row.wpm as f32,
            party_code: row.party_code,
            completed_at: row.completed_at.to_rfc3339(),
        })
        .collect())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("starting HTTP server");

    let db_pool = database::initialize_pool()
        .await
        .expect("Failed to create database pool");

    let party_manager = PartyManager::new(web::Data::new(db_pool.clone())).start();
    // dotenv().ok();

    // let privkey_path = env::var("PRIVKEY_PATH").expect("PRIVKEY_PATH must be set");
    // let fullchain_path = env::var("PEMKEY_PATH").expect("PEMKEY_PATH must be set");
    //
    // env::set_var("RUST_BACKTRACE", "full");
    //
    // if !Path::new(privkey_path).exists() {
    //     panic!("Private key file not found at {}", privkey_path);
    // }
    // if !Path::new(fullchain_path).exists() {
    //     panic!("Certificate chain file not found at {}", fullchain_path);
    // }
    //
    // let mut certs_file = BufReader::new(File::open(fullchain_path).unwrap());
    // let mut key_file = BufReader::new(File::open(privkey_path).unwrap());
    //
    // let tls_certs = rustls_pemfile::certs(&mut certs_file)
    //     .collect::<Result<Vec<_>, _>>()
    //     .unwrap();
    // let tls_key = rustls_pemfile::pkcs8_private_keys(&mut key_file)
    //     .next()
    //     .unwrap()
    //     .unwrap();
    //
    // let tls_config = rustls::ServerConfig::builder()
    //     .with_no_client_auth()
    //     .with_single_cert(tls_certs, rustls::pki_types::PrivateKeyDer::Pkcs8(tls_key))
    //     .unwrap();

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .expose_headers(vec!["Set-Cookie"])
            .supports_credentials();

        App::new()
            .wrap(cors)
            .app_data(web::Data::new(AppState {
                party_manager: party_manager.clone(),
                db_pool: db_pool.clone(),
            }))
            .app_data(web::Data::new(db_pool.clone()))
            .route("/ws", web::get().to(ws_index))
            .service(get_or_create_user)
            .service(get_race_results)

    })
        .bind(("0.0.0.0", 8080))?
        // .bind_rustls_0_23(("0.0.0.0", 8080), tls_config)?
        .run()
        .await
}