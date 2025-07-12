import express, { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../utils/database';
import { logger } from '../utils/logger';
import { asyncHandler, validateRequest } from '../middleware/errorHandler';
import type { Message, MessageResponse } from '@thinkpod/shared';

const router = express.Router();

// Validation schemas
const getMessagesSchema = z.object({
  query: z.object({
    conversation_id: z.string().uuid(),
    page: z.string().transform(Number).pipe(z.number().min(1)).default('1'),
    limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('50'),
  }),
});

const createMessageSchema = z.object({
  body: z.object({
    conversation_id: z.string().uuid(),
    content: z.string().min(1).max(4000),
    message_type: z.enum(['user', 'assistant', 'system']).default('user'),
    voice_recording_url: z.string().url().optional(),
  }),
});

// Get messages for a conversation
router.get('/', validateRequest(getMessagesSchema), asyncHandler(async (req: Request, res: Response) => {
  const { conversation_id, page, limit } = req.query as any;
  const offset = (page - 1) * limit;

  // Check if user has access to this conversation
  const conversation = await db.query(`
    SELECT id FROM conversations 
    WHERE id = $1 AND user_id = $2
  `, [conversation_id, req.userId]);

  if (conversation.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found',
    });
  }

  // Get messages with user information
  const messages = await db.query<any>(`
    SELECT 
      m.*,
      u.username,
      u.email
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.conversation_id = $1
    ORDER BY m.created_at ASC
    LIMIT $2 OFFSET $3
  `, [conversation_id, limit, offset]);

  // Get total count
  const totalResult = await db.query<{ count: string }>(`
    SELECT COUNT(*) as count
    FROM messages
    WHERE conversation_id = $1
  `, [conversation_id]);

  const total = parseInt(totalResult[0].count);
  const totalPages = Math.ceil(total / limit);

  const response = {
    success: true,
    data: messages.map((msg): MessageResponse => ({
      id: msg.id,
      conversation_id: msg.conversation_id,
      content: msg.content,
      message_type: msg.message_type,
      voice_recording_url: msg.voice_recording_url,
      created_at: msg.created_at.toISOString(),
      sender: {
        id: msg.user_id,
        username: msg.username,
      },
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };

  res.json(response);
}));

// Create new message
router.post('/', validateRequest(createMessageSchema), asyncHandler(async (req: Request, res: Response) => {
  const { conversation_id, content, message_type, voice_recording_url } = req.body;

  // Check if user has access to this conversation
  const conversation = await db.query(`
    SELECT id FROM conversations 
    WHERE id = $1 AND user_id = $2
  `, [conversation_id, req.userId]);

  if (conversation.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found',
    });
  }

  // Create message
  const message = await db.insert<Message>('messages', {
    conversation_id,
    user_id: req.userId,
    content,
    message_type,
    voice_recording_url,
  });

  // Get user info for response
  const user = await db.findById('users', req.userId!);

  logger.info('Message created', {
    messageId: message.id,
    conversationId: conversation_id,
    userId: req.userId,
    messageType: message_type,
  });

  const response: MessageResponse = {
    id: message.id,
    conversation_id: message.conversation_id,
    content: message.content,
    message_type: message.message_type,
    voice_recording_url: message.voice_recording_url,
    created_at: message.created_at.toISOString(),
    sender: {
      id: req.userId!,
      username: user?.username || 'Unknown',
    },
  };

  res.status(201).json({
    success: true,
    data: response,
  });
}));

export default router;