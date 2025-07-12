-- Initial database schema for ThinkPod mobile app
-- Created: 2024

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- Create enum types
CREATE TYPE message_type AS ENUM ('user', 'assistant', 'system');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(30) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_online BOOLEAN DEFAULT false,
    
    -- Add constraints
    CONSTRAINT valid_username CHECK (username ~ '^[a-zA-Z0-9_]+$'),
    CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type message_type NOT NULL DEFAULT 'user',
    voice_recording_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Add constraints
    CONSTRAINT non_empty_content CHECK (length(trim(content)) > 0),
    CONSTRAINT max_content_length CHECK (length(content) <= 4000)
);

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size INTEGER NOT NULL,
    upload_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Add constraints
    CONSTRAINT positive_file_size CHECK (file_size > 0),
    CONSTRAINT max_file_size CHECK (file_size <= 26214400), -- 25MB in bytes
    CONSTRAINT non_empty_filename CHECK (length(trim(filename)) > 0)
);

-- Document embeddings table (for vector search)
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI text-embedding-3-small dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Add constraints
    CONSTRAINT non_negative_chunk_index CHECK (chunk_index >= 0),
    CONSTRAINT non_empty_chunk_content CHECK (length(trim(content)) > 0),
    
    -- Unique constraint for document + chunk combination
    UNIQUE(document_id, chunk_index)
);

-- LLM usage tracking table
CREATE TABLE llm_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    cost DECIMAL(10, 6) NOT NULL, -- Store cost with 6 decimal places for precision
    response_time_ms INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Add constraints
    CONSTRAINT non_negative_tokens CHECK (
        prompt_tokens >= 0 AND 
        completion_tokens >= 0 AND 
        total_tokens >= 0
    ),
    CONSTRAINT valid_total_tokens CHECK (total_tokens = prompt_tokens + completion_tokens),
    CONSTRAINT non_negative_cost CHECK (cost >= 0),
    CONSTRAINT non_negative_response_time CHECK (response_time_ms >= 0)
);

-- Refresh tokens table for JWT authentication
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Only one active refresh token per user
    UNIQUE(user_id)
);

-- User sessions table for tracking active sessions
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    UNIQUE(session_token)
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_is_online ON users(is_online);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_file_type ON documents(file_type);

-- Vector similarity search index using ivfflat
CREATE INDEX idx_document_embeddings_vector ON document_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_document_embeddings_document_id ON document_embeddings(document_id);

CREATE INDEX idx_llm_usage_user_id ON llm_usage(user_id);
CREATE INDEX idx_llm_usage_conversation_id ON llm_usage(conversation_id);
CREATE INDEX idx_llm_usage_created_at ON llm_usage(created_at DESC);
CREATE INDEX idx_llm_usage_model ON llm_usage(model);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at for conversations
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to update conversation updated_at when a message is added
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversation_on_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_on_message();

-- Create a function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP;
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Create a view for conversation summaries
CREATE VIEW conversation_summaries AS
SELECT 
    c.id,
    c.user_id,
    c.title,
    c.created_at,
    c.updated_at,
    COUNT(m.id) as message_count,
    MAX(m.created_at) as last_message_at,
    (
        SELECT content 
        FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
    ) as last_message_content,
    (
        SELECT message_type 
        FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
    ) as last_message_type
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id, c.user_id, c.title, c.created_at, c.updated_at;

-- Create a view for user analytics
CREATE VIEW user_analytics AS
SELECT 
    u.id as user_id,
    u.username,
    u.email,
    u.created_at as user_created_at,
    u.last_seen,
    u.is_online,
    COUNT(DISTINCT c.id) as conversation_count,
    COUNT(m.id) as message_count,
    COALESCE(SUM(lu.cost), 0) as total_llm_cost,
    COALESCE(SUM(lu.total_tokens), 0) as total_tokens_used,
    COUNT(DISTINCT d.id) as document_count,
    COALESCE(SUM(d.file_size), 0) as total_file_size
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id
LEFT JOIN messages m ON u.id = m.user_id
LEFT JOIN llm_usage lu ON u.id = lu.user_id
LEFT JOIN documents d ON u.id = d.user_id
GROUP BY u.id, u.username, u.email, u.created_at, u.last_seen, u.is_online;