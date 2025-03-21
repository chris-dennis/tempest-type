-- Add migration script here
DROP TABLE IF EXISTS race_results;
DROP TABLE IF EXISTS party_members;
DROP TABLE IF EXISTS parties;
CREATE TABLE race_results (
                              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                              party_code TEXT,
                              user_id UUID REFERENCES users(id),
                              wpm FLOAT NOT NULL,
                              finish_time BIGINT NOT NULL,
                              completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);