import { z } from 'zod';

// Validation schemas using Zod
export const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password_hash: z.string(),
  created_at: z.date(),
  last_seen: z.date(),
  is_online: z.boolean()
});

export const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores'
  }),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    })
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  user_id: z.string().uuid(),
  content: z.string().min(1).max(4000),
  message_type: z.enum(['user', 'assistant', 'system']),
  voice_recording_url: z.string().url().optional(),
  created_at: z.date()
});

export const chatCompletionSchema = z.object({
  conversation_id: z.string().uuid(),
  message: z.string().min(1).max(4000),
  document_context: z.array(z.string()).optional()
});

// Document validation schemas per PRP requirements
export const documentUploadSchema = z.object({
  title: z.string().min(1).max(255).optional(),
});

export const documentUpdateSchema = z.object({
  title: z.string().min(1).max(255)
});

export const documentSearchSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().positive().max(50).default(10),
  similarity_threshold: z.number().min(0).max(1).default(0.7),
  user_id: z.string().uuid().optional()
});

export const hybridSearchSchema = documentSearchSchema.extend({
  keyword_weight: z.number().min(0).max(1).default(0.3),
  semantic_weight: z.number().min(0).max(1).default(0.7)
});

export const documentContextSchema = z.object({
  query: z.string().min(1).max(1000),
  conversation_id: z.string().uuid().optional(),
  max_chunks: z.number().int().positive().max(20).default(5),
  similarity_threshold: z.number().min(0).max(1).default(0.7)
});

export const documentReprocessSchema = z.object({
  document_ids: z.array(z.string().uuid()).optional(),
  force: z.boolean().default(false)
});

export const documentSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  filename: z.string().min(1).max(255),
  file_path: z.string().min(1),
  file_type: z.string().regex(/^[a-zA-Z0-9\/\-]+$/),
  file_size: z.number().positive().max(50 * 1024 * 1024), // 50MB max per PRP
  content_hash: z.string().length(64),
  processing_status: z.enum(['pending', 'processing', 'completed', 'failed']),
  chunk_count: z.number().int().nonnegative(),
  created_at: z.date(),
  updated_at: z.date()
});

export const documentChunkSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  chunk_index: z.number().int().nonnegative(),
  content: z.string().min(1),
  content_tokens: z.number().int().positive(),
  embedding: z.array(z.number()).length(1536), // OpenAI ada-002 dimensions
  metadata: z.record(z.unknown()),
  created_at: z.date()
});

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().optional()
});

// Utility functions for validation
export const validateEmail = (email: string): boolean => {
  return z.string().email().safeParse(email).success;
};

export const validatePassword = (password: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateUsername = (username: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }
  
  if (username.length > 30) {
    errors.push('Username must be no more than 30 characters long');
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, and underscores');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateFileType = (filename: string, allowedTypes: string[]): boolean => {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension ? allowedTypes.includes(extension) : false;
};

export const validateFileSize = (size: number, maxSize: number): boolean => {
  return size > 0 && size <= maxSize;
};

// Sanitization functions
export const sanitizeHtml = (input: string): string => {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

export const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

// Export all schemas for use in other packages
export const schemas = {
  user: userSchema,
  register: registerSchema,
  login: loginSchema,
  message: messageSchema,
  chatCompletion: chatCompletionSchema,
  document: documentSchema,
  documentChunk: documentChunkSchema,
  documentUpload: documentUploadSchema,
  documentUpdate: documentUpdateSchema,
  documentSearch: documentSearchSchema,
  hybridSearch: hybridSearchSchema,
  documentContext: documentContextSchema,
  documentReprocess: documentReprocessSchema,
  pagination: paginationSchema
};