import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { db } from '../utils/database';
import { logger, logPerformance } from '../utils/logger';
import { TextExtractionService } from './TextExtractionService';
import { EmbeddingService } from './EmbeddingService';
import { VectorSearchService } from './VectorSearchService';
import { TextChunker } from '../utils/textChunking';
import type { Document, DocumentChunk } from '@thinkpod/shared';

export interface DocumentProcessingOptions {
  generateEmbeddings?: boolean;
  chunkOptions?: {
    maxChunkSize?: number;
    chunkOverlap?: number;
    preserveSentences?: boolean;
    preserveParagraphs?: boolean;
  };
  extractionOptions?: {
    preserveFormatting?: boolean;
    maxLength?: number;
  };
}

export interface DocumentProcessingResult {
  document: Document;
  chunks?: DocumentChunk[];
  processing_time_ms: number;
  extraction_result?: any;
  embedding_result?: any;
  success: boolean;
  error?: string;
}

export interface DocumentStats {
  total_documents: number;
  total_size: number;
  processing_status: Record<string, number>;
  file_types: Record<string, number>;
  total_chunks: number;
  avg_chunks_per_document: number;
}

export class DocumentService {
  private textExtractor: TextExtractionService;
  private embeddingService: EmbeddingService;
  private vectorSearchService: VectorSearchService;
  private textChunker: TextChunker;
  private uploadsDir: string;

  constructor() {
    this.textExtractor = new TextExtractionService();
    this.embeddingService = new EmbeddingService();
    this.vectorSearchService = new VectorSearchService();
    this.textChunker = new TextChunker();
    this.uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
  }

  /**
   * Process uploaded document through the complete pipeline
   */
  async processDocument(
    filePath: string,
    originalName: string,
    userId: string,
    mimeType: string,
    fileSize: number,
    title?: string,
    options: DocumentProcessingOptions = {}
  ): Promise<DocumentProcessingResult> {
    const startTime = Date.now();
    const { generateEmbeddings = true, chunkOptions = {}, extractionOptions = {} } = options;

    let document: Document | null = null;
    let chunks: DocumentChunk[] = [];

    try {
      // 1. Calculate file hash for duplicate detection
      const contentHash = await this.calculateFileHash(filePath);
      
      // 2. Check for existing document with same hash
      const existingDoc = await this.findDocumentByHash(contentHash, userId);
      if (existingDoc) {
        logger.info('Document already exists with same content hash', {
          existingDocId: existingDoc.id,
          userId,
          originalName
        });
        
        return {
          document: existingDoc,
          processing_time_ms: Date.now() - startTime,
          success: true
        };
      }

      // 3. Create document record
      document = await this.createDocumentRecord(
        filePath,
        originalName,
        userId,
        mimeType,
        fileSize,
        contentHash,
        title
      );

      logger.info('Document processing started', {
        documentId: document.id,
        userId,
        originalName,
        fileSize,
        mimeType
      });

      // 4. Update status to processing
      await this.updateDocumentStatus(document.id, 'processing');

      // 5. Extract text content
      const extractionResult = await this.textExtractor.extractText(
        filePath,
        mimeType,
        extractionOptions
      );

      if (!extractionResult.content || extractionResult.content.trim().length === 0) {
        throw new Error('No text content could be extracted from the document');
      }

      // 6. Chunk the extracted text
      const textChunks = this.textChunker.chunkText(extractionResult.content, {
        maxChunkSize: 1000,
        chunkOverlap: 100,
        preserveSentences: true,
        preserveParagraphs: true,
        ...chunkOptions
      });

      if (textChunks.length === 0) {
        throw new Error('Document could not be chunked - content may be too short');
      }

      // 7. Generate embeddings if requested
      let embeddingResult;
      if (generateEmbeddings) {
        embeddingResult = await this.embeddingService.generateEmbeddings(
          textChunks.map(chunk => ({
            content: chunk.content,
            chunk_index: chunk.chunk_index
          }))
        );

        // 8. Store chunks with embeddings
        await this.embeddingService.storeEmbeddings(
          document.id,
          textChunks.map(chunk => ({
            content: chunk.content,
            chunk_index: chunk.chunk_index,
            content_tokens: chunk.content_tokens,
            metadata: chunk.metadata
          })),
          embeddingResult.embeddings
        );
      } else {
        // Store chunks without embeddings
        await this.storeChunksWithoutEmbeddings(document.id, textChunks);
      }

      // 9. Update document with final status and chunk count
      await this.updateDocumentProcessing(document.id, {
        processing_status: 'completed',
        chunk_count: textChunks.length
      });

      // 10. Get final document state
      const finalDocument = await db.findById<Document>('documents', document.id);
      const storedChunks = await this.getDocumentChunks(document.id);

      const processingTime = Date.now() - startTime;

      // Log completion
      logPerformance('document-processing', processingTime, {
        documentId: document.id,
        userId,
        fileSize,
        chunkCount: textChunks.length,
        contentLength: extractionResult.content.length,
        embeddingsGenerated: generateEmbeddings,
        cost: embeddingResult?.cost || 0
      });

      logger.info('Document processing completed successfully', {
        documentId: document.id,
        userId,
        processingTime,
        chunkCount: textChunks.length,
        status: 'completed'
      });

      return {
        document: finalDocument!,
        chunks: storedChunks,
        processing_time_ms: processingTime,
        extraction_result: {
          content_length: extractionResult.content.length,
          word_count: extractionResult.metadata.wordCount,
          metadata: extractionResult.metadata
        },
        embedding_result: embeddingResult,
        success: true
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update document status to failed if document was created
      if (document) {
        await this.updateDocumentStatus(document.id, 'failed');
      }

      logger.error('Document processing failed', {
        documentId: document?.id,
        userId,
        originalName,
        processingTime,
        error: errorMessage
      });

      return {
        document: document!,
        processing_time_ms: processingTime,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get document with chunks
   */
  async getDocumentById(documentId: string, userId: string): Promise<{
    document: Document;
    chunks: DocumentChunk[];
  } | null> {
    try {
      // Verify user has access to document
      const document = await db.query<Document>(`
        SELECT * FROM documents 
        WHERE id = $1 AND user_id = $2
      `, [documentId, userId]);

      if (document.length === 0) {
        return null;
      }

      const chunks = await this.getDocumentChunks(documentId);

      return {
        document: document[0],
        chunks
      };

    } catch (error) {
      logger.error('Failed to get document by ID', {
        documentId,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * List user documents with pagination
   */
  async listUserDocuments(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      file_type?: string;
      search?: string;
    } = {}
  ): Promise<{
    documents: Document[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, status, file_type, search } = options;
    const offset = (page - 1) * limit;

    try {
      // Build query with filters
      let whereClause = 'WHERE user_id = $1';
      const queryParams: any[] = [userId];
      let paramIndex = 1;

      if (status) {
        paramIndex++;
        whereClause += ` AND processing_status = $${paramIndex}`;
        queryParams.push(status);
      }

      if (file_type) {
        paramIndex++;
        whereClause += ` AND file_type = $${paramIndex}`;
        queryParams.push(file_type);
      }

      if (search) {
        paramIndex++;
        whereClause += ` AND (title ILIKE $${paramIndex} OR filename ILIKE $${paramIndex})`;
        queryParams.push(`%${search}%`);
      }

      // Get documents
      const documents = await db.query<Document>(`
        SELECT * FROM documents 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
      `, [...queryParams, limit, offset]);

      // Get total count
      const countResult = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM documents ${whereClause}
      `, queryParams);

      const total = parseInt(countResult[0].count);
      const totalPages = Math.ceil(total / limit);

      return {
        documents,
        total,
        page,
        limit,
        totalPages
      };

    } catch (error) {
      logger.error('Failed to list user documents', {
        userId,
        options,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update document metadata
   */
  async updateDocument(
    documentId: string,
    userId: string,
    updates: { title?: string }
  ): Promise<Document | null> {
    try {
      // Verify user has access
      const existing = await db.query(`
        SELECT id FROM documents 
        WHERE id = $1 AND user_id = $2
      `, [documentId, userId]);

      if (existing.length === 0) {
        return null;
      }

      // Update document
      const updated = await db.update<Document>('documents', documentId, updates);

      logger.info('Document updated', {
        documentId,
        userId,
        updates
      });

      return updated;

    } catch (error) {
      logger.error('Failed to update document', {
        documentId,
        userId,
        updates,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Delete document and associated chunks
   */
  async deleteDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      // Verify user has access and get file path for cleanup
      const document = await db.query<Document>(`
        SELECT file_path FROM documents 
        WHERE id = $1 AND user_id = $2
      `, [documentId, userId]);

      if (document.length === 0) {
        return false;
      }

      // Delete document (cascades to chunks)
      await db.delete('documents', documentId);

      // Clean up file if it exists
      try {
        if (document[0].file_path) {
          await fs.unlink(document[0].file_path);
        }
      } catch (fileError) {
        logger.warn('Failed to delete document file', {
          documentId,
          filePath: document[0].file_path,
          error: fileError
        });
      }

      logger.info('Document deleted', {
        documentId,
        userId
      });

      return true;

    } catch (error) {
      logger.error('Failed to delete document', {
        documentId,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Reprocess document embeddings
   */
  async reprocessDocument(
    documentId: string,
    userId: string,
    force = false
  ): Promise<{ success: boolean; cost: number; chunks_updated: number }> {
    try {
      // Verify user has access
      const document = await db.query<Document>(`
        SELECT * FROM documents 
        WHERE id = $1 AND user_id = $2
      `, [documentId, userId]);

      if (document.length === 0) {
        throw new Error('Document not found or access denied');
      }

      if (document[0].processing_status !== 'completed' && !force) {
        throw new Error('Document must be in completed status to reprocess');
      }

      // Update embeddings
      const result = await this.embeddingService.updateEmbeddings(documentId, force);

      logger.info('Document reprocessed', {
        documentId,
        userId,
        chunksUpdated: result.updatedChunks,
        cost: result.cost
      });

      return {
        success: true,
        cost: result.cost,
        chunks_updated: result.updatedChunks
      };

    } catch (error) {
      logger.error('Failed to reprocess document', {
        documentId,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get user document statistics
   */
  async getUserDocumentStats(userId: string): Promise<DocumentStats> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_documents,
          SUM(file_size) as total_size,
          SUM(chunk_count) as total_chunks,
          AVG(chunk_count) as avg_chunks_per_document,
          processing_status,
          file_type,
          COUNT(*) FILTER (WHERE processing_status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE processing_status = 'processing') as processing_count,
          COUNT(*) FILTER (WHERE processing_status = 'completed') as completed_count,
          COUNT(*) FILTER (WHERE processing_status = 'failed') as failed_count
        FROM documents 
        WHERE user_id = $1
        GROUP BY ROLLUP(processing_status, file_type)
      `, [userId]);

      // Process the results to build the stats object
      const stats: DocumentStats = {
        total_documents: 0,
        total_size: 0,
        total_chunks: 0,
        avg_chunks_per_document: 0,
        processing_status: {},
        file_types: {}
      };

      for (const row of result) {
        if (!row.processing_status && !row.file_type) {
          // This is the total row
          stats.total_documents = parseInt(row.total_documents) || 0;
          stats.total_size = parseInt(row.total_size) || 0;
          stats.total_chunks = parseInt(row.total_chunks) || 0;
          stats.avg_chunks_per_document = parseFloat(row.avg_chunks_per_document) || 0;
        } else if (row.processing_status && !row.file_type) {
          // Processing status breakdown
          stats.processing_status[row.processing_status] = parseInt(row.total_documents) || 0;
        } else if (row.file_type && !row.processing_status) {
          // File type breakdown
          stats.file_types[row.file_type] = parseInt(row.total_documents) || 0;
        }
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get user document stats', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private async calculateFileHash(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async findDocumentByHash(hash: string, userId: string): Promise<Document | null> {
    const result = await db.query<Document>(`
      SELECT * FROM documents 
      WHERE content_hash = $1 AND user_id = $2
    `, [hash, userId]);
    
    return result.length > 0 ? result[0] : null;
  }

  private async createDocumentRecord(
    filePath: string,
    originalName: string,
    userId: string,
    mimeType: string,
    fileSize: number,
    contentHash: string,
    title?: string
  ): Promise<Document> {
    const documentTitle = title || path.parse(originalName).name;
    
    return await db.insert<Document>('documents', {
      user_id: userId,
      title: documentTitle,
      filename: originalName,
      file_path: filePath,
      file_type: mimeType,
      file_size: fileSize,
      content_hash: contentHash,
      processing_status: 'pending',
      chunk_count: 0
    });
  }

  private async updateDocumentStatus(
    documentId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    await db.update('documents', documentId, { processing_status: status });
  }

  private async updateDocumentProcessing(
    documentId: string,
    updates: { processing_status: string; chunk_count: number }
  ): Promise<void> {
    await db.update('documents', documentId, updates);
  }

  private async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    return await db.query<DocumentChunk>(`
      SELECT * FROM document_chunks 
      WHERE document_id = $1 
      ORDER BY chunk_index
    `, [documentId]);
  }

  private async storeChunksWithoutEmbeddings(
    documentId: string,
    chunks: Array<{
      content: string;
      chunk_index: number;
      content_tokens: number;
      metadata: Record<string, any>;
    }>
  ): Promise<void> {
    const insertData = chunks.map(chunk => ({
      document_id: documentId,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      content_tokens: chunk.content_tokens,
      embedding: null,
      metadata: chunk.metadata
    }));

    await db.batchInsert('document_chunks', insertData);
  }

  /**
   * Initialize uploads directory
   */
  async initializeUploadsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.uploadsDir, { recursive: true });
      logger.info('Uploads directory initialized', { directory: this.uploadsDir });
    } catch (error) {
      logger.error('Failed to initialize uploads directory', {
        directory: this.uploadsDir,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Health check for document service
   */
  async healthCheck(): Promise<{
    status: string;
    extractionService: any;
    embeddingService: any;
    vectorSearchService: any;
    uploadsDirectory: boolean;
  }> {
    try {
      const [extraction, embedding, vectorSearch] = await Promise.all([
        this.textExtractor.validateFile(__filename), // Test with current file
        this.embeddingService.healthCheck(),
        this.vectorSearchService.healthCheck()
      ]);

      let uploadsDirectoryExists = false;
      try {
        await fs.access(this.uploadsDir);
        uploadsDirectoryExists = true;
      } catch {
        uploadsDirectoryExists = false;
      }

      return {
        status: 'healthy',
        extractionService: extraction,
        embeddingService: embedding,
        vectorSearchService: vectorSearch,
        uploadsDirectory: uploadsDirectoryExists
      };
    } catch (error) {
      logger.error('Document service health check failed:', error);
      return {
        status: 'unhealthy',
        extractionService: { isValid: false },
        embeddingService: { status: 'unhealthy' },
        vectorSearchService: { status: 'unhealthy' },
        uploadsDirectory: false
      };
    }
  }
}