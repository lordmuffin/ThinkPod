import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../utils/database';
import { logger } from '../utils/logger';
import { asyncHandler, validateRequest, AppError } from '../middleware/errorHandler';
import { setAuthCookie, setRefreshCookie, clearAuthCookies } from '../utils/cookies';
import { schemas } from '@thinkpod/shared';
import type { User, AuthResponse } from '@thinkpod/shared';

const router = express.Router();

// Validation schemas
const registerSchema = z.object({
  body: schemas.register,
});

const loginSchema = z.object({
  body: schemas.login,
});

const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

// Generate JWT tokens
const generateTokens = (user: User) => {
  const jwtSecret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  
  if (!jwtSecret || !refreshSecret) {
    throw new Error('JWT secrets not configured');
  }

  const payload = {
    userId: user.id,
    email: user.email,
    username: user.username,
  };

  const tokenOptions: SignOptions = {
    expiresIn: 15 * 60, // 15 minutes in seconds
  };

  const refreshTokenOptions: SignOptions = {
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  };

  const token = jwt.sign(payload, jwtSecret, tokenOptions);
  const refreshToken = jwt.sign({ userId: user.id }, refreshSecret, refreshTokenOptions);

  return { token, refreshToken };
};

// Store refresh token in database
const storeRefreshToken = async (userId: string, refreshToken: string) => {
  const hashedToken = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (user_id) 
     DO UPDATE SET token_hash = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP`,
    [userId, hashedToken, expiresAt]
  );
};

// Register endpoint
router.post('/register', validateRequest(registerSchema), asyncHandler(async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  // Check if user already exists
  const existingUser = await db.query<User>(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email, username]
  );

  if (existingUser.length > 0) {
    throw new AppError('User already exists with this email or username', 409);
  }

  // Hash password
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create user
  const newUser = await db.insert<User>('users', {
    username,
    email,
    password_hash: passwordHash,
    is_online: true,
  });

  // Generate tokens
  const { token, refreshToken } = generateTokens(newUser);
  
  // Store refresh token
  await storeRefreshToken(newUser.id, refreshToken);

  // Set secure cookies
  setAuthCookie(res, token);
  setRefreshCookie(res, refreshToken);

  // Log registration
  logger.info('User registered successfully', {
    userId: newUser.id,
    username: newUser.username,
    email: newUser.email,
  });

  // Return response without password hash
  const response: AuthResponse = {
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
    },
    token,
    refreshToken,
  };

  res.status(201).json(response);
}));

// Login endpoint
router.post('/login', validateRequest(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await db.findOneByField<User>('users', 'email', email);

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    throw new AppError('Invalid email or password', 401);
  }

  // Update user online status
  await db.update('users', user.id, {
    is_online: true,
    last_seen: new Date(),
  });

  // Generate tokens
  const { token, refreshToken } = generateTokens(user);
  
  // Store refresh token
  await storeRefreshToken(user.id, refreshToken);

  // Set secure cookies
  setAuthCookie(res, token);
  setRefreshCookie(res, refreshToken);

  // Log successful login
  logger.info('User logged in successfully', {
    userId: user.id,
    username: user.username,
    email: user.email,
  });

  // Return response
  const response: AuthResponse = {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    token,
    refreshToken,
  };

  res.json(response);
}));

// Refresh token endpoint
router.post('/refresh', validateRequest(refreshTokenSchema), asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!refreshSecret) {
    throw new Error('JWT refresh secret not configured');
  }

  try {
    // Verify refresh token
    const payload = jwt.verify(refreshToken, refreshSecret) as { userId: string };

    // Check if refresh token exists in database
    const storedToken = await db.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP',
      [payload.userId]
    );

    if (storedToken.length === 0) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    // Verify the token hash
    const isValidToken = await bcrypt.compare(refreshToken, storedToken[0].token_hash);
    
    if (!isValidToken) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Get user
    const user = await db.findById<User>('users', payload.userId);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Generate new tokens
    const { token: newToken, refreshToken: newRefreshToken } = generateTokens(user);
    
    // Store new refresh token
    await storeRefreshToken(user.id, newRefreshToken);

    // Set secure cookies
    setAuthCookie(res, newToken);
    setRefreshCookie(res, newRefreshToken);

    // Return new tokens
    const response: AuthResponse = {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      token: newToken,
      refreshToken: newRefreshToken,
    };

    res.json(response);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid refresh token', 401);
    }
    throw error;
  }
}));

// Logout endpoint
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    try {
      const refreshSecret = process.env.JWT_REFRESH_SECRET;
      if (refreshSecret) {
        const payload = jwt.verify(refreshToken, refreshSecret) as { userId: string };
        
        // Remove refresh token from database
        await db.query(
          'DELETE FROM refresh_tokens WHERE user_id = $1',
          [payload.userId]
        );

        // Update user online status
        await db.update('users', payload.userId, { is_online: false });

        logger.info('User logged out successfully', { userId: payload.userId });
      }
    } catch (error) {
      // Log but don't throw error for logout
      logger.warn('Error during logout:', error);
    }
  }

  // Clear secure cookies
  clearAuthCookies(res);

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
}));

// Verify token endpoint
router.get('/verify', asyncHandler(async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AppError('No token provided', 401);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT secret not configured');
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as { userId: string };
    const user = await db.findById<User>('users', payload.userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid token', 401);
    }
    throw error;
  }
}));

// Password reset request (placeholder)
router.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  // This would typically send an email with reset link
  res.json({
    success: true,
    message: 'Password reset instructions sent to your email',
  });
}));

export default router;