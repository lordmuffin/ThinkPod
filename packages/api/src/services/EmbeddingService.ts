import OpenAI from 'openai';
import { db } from '../utils/database';
import { logger, logPerformance } from '../utils/logger';
import type { DocumentChunk } from '@thinkpod/shared';

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
  index: number;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  cost: number;
  processingTime: number;
}

export interface EmbeddingOptions {
  batchSize?: number;
  model?: string;
  retryAttempts?: number;
  retryDelay?: number;
}

export class EmbeddingService {
  private openai: OpenAI;
  private readonly defaultModel = 'text-embedding-ada-002';
  private readonly maxBatchSize = 100; // OpenAI API limit
  private readonly maxInputLength = 8191; // OpenAI token limit for ada-002
  
  // Cost per token for text-embedding-ada-002 (as of 2024)
  private readonly costPerToken = 0.0000001; // $0.0001 per 1K tokens

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for EmbeddingService');
    }
  }

  /**
   * Generate embeddings for multiple text chunks
   */
  async generateEmbeddings(
    chunks: Array<{ content: string; chunk_index: number }>,
    options: EmbeddingOptions = {}
  ): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const {
      batchSize = 50, // Conservative batch size for stability
      model = this.defaultModel,
      retryAttempts = 3,
      retryDelay = 1000
    } = options;

    // Validate batch size
    const actualBatchSize = Math.min(batchSize, this.maxBatchSize);
    
    // Validate and prepare chunks
    const validChunks = this.validateChunks(chunks);
    
    if (validChunks.length === 0) {
      throw new Error('No valid chunks provided for embedding generation');
    }

    try {
      const allEmbeddings: EmbeddingResult[] = [];
      let totalTokens = 0;

      // Process chunks in batches
      for (let i = 0; i < validChunks.length; i += actualBatchSize) {
        const batch = validChunks.slice(i, i + actualBatchSize);
        const batchResult = await this.processBatch(batch, model, retryAttempts, retryDelay);
        
        allEmbeddings.push(...batchResult.embeddings);
        totalTokens += batchResult.totalTokens;

        // Log progress for large batches
        if (validChunks.length > actualBatchSize) {
          logger.info(`Processed embedding batch ${Math.floor(i / actualBatchSize) + 1}/${Math.ceil(validChunks.length / actualBatchSize)}`, {
            processed: i + batch.length,
            total: validChunks.length,
            batchTokens: batchResult.totalTokens
          });
        }

        // Rate limiting: small delay between batches
        if (i + actualBatchSize < validChunks.length) {
          await this.delay(100);
        }
      }

      const processingTime = Date.now() - startTime;
      const cost = this.calculateCost(totalTokens);

      // Log performance metrics
      logPerformance('embedding-generation', processingTime, {
        model,
        chunks: validChunks.length,
        totalTokens,
        cost,
        avgTokensPerChunk: Math.round(totalTokens / validChunks.length)
      });

      logger.info('Batch embedding generation completed', {
        totalChunks: validChunks.length,
        totalTokens,
        cost,
        processingTime,
        model
      });

      return {
        embeddings: allEmbeddings,
        totalTokens,
        cost,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Batch embedding generation failed', {
        chunks: validChunks.length,
        model,
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate embedding for a single query string
   */
  async generateQueryEmbedding(
    query: string,
    model = this.defaultModel
  ): Promise<number[]> {
    const startTime = Date.now();
    
    try {
      // Validate and truncate query if necessary
      const validatedQuery = this.validateAndTruncateText(query);
      
      const response = await this.openai.embeddings.create({
        model,
        input: validatedQuery,
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;
      const tokens = response.usage.total_tokens;
      const cost = this.calculateCost(tokens);
      const processingTime = Date.now() - startTime;

      logger.info('Query embedding generated', {
        queryLength: query.length,
        tokens,
        cost,
        processingTime,
        model
      });

      return embedding;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Query embedding generation failed', {
        queryLength: query.length,
        model,
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Query embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Store embeddings in database
   */
  async storeEmbeddings(
    documentId: string,
    chunks: Array<{
      content: string;
      chunk_index: number;
      content_tokens: number;
      metadata?: Record<string, any>;
    }>,
    embeddings: EmbeddingResult[]
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error('Chunks and embeddings arrays must have the same length');
    }

    try {
      // Prepare batch insert data
      const insertData = chunks.map((chunk, index) => ({
        document_id: documentId,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        content_tokens: chunk.content_tokens,
        embedding: embeddings[index].embedding,
        metadata: chunk.metadata || {}
      }));

      // Batch insert all chunks
      await db.batchInsert('document_chunks', insertData);

      logger.info('Embeddings stored successfully', {
        documentId,
        chunkCount: chunks.length,
        totalTokens: chunks.reduce((sum, chunk) => sum + chunk.content_tokens, 0)
      });

    } catch (error) {
      logger.error('Failed to store embeddings', {
        documentId,
        chunkCount: chunks.length,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Failed to store embeddings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update embeddings for existing document chunks
   */
  async updateEmbeddings(
    documentId: string,
    forceRegenerate = false
  ): Promise<{ updatedChunks: number; cost: number }> {
    try {
      // Get existing chunks
      const chunks = await db.query<DocumentChunk>(`
        SELECT * FROM document_chunks 
        WHERE document_id = $1 
        ORDER BY chunk_index
      `, [documentId]);

      if (chunks.length === 0) {
        logger.warn('No chunks found for document', { documentId });
        return { updatedChunks: 0, cost: 0 };
      }

      // Filter chunks that need embedding updates
      const chunksToUpdate = forceRegenerate 
        ? chunks 
        : chunks.filter(chunk => !chunk.embedding || chunk.embedding.length === 0);

      if (chunksToUpdate.length === 0) {
        logger.info('All chunks already have embeddings', { documentId });
        return { updatedChunks: 0, cost: 0 };
      }

      // Generate new embeddings
      const batchResult = await this.generateEmbeddings(
        chunksToUpdate.map(chunk => ({
          content: chunk.content,
          chunk_index: chunk.chunk_index
        }))
      );

      // Update chunks in database
      for (let i = 0; i < chunksToUpdate.length; i++) {
        const chunk = chunksToUpdate[i];
        const embedding = batchResult.embeddings[i];
        
        await db.update('document_chunks', chunk.id, {
          embedding: embedding.embedding
        });
      }

      logger.info('Document embeddings updated', {
        documentId,
        updatedChunks: chunksToUpdate.length,
        cost: batchResult.cost
      });

      return {
        updatedChunks: chunksToUpdate.length,
        cost: batchResult.cost
      };

    } catch (error) {
      logger.error('Failed to update embeddings', {
        documentId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Failed to update embeddings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process a batch of chunks
   */
  private async processBatch(
    chunks: Array<{ content: string; chunk_index: number }>,
    model: string,
    retryAttempts: number,
    retryDelay: number
  ): Promise<{ embeddings: EmbeddingResult[]; totalTokens: number }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const inputs = chunks.map(chunk => this.validateAndTruncateText(chunk.content));
        
        const response = await this.openai.embeddings.create({
          model,
          input: inputs,
          encoding_format: 'float'
        });

        const embeddings: EmbeddingResult[] = response.data.map((item, index) => ({
          embedding: item.embedding,
          tokens: Math.round(response.usage.total_tokens / chunks.length), // Approximate tokens per chunk
          index: chunks[index].chunk_index
        }));

        return {
          embeddings,
          totalTokens: response.usage.total_tokens
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < retryAttempts) {
          logger.warn(`Embedding batch attempt ${attempt} failed, retrying...`, {
            error: lastError.message,
            nextAttemptIn: retryDelay * attempt
          });
          
          await this.delay(retryDelay * attempt);
        }
      }
    }

    throw lastError;
  }

  /**
   * Validate and prepare chunks for embedding
   */
  private validateChunks(chunks: Array<{ content: string; chunk_index: number }>): Array<{ content: string; chunk_index: number }> {
    return chunks
      .filter(chunk => chunk.content && chunk.content.trim().length > 0)
      .map(chunk => ({
        content: this.validateAndTruncateText(chunk.content),
        chunk_index: chunk.chunk_index
      }));
  }

  /**
   * Validate and truncate text to fit model limits
   */
  private validateAndTruncateText(text: string): string {
    if (!text || text.trim().length === 0) {
      throw new Error('Text content cannot be empty');
    }

    // Rough estimation: 1 token ≈ 4 characters for English text
    const estimatedTokens = Math.ceil(text.length / 4);
    
    if (estimatedTokens <= this.maxInputLength) {
      return text.trim();
    }

    // Truncate to fit within token limit
    const maxCharacters = this.maxInputLength * 4;
    const truncated = text.substring(0, maxCharacters).trim();
    
    logger.warn('Text truncated for embedding', {
      originalLength: text.length,
      truncatedLength: truncated.length,
      estimatedTokens
    });

    return truncated;
  }

  /**
   * Calculate cost based on token usage
   */
  private calculateCost(tokens: number): number {
    return tokens * this.costPerToken;
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get available embedding models
   */
  getAvailableModels(): string[] {
    return [
      'text-embedding-ada-002',
      'text-embedding-3-small',
      'text-embedding-3-large'
    ];
  }

  /**
   * Estimate cost for embedding generation
   */
  estimateCost(chunks: Array<{ content: string }>): { estimatedTokens: number; estimatedCost: number } {
    const estimatedTokens = chunks.reduce((total, chunk) => {
      return total + Math.ceil(chunk.content.length / 4);
    }, 0);

    return {
      estimatedTokens,
      estimatedCost: this.calculateCost(estimatedTokens)
    };
  }

  /**
   * Health check for the embedding service
   */
  async healthCheck(): Promise<{ status: string; model: string }> {
    try {
      // Test with a simple query
      await this.generateQueryEmbedding('test', this.defaultModel);
      
      return {
        status: 'healthy',
        model: this.defaultModel
      };
    } catch (error) {
      logger.error('Embedding service health check failed:', error);
      return {
        status: 'unhealthy',
        model: this.defaultModel
      };
    }
  }
}