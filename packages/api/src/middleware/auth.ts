import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../utils/database';
import { logger } from '../utils/logger';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import type { User } from '@thinkpod/shared';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  username: string;
  iat: number;
  exp: number;
}

// Extract token from request
const extractToken = (req: Request): string | null => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check secure auth cookie first
  const authCookie = req.cookies?.['auth-token'];
  if (authCookie) {
    return authCookie;
  }

  // Check legacy cookie for backward compatibility
  const legacyCookie = req.cookies?.token;
  if (legacyCookie) {
    return legacyCookie;
  }

  // Check query parameter (less secure, for specific use cases)
  const queryToken = req.query.token as string;
  if (queryToken) {
    return queryToken;
  }

  return null;
};

// Verify JWT token
const verifyToken = (token: string): JWTPayload => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  try {
    return jwt.verify(token, jwtSecret) as JWTPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    } else {
      throw new AuthenticationError('Token verification failed');
    }
  }
};

// Main authentication middleware
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    // Verify token
    const payload = verifyToken(token);

    // Check if user still exists and is active
    const user = await db.findById<User>('users', payload.userId);
    
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Update last seen timestamp
    await db.query(
      'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    logger.debug('User authenticated successfully', {
      userId: user.id,
      username: user.username,
      ip: req.ip,
    });

    next();
  } catch (error) {
    next(error);
  }
};

// Optional authentication middleware (doesn't throw if no token)
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }

    const payload = verifyToken(token);
    const user = await db.findById<User>('users', payload.userId);
    
    if (user) {
      req.user = user;
      req.userId = user.id;
      
      // Update last seen
      await db.query(
        'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
    }

    next();
  } catch (error) {
    // Don't throw error, just log it and continue
    logger.warn('Optional auth failed:', error);
    next();
  }
};

// Role-based authorization middleware
export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // For now, we'll use a simple role check
      // In a real app, you might have a roles table and user_roles junction table
      const userRoles = ['user']; // Default role
      
      // Check if user is admin (you can implement this logic based on your needs)
      if (req.user.email.endsWith('@thinkpod.dev')) {
        userRoles.push('admin');
      }

      const hasRequiredRole = allowedRoles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        throw new AuthorizationError(`Requires one of these roles: ${allowedRoles.join(', ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Resource ownership middleware
export const requireOwnership = (resourceTable: string, userIdField: string = 'user_id') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const resourceId = req.params.id;
      if (!resourceId) {
        throw new Error('Resource ID not provided');
      }

      const resource = await db.findById(resourceTable, resourceId);
      
      if (!resource) {
        throw new Error('Resource not found');
      }

      if (resource[userIdField] !== req.user.id) {
        throw new AuthorizationError('You can only access your own resources');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// API key authentication (for external integrations)
export const apiKeyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      throw new AuthenticationError('API key required');
    }

    // Validate API key (implement your own logic)
    const validApiKey = process.env.API_KEY;
    if (!validApiKey || apiKey !== validApiKey) {
      throw new AuthenticationError('Invalid API key');
    }

    // For API key auth, we don't attach a user
    req.userId = 'api-user';

    next();
  } catch (error) {
    next(error);
  }
};

// Rate limiting per user
export const userRateLimit = (maxRequests: number, windowMs: number) => {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userId) {
      return next();
    }

    const now = Date.now();
    const userKey = req.userId;
    const userLimit = userRequests.get(userKey);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize limit
      userRequests.set(userKey, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (userLimit.count >= maxRequests) {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded for user',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000),
      });
      return;
    }

    userLimit.count++;
    next();
  };
};

// Middleware to check if user is online
export const requireOnlineStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    // Update user online status
    await db.query(
      'UPDATE users SET is_online = true, last_seen = CURRENT_TIMESTAMP WHERE id = $1',
      [req.user.id]
    );

    next();
  } catch (error) {
    next(error);
  }
};