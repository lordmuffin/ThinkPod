-- Migration: Update documents schema for document processing service
-- Created: 2024
-- Description: Updates documents and document_embeddings tables to match PRP requirements

-- Drop existing constraints and indexes that will conflict
DROP INDEX IF EXISTS idx_document_embeddings_vector;
DROP INDEX IF EXISTS idx_document_embeddings_document_id;

-- Rename document_embeddings table to document_chunks
ALTER TABLE document_embeddings RENAME TO document_chunks;

-- Update documents table structure
ALTER TABLE documents 
  DROP COLUMN IF EXISTS content,
  DROP COLUMN IF EXISTS upload_url,
  ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL DEFAULT 'Untitled Document',
  ADD COLUMN IF NOT EXISTS file_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS chunk_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update file_size to BIGINT for larger files
ALTER TABLE documents ALTER COLUMN file_size TYPE BIGINT;

-- Update document_chunks table structure
ALTER TABLE document_chunks 
  ADD COLUMN IF NOT EXISTS content_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add constraints for documents
ALTER TABLE documents 
  ADD CONSTRAINT IF NOT EXISTS check_processing_status 
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  ADD CONSTRAINT IF NOT EXISTS check_positive_chunk_count 
    CHECK (chunk_count >= 0),
  ADD CONSTRAINT IF NOT EXISTS check_content_hash_length 
    CHECK (length(content_hash) = 64 OR content_hash = ''),
  ADD CONSTRAINT IF NOT EXISTS check_file_path_not_empty 
    CHECK (file_path != '' OR processing_status = 'pending');

-- Add constraints for document_chunks
ALTER TABLE document_chunks 
  ADD CONSTRAINT IF NOT EXISTS check_positive_content_tokens 
    CHECK (content_tokens >= 0);

-- Create function to update documents.updated_at
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for documents.updated_at
DROP TRIGGER IF EXISTS update_documents_updated_at_trigger ON documents;
CREATE TRIGGER update_documents_updated_at_trigger
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

-- Recreate indexes with new table name and structure
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_content_tokens ON document_chunks(content_tokens);

-- Additional indexes for documents
CREATE INDEX IF NOT EXISTS idx_documents_processing_status ON documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);

-- Update table names constant (this will be reflected in TypeScript)
COMMENT ON TABLE documents IS 'Documents uploaded by users for AI processing';
COMMENT ON TABLE document_chunks IS 'Text chunks from documents with embeddings for semantic search';

-- Create a function to update chunk count when chunks are added/removed
CREATE OR REPLACE FUNCTION update_document_chunk_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE documents 
        SET chunk_count = chunk_count + 1 
        WHERE id = NEW.document_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE documents 
        SET chunk_count = chunk_count - 1 
        WHERE id = OLD.document_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update chunk count
DROP TRIGGER IF EXISTS update_chunk_count_on_insert ON document_chunks;
CREATE TRIGGER update_chunk_count_on_insert
    AFTER INSERT ON document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_document_chunk_count();

DROP TRIGGER IF EXISTS update_chunk_count_on_delete ON document_chunks;
CREATE TRIGGER update_chunk_count_on_delete
    AFTER DELETE ON document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_document_chunk_count();

-- Update the user_analytics view to reflect new table name
DROP VIEW IF EXISTS user_analytics;
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
    COALESCE(SUM(d.file_size), 0) as total_file_size,
    COALESCE(SUM(d.chunk_count), 0) as total_chunks
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id
LEFT JOIN messages m ON u.id = m.user_id
LEFT JOIN llm_usage lu ON u.id = lu.user_id
LEFT JOIN documents d ON u.id = d.user_id
GROUP BY u.id, u.username, u.email, u.created_at, u.last_seen, u.is_online;