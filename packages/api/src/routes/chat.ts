import express, { Request, Response } from 'express';
import { z } from 'zod';
import { LLMService } from '../services/LLMService';
import { db } from '../utils/database';
import { logger } from '../utils/logger';
import { asyncHandler, validateRequest, AppError } from '../middleware/errorHandler';
import { schemas } from '@thinkpod/shared';
import type { ChatCompletionResponse, MessageResponse } from '@thinkpod/shared';

const router = express.Router();
const llmService = new LLMService();

// Validation schema for chat completion
const chatCompletionSchema = z.object({
  body: schemas.chatCompletion.extend({
    include_context: z.boolean().optional().default(false),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().min(1).max(4000).optional(),
  }),
});

// Chat completion endpoint
router.post('/completions', validateRequest(chatCompletionSchema), asyncHandler(async (req: Request, res: Response) => {
  const { conversation_id, message, document_context, include_context, model, temperature, max_tokens } = req.body;

  // Check if user has access to the conversation
  const conversation = await db.query(`
    SELECT id FROM conversations 
    WHERE id = $1 AND user_id = $2
  `, [conversation_id, req.userId]);

  if (conversation.length === 0) {
    throw new AppError('Conversation not found', 404);
  }

  // Check user usage limits
  const usageCheck = await llmService.checkUsageLimits(req.userId!);
  if (!usageCheck.withinLimit) {
    throw new AppError('Usage limit exceeded. Please try again later or upgrade your plan.', 429);
  }

  // Get conversation history for context
  let contextMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  
  if (include_context) {
    const recentMessages = await db.query(`
      SELECT content, message_type
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [conversation_id]);

    contextMessages = recentMessages.reverse().map(msg => ({
      role: msg.message_type === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));
  }

  // Add the current user message
  contextMessages.push({
    role: 'user',
    content: message,
  });

  try {
    // Save user message to database first
    const userMessage = await db.insert('messages', {
      conversation_id,
      user_id: req.userId,
      content: message,
      message_type: 'user',
    });

    // Generate LLM response
    const llmResponse = await llmService.generateChatCompletion(
      contextMessages,
      req.userId!,
      conversation_id,
      document_context,
      {
        model,
        temperature,
        max_tokens,
      }
    );

    // Save assistant message to database
    const assistantMessage = await db.insert('messages', {
      conversation_id,
      user_id: req.userId, // System user or keep as user for simplicity
      content: llmResponse.message,
      message_type: 'assistant',
    });

    // Get user info for response
    const user = await db.findById('users', req.userId!);

    logger.info('Chat completion successful', {
      userId: req.userId,
      conversationId: conversation_id,
      model: llmResponse.model,
      cost: llmResponse.cost,
      responseTime: llmResponse.response_time_ms,
    });

    // Prepare response
    const response: ChatCompletionResponse = {
      message: llmResponse.message,
      usage: llmResponse.usage,
      cost: llmResponse.cost,
      response_time_ms: llmResponse.response_time_ms,
    };

    // Also return the message objects for real-time updates
    const userMessageResponse: MessageResponse = {
      id: userMessage.id,
      conversation_id,
      content: userMessage.content,
      message_type: 'user',
      created_at: userMessage.created_at.toISOString(),
      sender: {
        id: req.userId!,
        username: user?.username || 'Unknown',
      },
    };

    const assistantMessageResponse: MessageResponse = {
      id: assistantMessage.id,
      conversation_id,
      content: assistantMessage.content,
      message_type: 'assistant',
      created_at: assistantMessage.created_at.toISOString(),
      sender: {
        id: 'assistant',
        username: 'AI Assistant',
      },
    };

    res.json({
      success: true,
      data: response,
      messages: [userMessageResponse, assistantMessageResponse],
    });

  } catch (error) {
    logger.error('Chat completion failed', {
      userId: req.userId,
      conversationId: conversation_id,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        throw new AppError('Rate limit exceeded. Please try again later.', 429);
      } else if (error.message.includes('token')) {
        throw new AppError('Message too long. Please shorten your input.', 400);
      } else if (error.message.includes('content policy')) {
        throw new AppError('Content violates usage policies.', 400);
      }
    }

    throw new AppError('Failed to generate response. Please try again.', 500);
  }
}));

// Get user usage statistics
router.get('/usage', asyncHandler(async (req: Request, res: Response) => {
  const timeframe = req.query.timeframe as 'day' | 'week' | 'month' || 'day';
  
  const stats = await llmService.getUserUsageStats(req.userId!, timeframe);
  const limits = await llmService.checkUsageLimits(req.userId!);

  res.json({
    success: true,
    data: {
      ...stats,
      limits: limits.limit,
      within_limit: limits.withinLimit,
    },
  });
}));

// Get available models
router.get('/models', asyncHandler(async (req: Request, res: Response) => {
  const models = llmService.getAvailableModels();
  
  res.json({
    success: true,
    data: {
      models,
      default: 'gpt-3.5-turbo',
    },
  });
}));

// Health check for LLM service
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const health = await llmService.healthCheck();
  
  res.json({
    success: true,
    data: health,
  });
}));

export default router;