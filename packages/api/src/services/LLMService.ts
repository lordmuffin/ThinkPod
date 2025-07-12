import OpenAI from 'openai';
import { Langfuse } from 'langfuse';
import { db } from '../utils/database';
import { logger, logPerformance } from '../utils/logger';
import type { LLMUsage } from '@thinkpod/shared';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  message: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost: number;
  response_time_ms: number;
  model: string;
}

interface LLMOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export class LLMService {
  private openai: OpenAI;
  private langfuse: Langfuse;
  
  // Cost per token for different models (updated 2024 pricing)
  private costPerToken = {
    'gpt-4': { input: 0.00003, output: 0.00006 },
    'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
    'gpt-3.5-turbo': { input: 0.0000015, output: 0.000002 },
    'gpt-3.5-turbo-16k': { input: 0.000003, output: 0.000004 },
  };

  private defaultOptions: LLMOptions = {
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_tokens: 2000,
    stream: false,
  };

  constructor() {
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Initialize Langfuse for monitoring
    this.langfuse = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    });

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required');
    }

    if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
      logger.warn('Langfuse credentials not provided - monitoring will be disabled');
    }
  }

  /**
   * Generate chat completion with usage tracking and cost monitoring
   */
  async generateChatCompletion(
    messages: ChatMessage[],
    userId: string,
    conversationId: string,
    documentContext?: string[],
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    // PATTERN: Create trace for monitoring (from PRP)
    const trace = this.langfuse.trace({
      name: 'chat-completion',
      userId,
      sessionId: conversationId,
      metadata: { 
        documentContext: !!documentContext,
        model: mergedOptions.model,
        hasDocumentContext: documentContext && documentContext.length > 0,
      },
    });

    try {
      // PATTERN: Inject document context if provided (from PRP)
      let contextualMessages = [...messages];
      if (documentContext && documentContext.length > 0) {
        const contextMessage: ChatMessage = {
          role: 'system',
          content: `Context from uploaded documents:\n${documentContext.join('\n\n')}`,
        };
        contextualMessages.unshift(contextMessage);
      }

      // Validate message count and token estimation
      await this.validateRequest(contextualMessages, mergedOptions);

      // Make OpenAI API call (non-streaming for now)
      const completion = await this.openai.chat.completions.create({
        model: mergedOptions.model!,
        messages: contextualMessages,
        user: userId, // For OpenAI usage tracking (from PRP)
        temperature: mergedOptions.temperature!,
        max_tokens: mergedOptions.max_tokens!,
        stream: false, // Force non-streaming for type safety
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const usage = completion.usage!;

      // CRITICAL: Calculate and track costs (from PRP)
      const cost = this.calculateCost(mergedOptions.model!, usage.prompt_tokens, usage.completion_tokens);

      // PATTERN: Log to monitoring service (from PRP)
      const generation = trace.generation({
        name: 'openai-chat',
        model: mergedOptions.model!,
        input: contextualMessages,
        output: completion.choices[0].message.content,
        usage: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
          total: usage.total_tokens,
        },
      });

      // PATTERN: Store usage in database for analytics (from PRP)
      await this.logUsageMetrics({
        userId,
        conversationId,
        model: mergedOptions.model!,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        cost,
        responseTimeMs: responseTime,
      });

      // Finalize Langfuse trace
      await this.langfuse.shutdownAsync();

      // Log performance metrics
      logPerformance('llm-completion', responseTime, {
        model: mergedOptions.model,
        tokens: usage.total_tokens,
        cost,
        userId,
      });

      logger.info('LLM completion generated successfully', {
        userId,
        conversationId,
        model: mergedOptions.model,
        responseTime,
        tokens: usage.total_tokens,
        cost,
      });

      return {
        message: completion.choices[0].message.content || '',
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        },
        cost,
        response_time_ms: responseTime,
        model: mergedOptions.model!,
      };
    } catch (error) {
      const errorTime = Date.now() - startTime;
      
      // Update trace with error
      trace.update({ 
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { error: true, responseTime: errorTime },
      });

      logger.error('LLM completion failed', {
        userId,
        conversationId,
        model: mergedOptions.model,
        responseTime: errorTime,
        error: error instanceof Error ? error.message : String(error),
      });

      // Check for specific OpenAI errors
      if (error instanceof Error) {
        if (error.message.includes('rate limit')) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (error.message.includes('token')) {
          throw new Error('Message too long. Please shorten your input.');
        } else if (error.message.includes('content policy')) {
          throw new Error('Content violates usage policies.');
        }
      }

      throw error;
    }
  }

  /**
   * Calculate cost based on model and token usage
   */
  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = this.costPerToken[model as keyof typeof this.costPerToken];
    if (!pricing) {
      logger.warn(`Unknown model pricing: ${model}`);
      return 0;
    }

    return (promptTokens * pricing.input) + (completionTokens * pricing.output);
  }

  /**
   * Log usage metrics to database for analytics
   */
  private async logUsageMetrics(metrics: {
    userId: string;
    conversationId: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    responseTimeMs: number;
  }): Promise<void> {
    try {
      await db.insert<LLMUsage>('llm_usage', {
        user_id: metrics.userId,
        conversation_id: metrics.conversationId,
        model: metrics.model,
        prompt_tokens: metrics.promptTokens,
        completion_tokens: metrics.completionTokens,
        total_tokens: metrics.totalTokens,
        cost: metrics.cost,
        response_time_ms: metrics.responseTimeMs,
      });
    } catch (error) {
      logger.error('Failed to log usage metrics:', error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  /**
   * Validate request parameters and check limits
   */
  private async validateRequest(messages: ChatMessage[], options: LLMOptions): Promise<void> {
    // Check message count
    if (messages.length === 0) {
      throw new Error('At least one message is required');
    }

    if (messages.length > 50) {
      throw new Error('Too many messages in conversation');
    }

    // Estimate token count (rough approximation)
    const estimatedTokens = messages.reduce((total, msg) => {
      return total + Math.ceil(msg.content.length / 4); // Rough token estimation
    }, 0);

    const maxTokens = options.max_tokens || this.defaultOptions.max_tokens!;
    const modelLimit = this.getModelLimit(options.model || this.defaultOptions.model!);

    if (estimatedTokens + maxTokens > modelLimit) {
      throw new Error(`Estimated token count (${estimatedTokens}) plus max_tokens (${maxTokens}) exceeds model limit (${modelLimit})`);
    }
  }

  /**
   * Get token limit for a model
   */
  private getModelLimit(model: string): number {
    const limits: Record<string, number> = {
      'gpt-4': 8192,
      'gpt-4-turbo': 128000,
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384,
    };

    return limits[model] || 4096;
  }

  /**
   * Get user usage statistics
   */
  async getUserUsageStats(userId: string, timeframe: 'day' | 'week' | 'month' = 'day') {
    const intervals = {
      day: '1 day',
      week: '7 days',
      month: '30 days',
    };

    const result = await db.query(`
      SELECT 
        COUNT(*) as request_count,
        SUM(total_tokens) as total_tokens,
        SUM(cost) as total_cost,
        AVG(response_time_ms) as avg_response_time,
        MIN(created_at) as first_request,
        MAX(created_at) as last_request
      FROM llm_usage 
      WHERE user_id = $1 
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${intervals[timeframe]}'
    `, [userId]);

    return {
      timeframe,
      stats: result[0] || {
        request_count: 0,
        total_tokens: 0,
        total_cost: 0,
        avg_response_time: 0,
        first_request: null,
        last_request: null,
      },
    };
  }

  /**
   * Check if user is within usage limits
   */
  async checkUsageLimits(userId: string): Promise<{ withinLimit: boolean; usage: any; limit: any }> {
    const dailyStats = await this.getUserUsageStats(userId, 'day');
    const monthlyStats = await this.getUserUsageStats(userId, 'month');

    // Define limits (these could be configurable per user tier)
    const limits = {
      daily: {
        requests: 100,
        tokens: 100000,
        cost: 10.0, // $10
      },
      monthly: {
        requests: 2000,
        tokens: 2000000,
        cost: 200.0, // $200
      },
    };

    const dailyUsage = dailyStats.stats;
    const monthlyUsage = monthlyStats.stats;

    const withinDailyLimit = 
      dailyUsage.request_count < limits.daily.requests &&
      dailyUsage.total_tokens < limits.daily.tokens &&
      dailyUsage.total_cost < limits.daily.cost;

    const withinMonthlyLimit = 
      monthlyUsage.request_count < limits.monthly.requests &&
      monthlyUsage.total_tokens < limits.monthly.tokens &&
      monthlyUsage.total_cost < limits.monthly.cost;

    return {
      withinLimit: withinDailyLimit && withinMonthlyLimit,
      usage: {
        daily: dailyUsage,
        monthly: monthlyUsage,
      },
      limit: limits,
    };
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return Object.keys(this.costPerToken);
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{ status: string; models: string[] }> {
    try {
      // Try a simple API call to verify connection
      await this.openai.models.list();
      
      return {
        status: 'healthy',
        models: this.getAvailableModels(),
      };
    } catch (error) {
      logger.error('LLM service health check failed:', error);
      return {
        status: 'unhealthy',
        models: [],
      };
    }
  }
}