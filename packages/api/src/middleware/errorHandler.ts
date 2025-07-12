import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

// Custom error class
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation error class
export class ValidationError extends AppError {
  public details: any[];

  constructor(message: string, details: any[] = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

// Authentication error class
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

// Authorization error class
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

// Not found error class
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

// Rate limit error class
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

// Handle Zod validation errors
const handleZodError = (error: ZodError) => {
  const details = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    value: (err as any).received,
  }));

  return new ValidationError('Validation failed', details);
};

// Handle PostgreSQL errors
const handleDatabaseError = (error: any) => {
  switch (error.code) {
    case '23505': // Unique violation
      return new AppError('Resource already exists', 409, 'DUPLICATE_ERROR');
    
    case '23503': // Foreign key violation
      return new AppError('Referenced resource not found', 400, 'FOREIGN_KEY_ERROR');
    
    case '23502': // Not null violation
      return new AppError('Required field is missing', 400, 'NOT_NULL_ERROR');
    
    case '23514': // Check constraint violation
      return new AppError('Invalid data provided', 400, 'CHECK_CONSTRAINT_ERROR');
    
    case '42P01': // Undefined table
      return new AppError('Database table not found', 500, 'TABLE_NOT_FOUND');
    
    case '42703': // Undefined column
      return new AppError('Database column not found', 500, 'COLUMN_NOT_FOUND');
    
    case '28P01': // Invalid password
      return new AppError('Database authentication failed', 500, 'DB_AUTH_ERROR');
    
    case 'ECONNREFUSED':
      return new AppError('Database connection refused', 500, 'DB_CONNECTION_ERROR');
    
    case 'ENOTFOUND':
      return new AppError('Database host not found', 500, 'DB_HOST_ERROR');
    
    default:
      return new AppError('Database operation failed', 500, 'DATABASE_ERROR');
  }
};

// Handle JWT errors
const handleJWTError = (error: any) => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }
  
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token not active');
  }
  
  return new AuthenticationError('Token verification failed');
};

// Main error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let err = error;

  // Log the original error
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query,
  });

  // Transform specific error types
  if (error instanceof ZodError) {
    err = handleZodError(error);
  } else if (error.name?.includes('JWT') || error.name?.includes('Token')) {
    err = handleJWTError(error);
  } else if (error.name === 'QueryFailedError' || (error as any).code) {
    err = handleDatabaseError(error);
  }

  // Default to AppError if not already
  if (!(err instanceof AppError)) {
    err = new AppError(
      process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message,
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }

  const appError = err as AppError;

  // Prepare error response
  const errorResponse: any = {
    success: false,
    error: appError.message,
    code: appError.code,
    timestamp: new Date().toISOString(),
  };

  // Add details for validation errors
  if (appError instanceof ValidationError) {
    errorResponse.details = appError.details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = appError.stack;
  }

  // Add request ID if available
  if (req.headers['x-request-id']) {
    errorResponse.requestId = req.headers['x-request-id'];
  }

  res.status(appError.statusCode).json(errorResponse);
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation middleware wrapper
export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      // Replace request data with validated data
      req.body = validatedData.body || req.body;
      req.query = validatedData.query || req.query;
      req.params = validatedData.params || req.params;
      
      next();
    } catch (error) {
      next(error);
    }
  };
};