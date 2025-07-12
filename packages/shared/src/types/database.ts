// Database schema types
export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
  last_seen: Date;
  is_online: boolean;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  content: string;
  message_type: 'user' | 'assistant' | 'system';
  voice_recording_url?: string;
  created_at: Date;
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  content_hash: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  chunk_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  content_tokens: number;
  embedding: number[]; // Vector embedding
  metadata: Record<string, any>;
  created_at: Date;
}

// Keep legacy interface for backwards compatibility
export interface DocumentEmbedding extends DocumentChunk {}

export interface LLMUsage {
  id: string;
  user_id: string;
  conversation_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  response_time_ms: number;
  created_at: Date;
}

// Database table names as constants
export const TABLE_NAMES = {
  USERS: 'users',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  DOCUMENTS: 'documents',
  DOCUMENT_CHUNKS: 'document_chunks',
  DOCUMENT_EMBEDDINGS: 'document_embeddings', // Legacy name for backwards compatibility
  LLM_USAGE: 'llm_usage'
} as const;

// Type for table names
export type TableName = typeof TABLE_NAMES[keyof typeof TABLE_NAMES];