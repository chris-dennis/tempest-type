CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
                       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                       nickname TEXT NOT NULL DEFAULT '',
                       created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE user_stats (
                            user_id UUID PRIMARY KEY REFERENCES users(id),
                            races_completed INTEGER NOT NULL DEFAULT 0,
                            races_won INTEGER NOT NULL DEFAULT 0,
                            avg_wpm FLOAT NOT NULL DEFAULT 0.0,
                            top_wpm FLOAT NOT NULL DEFAULT 0.0,
                            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE parties (
                         code TEXT PRIMARY KEY,
                         leader_id UUID NOT NULL REFERENCES users(id),
                         created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE party_members (
                               party_code TEXT REFERENCES parties(code),
                               user_id UUID REFERENCES users(id),
                               joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                               PRIMARY KEY (party_code, user_id)
);

CREATE TABLE race_results (
                              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                              party_code TEXT REFERENCES parties(code),
                              user_id UUID REFERENCES users(id),
                              wpm FLOAT NOT NULL,
                              finish_time BIGINT NOT NULL,
                              completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
