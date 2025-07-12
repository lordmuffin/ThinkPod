# PRP: Document Processing Service with Embeddings and Vector Search

## Overview
Implement a comprehensive document processing service that handles file uploads, text extraction, embedding generation, and semantic search capabilities. This service will enable users to upload documents and query them using natural language through the LLM integration.

## Product Requirements

### Core Features
1. **Document Upload & Processing**
   - Support multiple file formats (PDF, DOC/DOCX, TXT, MD)
   - Automatic text extraction from uploaded documents
   - Document metadata management (title, type, size, upload date)
   - File validation and security checks

2. **Text Processing & Chunking**
   - Intelligent text chunking for optimal embedding generation
   - Preserve document structure and context
   - Handle large documents with pagination
   - Support for multiple languages

3. **Embedding Generation**
   - OpenAI text-embedding-ada-002 integration
   - Batch processing for efficiency
   - Vector storage in PostgreSQL with pgvector
   - Embedding versioning and updates

4. **Vector Search & Retrieval**
   - Semantic similarity search
   - Hybrid search (semantic + keyword)
   - Relevance scoring and ranking
   - Context-aware retrieval for LLM queries

5. **Document Management**
   - CRUD operations for documents
   - User access control and permissions
   - Document sharing capabilities
   - Soft delete with recovery options

## Technical Requirements

### Technology Stack
- **File Processing**: Multer for uploads, pdf-parse, mammoth for extraction
- **Vector Database**: PostgreSQL with pgvector extension
- **Embeddings**: OpenAI text-embedding-ada-002
- **Search**: Custom similarity search with cosine distance
- **Storage**: Local filesystem with optional S3 integration
- **Validation**: Zod schemas for all inputs

### API Endpoints
```typescript
// Document Management
POST   /api/documents/upload          // Upload new document
GET    /api/documents                 // List user documents
GET    /api/documents/:id             // Get document details
PUT    /api/documents/:id             // Update document metadata
DELETE /api/documents/:id             // Delete document

// Search & Retrieval
POST   /api/documents/search          // Semantic search
POST   /api/documents/search/hybrid   // Hybrid search
GET    /api/documents/:id/chunks      // Get document chunks
POST   /api/documents/reprocess       // Reprocess embeddings

// Integration
POST   /api/documents/context         // Get context for LLM
```

### Database Schema
```sql
-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size BIGINT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  processing_status VARCHAR(20) DEFAULT 'pending',
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document chunks with embeddings
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_tokens INTEGER NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 dimensions
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient search
CREATE INDEX idx_document_chunks_embedding ON document_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_documents_user_id ON documents(user_id);
```

### File Upload Configuration
```typescript
// Multer configuration
const upload = multer({
  dest: 'uploads/documents/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 5 // Max 5 files per upload
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});
```

## Implementation Patterns

### Document Processing Pipeline
```typescript
class DocumentProcessor {
  async processDocument(file: Express.Multer.File, userId: string) {
    // 1. Validate and store file
    const document = await this.storeDocument(file, userId);
    
    // 2. Extract text content
    const content = await this.extractText(document);
    
    // 3. Chunk content intelligently
    const chunks = await this.chunkContent(content);
    
    // 4. Generate embeddings
    await this.generateEmbeddings(document.id, chunks);
    
    // 5. Update processing status
    await this.updateStatus(document.id, 'completed');
    
    return document;
  }
}
```

### Embedding Service
```typescript
class EmbeddingService {
  async generateEmbeddings(chunks: DocumentChunk[]) {
    const batchSize = 100;
    const results = [];
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: batch.map(chunk => chunk.content)
      });
      
      results.push(...embeddings.data);
    }
    
    return results;
  }
}
```

### Vector Search Implementation
```typescript
class VectorSearchService {
  async semanticSearch(query: string, userId: string, limit = 10) {
    // Generate query embedding
    const queryEmbedding = await this.generateQueryEmbedding(query);
    
    // Perform similarity search
    const results = await this.db.query(`
      SELECT 
        dc.*,
        d.title,
        d.filename,
        1 - (dc.embedding <=> $1::vector) AS similarity
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.user_id = $2
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $3
    `, [queryEmbedding, userId, limit]);
    
    return results;
  }
}
```

## Validation Criteria

### Level 1: Basic Implementation
- [ ] Document upload endpoint working
- [ ] Text extraction from PDF and DOC files
- [ ] Basic embedding generation and storage
- [ ] Simple similarity search functionality
- [ ] No TypeScript compilation errors
- [ ] All endpoints return proper response formats

### Level 2: Feature Complete
- [ ] All file types supported and processed
- [ ] Intelligent text chunking implemented
- [ ] Batch embedding processing working
- [ ] Hybrid search combining semantic and keyword
- [ ] Document management CRUD operations
- [ ] User access control implemented

### Level 3: Production Ready
- [ ] Comprehensive error handling and logging
- [ ] File upload validation and security checks
- [ ] Background job processing for large files
- [ ] Performance optimizations for search
- [ ] Monitoring and analytics integration
- [ ] Rate limiting and abuse prevention

### Level 4: Advanced Features
- [ ] Document versioning and history
- [ ] Advanced chunking strategies
- [ ] Multi-modal support (images, tables)
- [ ] Integration with external storage (S3)
- [ ] Advanced search filters and faceting
- [ ] Document collaboration features

## Success Metrics
- **Processing Speed**: < 30 seconds for 50MB documents
- **Search Accuracy**: > 85% relevance for user queries
- **Search Speed**: < 500ms for similarity search
- **Storage Efficiency**: < 2MB overhead per document
- **User Experience**: Seamless upload and search flow

## Security Considerations
- File type validation and virus scanning
- Content sanitization for text extraction
- User isolation for document access
- Secure file storage with proper permissions
- Input validation for all search queries
- Rate limiting for upload and search operations

## Integration Points
- **LLM Service**: Provide document context for chat
- **Authentication**: User-based document access
- **Socket.IO**: Real-time processing updates
- **Monitoring**: Track usage and performance metrics

## File Structure
```
packages/api/src/
├── services/
│   ├── DocumentService.ts        # Main document operations
│   ├── EmbeddingService.ts       # Embedding generation
│   ├── VectorSearchService.ts    # Search functionality
│   └── TextExtractionService.ts  # File content extraction
├── routes/
│   └── documents.ts              # Document API endpoints
├── middleware/
│   └── upload.ts                 # File upload middleware
├── utils/
│   ├── fileValidation.ts         # File security checks
│   └── textChunking.ts           # Text processing utilities
└── types/
    └── document.ts               # Document-specific types
```

## Dependencies to Add
```json
{
  "dependencies": {
    "pdf-parse": "^1.1.1",
    "mammoth": "^1.6.0", 
    "file-type": "^18.7.0",
    "crypto": "^1.0.1",
    "sharp": "^0.32.6"
  },
  "devDependencies": {
    "@types/pdf-parse": "^1.1.4",
    "@types/multer": "^1.4.11"
  }
}
```

This PRP focuses on creating a robust document processing pipeline that seamlessly integrates with the existing LLM service to provide context-aware responses based on user documents.