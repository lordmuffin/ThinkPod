# ThinkPod - AI-Powered Document Processing & Voice Chat Platform

> **🚀 Complete AI ecosystem with document processing, embeddings, vector search, and voice-enabled chat**

ThinkPod is a comprehensive AI platform that combines document processing with intelligent embeddings, semantic search, and voice-to-text capabilities. Built with modern technologies including OpenAI, PostgreSQL with pgvector, and real-time communication.

## 🏗️ Architecture Overview

ThinkPod is a **monorepo** with multiple packages working together:

```
ThinkPod/
├── packages/
│   ├── api/          # Backend API (Express.js + Socket.IO)
│   ├── mobile/       # React Native mobile app  
│   ├── web/          # Next.js web frontend
│   └── shared/       # Shared types and utilities
├── database/         # SQL migrations and seeds
├── docker/          # Docker configuration
└── uploads/         # File storage directory
```

### 🔧 Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Backend API** | Express.js + TypeScript | REST API, WebSocket server |
| **Database** | PostgreSQL + pgvector | Document storage, vector embeddings |
| **AI/ML** | OpenAI (GPT + Embeddings) | LLM chat, text embeddings |
| **Search** | PostgreSQL vector similarity | Semantic document search |
| **Real-time** | Socket.IO + Redis | Live chat, notifications |
| **File Processing** | pdf-parse, mammoth, sharp | Multi-format document parsing |
| **Mobile** | React Native | Cross-platform mobile app |
| **Web** | Next.js | Modern web application |
| **Cache/Queue** | Redis + BullMQ | Caching, background jobs |

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm 9+
- **PostgreSQL** 15+ with pgvector extension
- **Redis** (optional but recommended)
- **OpenAI API key** for LLM and embeddings

### 1. Clone and Install

```bash
git clone <repository-url>
cd ThinkPod
npm install
```

### 2. Environment Setup

Create `.env` in the root directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=thinkpod_dev
DB_USER=thinkpod_user
DB_PASSWORD=thinkpod_password

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Redis Configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Security
JWT_SECRET=your_jwt_secret_here
SESSION_SECRET=your_session_secret_here

# App Configuration
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### 3. Database Setup

```bash
# Option A: Docker (Recommended)
docker run --name thinkpod-db \
  -e POSTGRES_PASSWORD=thinkpod_password \
  -e POSTGRES_USER=thinkpod_user \
  -e POSTGRES_DB=thinkpod_dev \
  -p 5432:5432 -d \
  pgvector/pgvector:pg15

# Option B: Local PostgreSQL
# Install PostgreSQL 15+ and pgvector extension manually

# Run migrations
npm run migration:run
```

### 4. Start Development

```bash
# Start all services
npm run dev

# Or start individually:
npm run dev:api      # Backend API on port 3001
npm run dev:web      # Web frontend on port 3000  
npm run dev:mobile   # React Native development
```

## 📚 API Documentation

### Base URL
- **Development**: `http://localhost:3001/api`
- **Production**: `https://your-domain.com/api`

### Authentication
All protected endpoints require a Bearer token:
```bash
Authorization: Bearer <your_jwt_token>
```

### Core Endpoints

#### 🔐 Authentication
```http
POST /api/auth/register      # User registration
POST /api/auth/login         # User login
POST /api/auth/logout        # User logout
GET  /api/auth/me            # Get current user
```

#### 📄 Document Processing
```http
# Upload & Processing
POST /api/documents/upload          # Upload single document
POST /api/documents/upload-multiple # Upload multiple documents

# Document Management  
GET    /api/documents               # List user documents
GET    /api/documents/:id           # Get document details
PUT    /api/documents/:id           # Update document metadata
DELETE /api/documents/:id           # Delete document
GET    /api/documents/:id/chunks    # Get document chunks

# Search & Retrieval
POST /api/documents/search          # Semantic search
POST /api/documents/search/hybrid   # Hybrid search (semantic + keyword)
POST /api/documents/context         # Get context for LLM integration

# Administration
POST /api/documents/reprocess       # Reprocess document embeddings
GET  /api/documents/stats           # User document statistics
GET  /api/documents/:id/similar     # Find similar documents
```

#### 💬 Chat & Conversations
```http
GET  /api/conversations             # List conversations
POST /api/conversations             # Create conversation
GET  /api/conversations/:id         # Get conversation details
DELETE /api/conversations/:id       # Delete conversation

POST /api/messages                  # Send message
GET  /api/messages/:conversationId  # Get conversation messages

POST /api/chat/completion           # LLM chat completion
POST /api/voice/transcribe          # Voice-to-text transcription
```

### 📄 Document Upload Example

```javascript
// Upload a document
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('title', 'My Document');

const response = await fetch('/api/documents/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log('Document uploaded:', result.document);
```

### 🔍 Semantic Search Example

```javascript
// Search documents
const searchResponse = await fetch('/api/documents/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    query: "artificial intelligence and machine learning",
    limit: 10,
    similarity_threshold: 0.7
  })
});

const searchResults = await searchResponse.json();
console.log('Found documents:', searchResults.data.results);
```

## 🖥️ Frontend Applications

### Web Application (Next.js)
- **Location**: `packages/web/`
- **URL**: `http://localhost:3000`
- **Features**: Document management, chat interface, search

### Mobile Application (React Native)
- **Location**: `packages/mobile/`
- **Platforms**: iOS & Android
- **Features**: Voice recording, document upload, mobile chat

### Starting Frontends

```bash
# Web frontend
cd packages/web
npm run dev

# Mobile development
cd packages/mobile
npx react-native run-ios     # iOS
npx react-native run-android # Android
```

## 🗄️ Database Schema

### Core Tables

```sql
-- Users and authentication
users                # User accounts and profiles
user_sessions        # Active user sessions

-- Document processing
documents            # Uploaded documents metadata
document_chunks      # Text chunks with embeddings

-- Chat system
conversations        # Chat conversations
messages             # Individual messages
llm_usage           # LLM API usage tracking

-- System
migrations          # Database schema versions
```

### Document Processing Flow

1. **Upload** → File validation & storage
2. **Extract** → Text extraction (PDF, DOCX, etc.)
3. **Chunk** → Intelligent text chunking
4. **Embed** → OpenAI embedding generation
5. **Store** → PostgreSQL with vector indexing
6. **Search** → Semantic similarity search

## 🔧 Development

### Project Structure

```
packages/api/src/
├── routes/          # API endpoint definitions
├── services/        # Business logic (Document, Embedding, etc.)
├── middleware/      # Auth, validation, file upload
├── utils/          # Database, logging, text processing
└── sockets/        # WebSocket event handlers

packages/shared/src/
├── types/          # TypeScript type definitions
└── utils/          # Shared utilities and validation
```

### Key Services

- **DocumentService**: Complete document processing pipeline
- **EmbeddingService**: OpenAI embedding generation & storage
- **VectorSearchService**: Semantic search implementation
- **TextExtractionService**: Multi-format text extraction
- **LLMService**: OpenAI GPT integration

### Testing

```bash
# Run all tests
npm test

# Test specific package
npm test --workspace=@thinkpod/api

# Coverage reports
npm run test:coverage
```

### Building for Production

```bash
# Build all packages
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

## 🚀 Deployment

### Docker Deployment

```bash
# Development environment
npm run docker:dev

# Production environment
npm run docker:prod
```

### Environment Variables (Production)

```env
NODE_ENV=production
PORT=3001

# Database (use managed service)
DB_HOST=your-postgres-host
DB_NAME=thinkpod_prod
DB_USER=thinkpod_user
DB_PASSWORD=secure_password

# OpenAI (production key)
OPENAI_API_KEY=your_production_openai_key

# Security (generate strong secrets)
JWT_SECRET=very_long_random_string
SESSION_SECRET=another_long_random_string

# Frontend URL
FRONTEND_URL=https://your-domain.com
```

## 📊 Features Overview

### ✅ Document Processing
- **Multi-format support**: PDF, DOCX, DOC, TXT, Markdown
- **Intelligent chunking**: Preserves sentence/paragraph boundaries
- **Security validation**: Malware scanning, file type verification
- **Duplicate detection**: Content hash-based deduplication

### ✅ AI Integration
- **OpenAI Embeddings**: text-embedding-ada-002 model
- **Vector Search**: PostgreSQL pgvector semantic similarity
- **Hybrid Search**: Combined semantic + keyword matching
- **LLM Chat**: GPT integration with document context

### ✅ Real-time Features
- **WebSocket support**: Live chat and notifications
- **Voice processing**: Speech-to-text transcription
- **File upload progress**: Real-time upload status

### ✅ Security & Performance
- **Authentication**: JWT-based auth system
- **Rate limiting**: API endpoint protection
- **File validation**: Comprehensive security checks
- **Caching**: Redis-based performance optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Follow existing code patterns and conventions
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Documentation

- **API Documentation**: Available at `/api/docs` when running
- **Database Schema**: See `database/migrations/` for latest schema
- **Environment Examples**: Check `.env.example` files
- **Troubleshooting**: See common issues in `docs/troubleshooting.md`

---

**Built with ❤️ by the ThinkPod Team**