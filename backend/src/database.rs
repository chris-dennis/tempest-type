use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use std::env;
use dotenv::dotenv;

pub type DbPool = Pool<Postgres>;

pub async fn initialize_pool() -> Result<DbPool, sqlx::Error> {
    dotenv().ok();

    let database_url = env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
}