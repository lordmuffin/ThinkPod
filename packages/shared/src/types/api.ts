// API request/response types

// Authentication
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user: {
    id: string;
    username: string;
    email: string;
  };
  token: string;
  refreshToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// Voice transcription
export interface VoiceTranscriptionRequest {
  audio_file: File;
  language?: string;
}

export interface VoiceTranscriptionResponse {
  text: string;
  confidence: number;
  processing_time_ms: number;
}

// Chat completion
export interface ChatCompletionRequest {
  conversation_id: string;
  message: string;
  document_context?: string[];
}

export interface ChatCompletionResponse {
  message: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost: number;
  response_time_ms: number;
}

// Document upload
export interface DocumentUploadRequest {
  file: File;
  title?: string;
}

export interface DocumentResponse {
  id: string;
  title: string;
  filename: string;
  file_type: string;
  file_size: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentUploadResponse {
  success: boolean;
  document: DocumentResponse;
}

// Document update
export interface DocumentUpdateRequest {
  title: string;
}

// Document search
export interface DocumentSearchRequest {
  query: string;
  limit?: number;
  similarity_threshold?: number;
  user_id?: string;
}

export interface DocumentSearchResult {
  document_id: string;
  document_title: string;
  document_filename: string;
  chunk_content: string;
  similarity_score: number;
  chunk_index: number;
  metadata: Record<string, any>;
}

export interface DocumentSearchResponse {
  results: DocumentSearchResult[];
  total_results: number;
  query: string;
  processing_time_ms: number;
}

// Hybrid search
export interface HybridSearchRequest extends DocumentSearchRequest {
  keyword_weight?: number;
  semantic_weight?: number;
}

// Document chunks
export interface DocumentChunkResponse {
  id: string;
  chunk_index: number;
  content: string;
  content_tokens: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface DocumentChunksResponse {
  document_id: string;
  chunks: DocumentChunkResponse[];
  total_chunks: number;
}

// Document context for LLM
export interface DocumentContextRequest {
  query: string;
  conversation_id?: string;
  max_chunks?: number;
  similarity_threshold?: number;
}

export interface DocumentContextResponse {
  context: string[];
  source_chunks: Array<{
    document_id: string;
    document_title: string;
    chunk_index: number;
    similarity_score: number;
  }>;
  total_characters: number;
}

// Document reprocessing
export interface DocumentReprocessRequest {
  document_ids?: string[];
  force?: boolean;
}

// Conversations
export interface ConversationCreateRequest {
  title?: string;
}

export interface ConversationResponse {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: {
    content: string;
    created_at: string;
    message_type: 'user' | 'assistant' | 'system';
  };
}

export interface MessageResponse {
  id: string;
  conversation_id: string;
  content: string;
  message_type: 'user' | 'assistant' | 'system';
  voice_recording_url?: string;
  created_at: string;
  sender: {
    id: string;
    username: string;
  };
}

// Analytics
export interface UsageAnalyticsResponse {
  total_messages: number;
  active_users: number;
  daily_cost: number;
  average_response_time: number;
  messages_by_hour: Array<{
    hour: string;
    count: number;
  }>;
  cost_by_model: Array<{
    model: string;
    cost: number;
    percentage: number;
  }>;
  user_activity: Array<{
    user_id: string;
    username: string;
    message_count: number;
  }>;
}

// Error response
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Success response wrapper
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

// Generic API response
export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

// Socket.IO event types
export interface SocketEvents {
  // Client to server
  'join-conversations': () => void;
  'send-message': (data: {
    conversationId: string;
    content: string;
    parentId?: string;
    tempId: string;
  }) => void;
  'typing-start': (conversationId: string) => void;
  'typing-stop': (conversationId: string) => void;

  // Server to client
  'new-message': (message: MessageResponse) => void;
  'message-sent': (data: { tempId: string; messageId: string }) => void;
  'user-typing': (data: { userId: string; conversationId: string }) => void;
  'user-stopped-typing': (data: { userId: string; conversationId: string }) => void;
  'user-joined': (data: { userId: string; username: string }) => void;
  'user-left': (data: { userId: string }) => void;
  'error': (error: string) => void;
}