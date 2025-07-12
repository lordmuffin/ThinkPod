import express, { Request, Response } from 'express';
import { z } from 'zod';
import { DocumentService } from '../services/DocumentService';
import { VectorSearchService } from '../services/VectorSearchService';
import { logger } from '../utils/logger';
import { asyncHandler, validateRequest, AppError } from '../middleware/errorHandler';
import { 
  uploadSingle, 
  uploadMultiple, 
  handleUploadErrors, 
  validateUploadedFile,
  validateUploadedFiles 
} from '../middleware/upload';
import { schemas } from '@thinkpod/shared';
import type { 
  DocumentResponse,
  DocumentSearchResult,
  DocumentContextResponse 
} from '@thinkpod/shared';

const router = express.Router();

// Initialize services
const documentService = new DocumentService();
const vectorSearchService = new VectorSearchService();

// Validation schemas for route parameters and queries
const documentIdSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid document ID format')
  })
});

const paginationSchema = z.object({
  query: z.object({
    page: z.string().transform(Number).pipe(z.number().min(1)).default('1'),
    limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).default('20'),
    status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
    file_type: z.string().optional(),
    search: z.string().optional()
  })
});

const documentSearchRequestSchema = z.object({
  body: schemas.documentSearch
});

const hybridSearchRequestSchema = z.object({
  body: schemas.hybridSearch
});

const documentContextRequestSchema = z.object({
  body: schemas.documentContext
});

const documentUpdateRequestSchema = z.object({
  body: schemas.documentUpdate,
  params: z.object({
    id: z.string().uuid()
  })
});

const reprocessRequestSchema = z.object({
  body: schemas.documentReprocess.optional().default({}),
  params: z.object({
    id: z.string().uuid()
  })
});

/**
 * POST /api/documents/upload - Upload new document
 */
router.post('/upload', 
  uploadSingle, 
  handleUploadErrors, 
  validateUploadedFile,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const { title } = req.body;
    const file = req.file;

    try {
      logger.info('Document upload initiated', {
        userId: req.userId,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      });

      // Process document through the complete pipeline
      const result = await documentService.processDocument(
        file.path,
        file.originalname,
        req.userId!,
        file.detectedMimeType || file.mimetype,
        file.size,
        title,
        {
          generateEmbeddings: true,
          chunkOptions: {
            maxChunkSize: 1000,
            chunkOverlap: 100,
            preserveSentences: true,
            preserveParagraphs: true
          }
        }
      );

      if (!result.success) {
        throw new AppError(result.error || 'Document processing failed', 500);
      }

      const documentResponse: DocumentResponse = {
        id: result.document.id,
        title: result.document.title,
        filename: result.document.filename,
        file_type: result.document.file_type,
        file_size: result.document.file_size,
        processing_status: result.document.processing_status,
        chunk_count: result.document.chunk_count,
        created_at: result.document.created_at.toISOString(),
        updated_at: result.document.updated_at.toISOString()
      };

      logger.info('Document upload completed successfully', {
        documentId: result.document.id,
        userId: req.userId,
        processingTime: result.processing_time_ms,
        chunkCount: result.document.chunk_count
      });

      res.status(201).json({
        success: true,
        document: documentResponse,
        processing_time_ms: result.processing_time_ms,
        extraction_stats: result.extraction_result,
        embedding_stats: result.embedding_result
      });

    } catch (error) {
      logger.error('Document upload failed', {
        userId: req.userId,
        originalName: file.originalname,
        error: error instanceof Error ? error.message : String(error)
      });

      // Clean up uploaded file on error
      try {
        await import('fs').then(fs => fs.promises.unlink(file.path));
      } catch (cleanupError) {
        logger.warn('Failed to clean up uploaded file', { filePath: file.path });
      }

      throw error;
    }
  })
);

/**
 * POST /api/documents/upload-multiple - Upload multiple documents
 */
router.post('/upload-multiple',
  uploadMultiple,
  handleUploadErrors,
  validateUploadedFiles,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new AppError('No files uploaded', 400);
    }

    const files = req.files as Express.Multer.File[];
    const results = [];
    const errors = [];

    logger.info('Multiple document upload initiated', {
      userId: req.userId,
      fileCount: files.length
    });

    // Process each file
    for (const file of files) {
      try {
        const result = await documentService.processDocument(
          file.path,
          file.originalname,
          req.userId!,
          file.detectedMimeType || file.mimetype,
          file.size,
          undefined, // No title for batch upload
          { generateEmbeddings: true }
        );

        if (result.success) {
          results.push({
            filename: file.originalname,
            document_id: result.document.id,
            status: 'success',
            processing_time_ms: result.processing_time_ms
          });
        } else {
          errors.push({
            filename: file.originalname,
            error: result.error || 'Processing failed'
          });
        }
      } catch (error) {
        errors.push({
          filename: file.originalname,
          error: error instanceof Error ? error.message : String(error)
        });

        // Clean up file on error
        try {
          await import('fs').then(fs => fs.promises.unlink(file.path));
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    logger.info('Multiple document upload completed', {
      userId: req.userId,
      successful: results.length,
      failed: errors.length
    });

    res.json({
      success: true,
      results,
      errors,
      summary: {
        total_files: files.length,
        successful: results.length,
        failed: errors.length
      }
    });
  })
);

/**
 * GET /api/documents - List user documents
 */
router.get('/', 
  validateRequest(paginationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, status, file_type, search } = req.query as any;

    const result = await documentService.listUserDocuments(req.userId!, {
      page,
      limit,
      status,
      file_type,
      search
    });

    const documentResponses: DocumentResponse[] = result.documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      file_type: doc.file_type,
      file_size: doc.file_size,
      processing_status: doc.processing_status,
      chunk_count: doc.chunk_count,
      created_at: doc.created_at.toISOString(),
      updated_at: doc.updated_at.toISOString()
    }));

    res.json({
      success: true,
      data: documentResponses,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1
      }
    });
  })
);

/**
 * GET /api/documents/:id - Get document details
 */
router.get('/:id',
  validateRequest(documentIdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await documentService.getDocumentById(id, req.userId!);
    
    if (!result) {
      throw new AppError('Document not found', 404);
    }

    const documentResponse: DocumentResponse = {
      id: result.document.id,
      title: result.document.title,
      filename: result.document.filename,
      file_type: result.document.file_type,
      file_size: result.document.file_size,
      processing_status: result.document.processing_status,
      chunk_count: result.document.chunk_count,
      created_at: result.document.created_at.toISOString(),
      updated_at: result.document.updated_at.toISOString()
    };

    res.json({
      success: true,
      data: documentResponse,
      chunk_count: result.chunks.length
    });
  })
);

/**
 * PUT /api/documents/:id - Update document metadata
 */
router.put('/:id',
  validateRequest(documentUpdateRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title } = req.body;

    const updatedDocument = await documentService.updateDocument(id, req.userId!, { title });
    
    if (!updatedDocument) {
      throw new AppError('Document not found', 404);
    }

    const documentResponse: DocumentResponse = {
      id: updatedDocument.id,
      title: updatedDocument.title,
      filename: updatedDocument.filename,
      file_type: updatedDocument.file_type,
      file_size: updatedDocument.file_size,
      processing_status: updatedDocument.processing_status,
      chunk_count: updatedDocument.chunk_count,
      created_at: updatedDocument.created_at.toISOString(),
      updated_at: updatedDocument.updated_at.toISOString()
    };

    res.json({
      success: true,
      data: documentResponse
    });
  })
);

/**
 * DELETE /api/documents/:id - Delete document
 */
router.delete('/:id',
  validateRequest(documentIdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const deleted = await documentService.deleteDocument(id, req.userId!);
    
    if (!deleted) {
      throw new AppError('Document not found', 404);
    }

    logger.info('Document deleted by user', {
      documentId: id,
      userId: req.userId
    });

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  })
);

/**
 * GET /api/documents/:id/chunks - Get document chunks
 */
router.get('/:id/chunks',
  validateRequest(documentIdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await vectorSearchService.getDocumentChunks(id, req.userId!, {
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit)
    });

    res.json({
      success: true,
      data: {
        document_id: id,
        document_title: result.document_title,
        chunks: result.chunks.map(chunk => ({
          id: chunk.chunk_id,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          content_tokens: chunk.metadata?.content_tokens || 0,
          metadata: chunk.metadata,
          created_at: chunk.created_at
        })),
        total_chunks: result.total_chunks
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.total_chunks,
        totalPages: Math.ceil(result.total_chunks / Number(limit))
      }
    });
  })
);

/**
 * POST /api/documents/search - Semantic search
 */
router.post('/search',
  validateRequest(documentSearchRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { query, limit, similarity_threshold } = req.body;

    const startTime = Date.now();
    const searchResult = await vectorSearchService.semanticSearch(query, req.userId!, {
      limit,
      similarity_threshold,
      include_metadata: true
    });

    const results: DocumentSearchResult[] = searchResult.results.map(result => ({
      document_id: result.document_id,
      document_title: result.document_title,
      document_filename: result.document_filename,
      chunk_content: result.content,
      similarity_score: result.similarity_score,
      chunk_index: result.chunk_index,
      metadata: result.metadata
    }));

    logger.info('Document semantic search performed', {
      userId: req.userId,
      query,
      resultsCount: results.length,
      processingTime: Date.now() - startTime
    });

    res.json({
      success: true,
      data: {
        results,
        total_results: searchResult.total_results,
        query: searchResult.query,
        processing_time_ms: searchResult.processing_time_ms,
        search_type: searchResult.search_type,
        similarity_threshold: searchResult.similarity_threshold
      }
    });
  })
);

/**
 * POST /api/documents/search/hybrid - Hybrid search
 */
router.post('/search/hybrid',
  validateRequest(hybridSearchRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { 
      query, 
      limit, 
      similarity_threshold, 
      keyword_weight, 
      semantic_weight 
    } = req.body;

    const startTime = Date.now();
    const searchResult = await vectorSearchService.hybridSearch(query, req.userId!, {
      limit,
      similarity_threshold,
      keyword_weight,
      semantic_weight,
      include_metadata: true
    });

    const results: DocumentSearchResult[] = searchResult.results.map(result => ({
      document_id: result.document_id,
      document_title: result.document_title,
      document_filename: result.document_filename,
      chunk_content: result.content,
      similarity_score: result.similarity_score,
      chunk_index: result.chunk_index,
      metadata: result.metadata
    }));

    logger.info('Document hybrid search performed', {
      userId: req.userId,
      query,
      resultsCount: results.length,
      processingTime: Date.now() - startTime,
      keyword_weight,
      semantic_weight
    });

    res.json({
      success: true,
      data: {
        results,
        total_results: searchResult.total_results,
        query: searchResult.query,
        processing_time_ms: searchResult.processing_time_ms,
        search_type: searchResult.search_type,
        similarity_threshold: searchResult.similarity_threshold,
        weights: {
          keyword_weight,
          semantic_weight
        }
      }
    });
  })
);

/**
 * POST /api/documents/context - Get document context for LLM
 */
router.post('/context',
  validateRequest(documentContextRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { 
      query, 
      conversation_id, 
      max_chunks, 
      similarity_threshold 
    } = req.body;

    const startTime = Date.now();
    const contextResult = await vectorSearchService.getDocumentContext(query, req.userId!, {
      max_chunks,
      similarity_threshold,
      conversation_id
    });

    const response: DocumentContextResponse = {
      context: contextResult.context,
      source_chunks: contextResult.source_chunks,
      total_characters: contextResult.total_characters
    };

    logger.info('Document context retrieved for LLM', {
      userId: req.userId,
      query,
      conversation_id,
      chunksFound: contextResult.context.length,
      totalCharacters: contextResult.total_characters,
      processingTime: Date.now() - startTime
    });

    res.json({
      success: true,
      data: response,
      processing_time_ms: Date.now() - startTime
    });
  })
);

/**
 * POST /api/documents/reprocess - Reprocess document embeddings
 */
router.post('/reprocess',
  validateRequest(reprocessRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { document_ids, force } = req.body;
    const results = [];
    const errors = [];

    if (document_ids && document_ids.length > 0) {
      // Reprocess specific documents
      for (const documentId of document_ids) {
        try {
          const result = await documentService.reprocessDocument(documentId, req.userId!, force);
          results.push({
            document_id: documentId,
            success: result.success,
            chunks_updated: result.chunks_updated,
            cost: result.cost
          });
        } catch (error) {
          errors.push({
            document_id: documentId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } else {
      throw new AppError('No document IDs provided for reprocessing', 400);
    }

    logger.info('Document reprocessing completed', {
      userId: req.userId,
      documentsProcessed: results.length,
      errors: errors.length,
      totalCost: results.reduce((sum, r) => sum + r.cost, 0)
    });

    res.json({
      success: true,
      data: {
        results,
        errors,
        summary: {
          total_documents: (document_ids?.length || 0),
          successful: results.length,
          failed: errors.length,
          total_cost: results.reduce((sum, r) => sum + r.cost, 0),
          total_chunks_updated: results.reduce((sum, r) => sum + r.chunks_updated, 0)
        }
      }
    });
  })
);

/**
 * GET /api/documents/stats - Get user document statistics
 */
router.get('/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await documentService.getUserDocumentStats(req.userId!);

    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * GET /api/documents/:id/similar - Find similar documents
 */
router.get('/:id/similar',
  validateRequest(documentIdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { limit = 5 } = req.query;

    const similarDocuments = await vectorSearchService.findSimilarDocuments(
      id, 
      req.userId!, 
      Number(limit)
    );

    res.json({
      success: true,
      data: {
        source_document_id: id,
        similar_documents: similarDocuments
      }
    });
  })
);

export default router;