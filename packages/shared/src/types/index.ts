// Export all types
export * from './database';
export * from './api';
export * from './common';

// Re-export commonly used types with aliases for convenience
export type {
  User as UserType,
  Message as MessageType,
  Conversation as ConversationType,
  Document as DocumentType,
  DocumentChunk,
  DocumentEmbedding,
  LLMUsage as LLMUsageType
} from './database';

export type {
  ApiResponse,
  SuccessResponse,
  ErrorResponse,
  AuthResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  VoiceTranscriptionRequest,
  VoiceTranscriptionResponse,
  DocumentResponse,
  DocumentUploadRequest,
  DocumentUploadResponse,
  DocumentUpdateRequest,
  DocumentSearchRequest,
  DocumentSearchResponse,
  DocumentSearchResult,
  HybridSearchRequest,
  DocumentChunkResponse,
  DocumentChunksResponse,
  DocumentContextRequest,
  DocumentContextResponse,
  DocumentReprocessRequest
} from './api';

export type {
  PaginatedResponse,
  ChatState,
  ConnectionState,
  AppConfig,
  UserPreferences,
  Platform,
  Environment
} from './common';