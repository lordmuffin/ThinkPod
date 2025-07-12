import { db } from '../utils/database';
import { logger, logPerformance } from '../utils/logger';
import { EmbeddingService } from './EmbeddingService';
import type { DocumentSearchResult } from '@thinkpod/shared';

export interface SearchOptions {
  limit?: number;
  similarity_threshold?: number;
  include_metadata?: boolean;
  filter_document_ids?: string[];
  exclude_document_ids?: string[];
}

export interface HybridSearchOptions extends SearchOptions {
  keyword_weight?: number;
  semantic_weight?: number;
  keyword_boost?: number;
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_filename: string;
  chunk_index: number;
  content: string;
  similarity_score: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total_results: number;
  query: string;
  processing_time_ms: number;
  search_type: 'semantic' | 'hybrid' | 'keyword';
  similarity_threshold: number;
}

export class VectorSearchService {
  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Perform semantic similarity search using vector embeddings
   */
  async semanticSearch(
    query: string,
    userId: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const {
      limit = 10,
      similarity_threshold = 0.7,
      include_metadata = true,
      filter_document_ids,
      exclude_document_ids
    } = options;

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(query);
      
      // Build search query with filters
      let searchQuery = `
        SELECT 
          dc.id as chunk_id,
          dc.document_id,
          d.title as document_title,
          d.filename as document_filename,
          dc.chunk_index,
          dc.content,
          1 - (dc.embedding <=> $1::vector) AS similarity_score,
          ${include_metadata ? 'dc.metadata,' : 'NULL as metadata,'}
          dc.created_at
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.user_id = $2
          AND d.processing_status = 'completed'
          AND dc.embedding IS NOT NULL
      `;

      const queryParams: any[] = [JSON.stringify(queryEmbedding), userId];
      let paramIndex = 2;

      // Add document ID filters
      if (filter_document_ids && filter_document_ids.length > 0) {
        paramIndex++;
        searchQuery += ` AND dc.document_id = ANY($${paramIndex})`;
        queryParams.push(filter_document_ids);
      }

      if (exclude_document_ids && exclude_document_ids.length > 0) {
        paramIndex++;
        searchQuery += ` AND dc.document_id != ALL($${paramIndex})`;
        queryParams.push(exclude_document_ids);
      }

      // Add similarity threshold filter
      paramIndex++;
      searchQuery += ` AND (1 - (dc.embedding <=> $1::vector)) >= $${paramIndex}`;
      queryParams.push(similarity_threshold);

      // Order by similarity and limit results
      searchQuery += `
        ORDER BY dc.embedding <=> $1::vector
        LIMIT $${paramIndex + 1}
      `;
      queryParams.push(limit);

      // Execute search
      const results = await db.query<SearchResult>(searchQuery, queryParams);

      const processingTime = Date.now() - startTime;

      // Log performance
      logPerformance('semantic-search', processingTime, {
        query,
        userId,
        resultsCount: results.length,
        similarity_threshold,
        limit
      });

      logger.info('Semantic search completed', {
        query,
        userId,
        resultsCount: results.length,
        processingTime,
        similarity_threshold
      });

      return {
        results: results.map(this.formatSearchResult),
        total_results: results.length,
        query,
        processing_time_ms: processingTime,
        search_type: 'semantic',
        similarity_threshold
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Semantic search failed', {
        query,
        userId,
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform hybrid search combining semantic similarity and keyword matching
   */
  async hybridSearch(
    query: string,
    userId: string,
    options: HybridSearchOptions = {}
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const {
      limit = 10,
      similarity_threshold = 0.5, // Lower threshold for hybrid search
      keyword_weight = 0.3,
      semantic_weight = 0.7,
      keyword_boost = 1.2,
      include_metadata = true,
      filter_document_ids,
      exclude_document_ids
    } = options;

    try {
      // Generate query embedding for semantic component
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(query);
      
      // Prepare query terms for keyword search
      const queryTerms = this.extractKeywords(query);
      const tsQuery = this.buildTsQuery(queryTerms);

      // Build hybrid search query
      let searchQuery = `
        WITH semantic_scores AS (
          SELECT 
            dc.id as chunk_id,
            dc.document_id,
            d.title as document_title,
            d.filename as document_filename,
            dc.chunk_index,
            dc.content,
            1 - (dc.embedding <=> $1::vector) AS semantic_score,
            ${include_metadata ? 'dc.metadata,' : 'NULL as metadata,'}
            dc.created_at
          FROM document_chunks dc
          JOIN documents d ON dc.document_id = d.id
          WHERE d.user_id = $2
            AND d.processing_status = 'completed'
            AND dc.embedding IS NOT NULL
        ),
        keyword_scores AS (
          SELECT 
            dc.id as chunk_id,
            ts_rank_cd(to_tsvector('english', dc.content), to_tsquery('english', $3)) * $4 AS keyword_score
          FROM document_chunks dc
          JOIN documents d ON dc.document_id = d.id
          WHERE d.user_id = $2
            AND d.processing_status = 'completed'
            AND to_tsvector('english', dc.content) @@ to_tsquery('english', $3)
        )
        SELECT 
          s.chunk_id,
          s.document_id,
          s.document_title,
          s.document_filename,
          s.chunk_index,
          s.content,
          (
            (s.semantic_score * $5) + 
            (COALESCE(k.keyword_score, 0) * $6)
          ) AS similarity_score,
          s.metadata,
          s.created_at
        FROM semantic_scores s
        LEFT JOIN keyword_scores k ON s.chunk_id = k.chunk_id
        WHERE s.semantic_score >= $7
      `;

      const queryParams: any[] = [
        JSON.stringify(queryEmbedding), // $1
        userId, // $2
        tsQuery, // $3
        keyword_boost, // $4
        semantic_weight, // $5
        keyword_weight, // $6
        similarity_threshold // $7
      ];
      let paramIndex = 7;

      // Add document ID filters
      if (filter_document_ids && filter_document_ids.length > 0) {
        paramIndex++;
        searchQuery += ` AND s.document_id = ANY($${paramIndex})`;
        queryParams.push(filter_document_ids);
      }

      if (exclude_document_ids && exclude_document_ids.length > 0) {
        paramIndex++;
        searchQuery += ` AND s.document_id != ALL($${paramIndex})`;
        queryParams.push(exclude_document_ids);
      }

      // Order by combined score and limit results
      searchQuery += `
        ORDER BY similarity_score DESC
        LIMIT $${paramIndex + 1}
      `;
      queryParams.push(limit);

      // Execute search
      const results = await db.query<SearchResult>(searchQuery, queryParams);

      const processingTime = Date.now() - startTime;

      // Log performance
      logPerformance('hybrid-search', processingTime, {
        query,
        userId,
        resultsCount: results.length,
        semantic_weight,
        keyword_weight,
        similarity_threshold,
        limit
      });

      logger.info('Hybrid search completed', {
        query,
        userId,
        resultsCount: results.length,
        processingTime,
        semantic_weight,
        keyword_weight
      });

      return {
        results: results.map(this.formatSearchResult),
        total_results: results.length,
        query,
        processing_time_ms: processingTime,
        search_type: 'hybrid',
        similarity_threshold
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Hybrid search failed', {
        query,
        userId,
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Hybrid search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get similar chunks for document context in LLM queries
   */
  async getDocumentContext(
    query: string,
    userId: string,
    options: {
      max_chunks?: number;
      similarity_threshold?: number;
      conversation_id?: string;
    } = {}
  ): Promise<{
    context: string[];
    source_chunks: Array<{
      document_id: string;
      document_title: string;
      chunk_index: number;
      similarity_score: number;
    }>;
    total_characters: number;
  }> {
    const {
      max_chunks = 5,
      similarity_threshold = 0.7,
      conversation_id
    } = options;

    // Perform semantic search
    const searchResult = await this.semanticSearch(query, userId, {
      limit: max_chunks,
      similarity_threshold,
      include_metadata: false
    });

    // Extract context and source information
    const context = searchResult.results.map(result => result.content);
    const source_chunks = searchResult.results.map(result => ({
      document_id: result.document_id,
      document_title: result.document_title,
      chunk_index: result.chunk_index,
      similarity_score: result.similarity_score
    }));

    const total_characters = context.reduce((sum, text) => sum + text.length, 0);

    // Log context retrieval for LLM integration
    logger.info('Document context retrieved for LLM', {
      query,
      userId,
      conversation_id,
      chunks_found: context.length,
      total_characters,
      similarity_threshold
    });

    return {
      context,
      source_chunks,
      total_characters
    };
  }

  /**
   * Search within specific documents
   */
  async searchInDocuments(
    query: string,
    documentIds: string[],
    userId: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    return await this.semanticSearch(query, userId, {
      ...options,
      filter_document_ids: documentIds
    });
  }

  /**
   * Get chunks from a specific document
   */
  async getDocumentChunks(
    documentId: string,
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      include_embeddings?: boolean;
    } = {}
  ): Promise<{
    chunks: SearchResult[];
    total_chunks: number;
    document_title: string;
  }> {
    const { limit = 50, offset = 0, include_embeddings = false } = options;

    try {
      // Verify user has access to the document
      const document = await db.query(`
        SELECT title FROM documents 
        WHERE id = $1 AND user_id = $2
      `, [documentId, userId]);

      if (document.length === 0) {
        throw new Error('Document not found or access denied');
      }

      // Get chunks
      const chunks = await db.query<SearchResult>(`
        SELECT 
          dc.id as chunk_id,
          dc.document_id,
          $3 as document_title,
          '' as document_filename,
          dc.chunk_index,
          dc.content,
          0 as similarity_score,
          dc.metadata,
          dc.created_at
        FROM document_chunks dc
        WHERE dc.document_id = $1
        ORDER BY dc.chunk_index
        LIMIT $4 OFFSET $5
      `, [documentId, userId, document[0].title, limit, offset]);

      // Get total count
      const countResult = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM document_chunks
        WHERE document_id = $1
      `, [documentId]);

      const total_chunks = parseInt(countResult[0].count);

      return {
        chunks: chunks.map(this.formatSearchResult),
        total_chunks,
        document_title: document[0].title
      };

    } catch (error) {
      logger.error('Failed to get document chunks', {
        documentId,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Failed to get document chunks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find similar documents based on content
   */
  async findSimilarDocuments(
    documentId: string,
    userId: string,
    limit = 5
  ): Promise<Array<{
    document_id: string;
    document_title: string;
    similarity_score: number;
    chunk_count: number;
  }>> {
    try {
      // Get representative chunks from the source document
      const sourceChunks = await db.query(`
        SELECT embedding FROM document_chunks 
        WHERE document_id = $1 
        ORDER BY chunk_index 
        LIMIT 3
      `, [documentId]);

      if (sourceChunks.length === 0) {
        return [];
      }

      // Calculate average embedding
      const avgEmbedding = this.calculateAverageEmbedding(
        sourceChunks.map(chunk => chunk.embedding)
      );

      // Find similar documents
      const similarDocuments = await db.query(`
        SELECT 
          d.id as document_id,
          d.title as document_title,
          AVG(1 - (dc.embedding <=> $1::vector)) as similarity_score,
          COUNT(dc.id) as chunk_count
        FROM documents d
        JOIN document_chunks dc ON d.id = dc.document_id
        WHERE d.user_id = $2 
          AND d.id != $3
          AND d.processing_status = 'completed'
          AND dc.embedding IS NOT NULL
        GROUP BY d.id, d.title
        HAVING AVG(1 - (dc.embedding <=> $1::vector)) > 0.6
        ORDER BY similarity_score DESC
        LIMIT $4
      `, [JSON.stringify(avgEmbedding), userId, documentId, limit]);

      return similarDocuments;

    } catch (error) {
      logger.error('Failed to find similar documents', {
        documentId,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Failed to find similar documents: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract keywords from query for hybrid search
   */
  private extractKeywords(query: string): string[] {
    // Simple keyword extraction - in production, you might want more sophisticated NLP
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isStopWord(word));
  }

  /**
   * Build PostgreSQL tsquery from keywords
   */
  private buildTsQuery(keywords: string[]): string {
    if (keywords.length === 0) return '';
    
    // Join keywords with OR operator and add wildcard matching
    return keywords
      .map(keyword => `${keyword}:*`)
      .join(' | ');
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ]);
    return stopWords.has(word);
  }

  /**
   * Calculate average embedding from multiple embeddings
   */
  private calculateAverageEmbedding(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    
    const dimensions = embeddings[0].length;
    const avgEmbedding = new Array(dimensions).fill(0);
    
    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        avgEmbedding[i] += embedding[i];
      }
    }
    
    for (let i = 0; i < dimensions; i++) {
      avgEmbedding[i] /= embeddings.length;
    }
    
    return avgEmbedding;
  }

  /**
   * Format search result for API response
   */
  private formatSearchResult(result: SearchResult): SearchResult {
    return {
      ...result,
      similarity_score: Math.round(result.similarity_score * 10000) / 10000, // Round to 4 decimal places
      created_at: result.created_at
    };
  }

  /**
   * Health check for vector search service
   */
  async healthCheck(): Promise<{ status: string; index_count: number }> {
    try {
      // Check if vector extension is available and count indexed documents
      const result = await db.query(`
        SELECT COUNT(*) as count 
        FROM document_chunks 
        WHERE embedding IS NOT NULL
      `);
      
      return {
        status: 'healthy',
        index_count: parseInt(result[0].count)
      };
    } catch (error) {
      logger.error('Vector search service health check failed:', error);
      return {
        status: 'unhealthy',
        index_count: 0
      };
    }
  }
}