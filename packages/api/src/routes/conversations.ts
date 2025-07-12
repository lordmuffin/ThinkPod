import express, { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../utils/database';
import { logger } from '../utils/logger';
import { asyncHandler, validateRequest } from '../middleware/errorHandler';
import type { Conversation, ConversationResponse } from '@thinkpod/shared';

const router = express.Router();

// Validation schemas
const createConversationSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200).optional(),
  }),
});

const updateConversationSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

const getConversationsSchema = z.object({
  query: z.object({
    page: z.string().transform(Number).pipe(z.number().min(1)).default('1'),
    limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).default('20'),
  }),
});

// Get all conversations for user
router.get('/', validateRequest(getConversationsSchema), asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query as any;
  const offset = (page - 1) * limit;

  // Get conversations with message count and last message
  const conversations = await db.query<any>(`
    SELECT 
      c.*,
      cs.message_count,
      cs.last_message_at,
      cs.last_message_content,
      cs.last_message_type
    FROM conversations c
    LEFT JOIN conversation_summaries cs ON c.id = cs.id
    WHERE c.user_id = $1
    ORDER BY c.updated_at DESC
    LIMIT $2 OFFSET $3
  `, [req.userId, limit, offset]);

  // Get total count for pagination
  const totalResult = await db.query<{ count: string }>(`
    SELECT COUNT(*) as count
    FROM conversations
    WHERE user_id = $1
  `, [req.userId]);

  const total = parseInt(totalResult[0].count);
  const totalPages = Math.ceil(total / limit);

  const response = {
    success: true,
    data: conversations.map((conv): ConversationResponse => ({
      id: conv.id,
      title: conv.title,
      created_at: conv.created_at.toISOString(),
      updated_at: conv.updated_at.toISOString(),
      message_count: conv.message_count || 0,
      last_message: conv.last_message_content ? {
        content: conv.last_message_content,
        created_at: conv.last_message_at?.toISOString(),
        message_type: conv.last_message_type,
      } : undefined,
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

// Get specific conversation
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const conversationId = req.params.id;

  const conversation = await db.query<Conversation>(`
    SELECT * FROM conversations 
    WHERE id = $1 AND user_id = $2
  `, [conversationId, req.userId]);

  if (conversation.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found',
    });
  }

  const conv = conversation[0];

  const response: ConversationResponse = {
    id: conv.id,
    title: conv.title,
    created_at: conv.created_at.toISOString(),
    updated_at: conv.updated_at.toISOString(),
    message_count: 0, // Will be populated by separate query if needed
  };

  res.json({
    success: true,
    data: response,
  });
}));

// Create new conversation
router.post('/', validateRequest(createConversationSchema), asyncHandler(async (req: Request, res: Response) => {
  const { title } = req.body;

  const conversation = await db.insert<Conversation>('conversations', {
    user_id: req.userId,
    title: title || 'New Conversation',
  });

  logger.info('Conversation created', {
    conversationId: conversation.id,
    userId: req.userId,
    title: conversation.title,
  });

  const response: ConversationResponse = {
    id: conversation.id,
    title: conversation.title,
    created_at: conversation.created_at.toISOString(),
    updated_at: conversation.updated_at.toISOString(),
    message_count: 0,
  };

  res.status(201).json({
    success: true,
    data: response,
  });
}));

// Update conversation
router.put('/:id', validateRequest(updateConversationSchema), asyncHandler(async (req: Request, res: Response) => {
  const conversationId = req.params.id;
  const { title } = req.body;

  // Check if conversation exists and belongs to user
  const existingConversation = await db.query<Conversation>(`
    SELECT * FROM conversations 
    WHERE id = $1 AND user_id = $2
  `, [conversationId, req.userId]);

  if (existingConversation.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found',
    });
  }

  // Update conversation
  const updatedConversation = await db.update<Conversation>('conversations', conversationId, {
    title,
  });

  logger.info('Conversation updated', {
    conversationId,
    userId: req.userId,
    newTitle: title,
  });

  const response: ConversationResponse = {
    id: updatedConversation!.id,
    title: updatedConversation!.title,
    created_at: updatedConversation!.created_at.toISOString(),
    updated_at: updatedConversation!.updated_at.toISOString(),
    message_count: 0,
  };

  res.json({
    success: true,
    data: response,
  });
}));

// Delete conversation
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const conversationId = req.params.id;

  // Check if conversation exists and belongs to user
  const existingConversation = await db.query<Conversation>(`
    SELECT * FROM conversations 
    WHERE id = $1 AND user_id = $2
  `, [conversationId, req.userId]);

  if (existingConversation.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found',
    });
  }

  // Delete conversation (messages will be deleted due to CASCADE)
  await db.delete('conversations', conversationId);

  logger.info('Conversation deleted', {
    conversationId,
    userId: req.userId,
  });

  res.json({
    success: true,
    message: 'Conversation deleted successfully',
  });
}));

export default router;