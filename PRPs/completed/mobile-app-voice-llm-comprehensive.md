# Mobile App with Voice-to-Text and LLM Integration - Comprehensive PRP

## Goal

Build a complete mobile application ecosystem with voice-to-text capabilities, document processing, LLM integration, user management, chat history, and comprehensive monitoring. The app should allow users to speak naturally, have their words transcribed, interact with documents, maintain conversation history, and provide administrators with detailed usage analytics.

## Why

- **User Experience**: Voice input is faster and more natural than typing on mobile devices
- **Accessibility**: Voice interface makes the app accessible to users with mobility limitations
- **Productivity**: Document integration allows users to ask questions about their files
- **Business Intelligence**: Usage monitoring enables cost optimization and user behavior insights
- **Scalability**: Comprehensive testing and CI/CD ensure reliable deployment and maintenance
- **Security**: Proper authentication and session management protect user data

## What

A full-stack mobile application with:
- React Native mobile app with voice recording and transcription
- Progressive Web App support for browser-based access
- Real-time chat interface with LLM integration
- Document upload and processing system with vector search
- User authentication and session management
- Chat history persistence and retrieval
- Administrative dashboard with usage analytics and cost monitoring
- Comprehensive testing suite and CI/CD pipeline

### Success Criteria

- [ ] Users can record voice, see transcription within 2 seconds, and send to LLM
- [ ] Users can upload documents and ask questions about their content
- [ ] Users can view complete chat history across sessions
- [ ] Administrators can monitor LLM usage, costs, and user analytics
- [ ] All tests pass with >80% code coverage
- [ ] CI/CD pipeline automatically tests and deploys changes
- [ ] App works on iOS, Android, and web browsers

## All Needed Context

### Documentation & References

```yaml
# MUST READ - Include these in your context window

# Voice-to-Text Implementation
- url: https://react-native-voice.github.io/voice/
  why: Primary library for React Native voice recognition
  critical: Requires platform-specific setup and permissions

- url: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
  why: Web Speech API for PWA fallback
  critical: Limited browser support, Chrome requires internet connection

- url: https://platform.openai.com/docs/guides/speech-to-text
  why: OpenAI Whisper API for high-accuracy transcription
  critical: $0.006 per minute pricing, batch processing only

# React Native Development
- url: https://reactnative.dev/docs/getting-started
  why: Core React Native documentation and setup
  critical: Expo vs bare React Native decision impacts deployment

- url: https://docs.expo.dev/develop/development-builds/introduction/
  why: Expo development builds for native modules
  critical: Required for @react-native-voice/voice integration

# Database and Backend
- url: https://supabase.com/docs/guides/database/postgres
  why: PostgreSQL with real-time subscriptions
  critical: Handles auth, real-time chat, and vector embeddings

- url: https://github.com/pgvector/pgvector
  why: Vector embeddings for document search
  critical: Enable with CREATE EXTENSION vector

# LLM Integration
- url: https://platform.openai.com/docs/guides/chat-completions
  why: OpenAI Chat Completions API
  critical: Proper token counting and cost tracking essential

- url: https://docs.anthropic.com/claude/reference/getting-started
  why: Anthropic Claude API as backup LLM
  critical: Different pricing model and rate limits

# Document Processing
- url: https://www.npmjs.com/package/officeparser
  why: Multi-format document parsing (PDF, DOCX, XLSX)
  critical: ArrayBuffer support for React Native file handling

- url: https://docs.trychroma.com/
  why: ChromaDB for vector database
  critical: TypeScript SDK with OpenAI embeddings integration

# Real-time Chat
- url: https://socket.io/docs/v4/
  why: WebSocket implementation for real-time messaging
  critical: Redis adapter required for scaling

# Testing and CI/CD
- url: https://callstack.github.io/react-native-testing-library/
  why: React Native Testing Library patterns
  critical: Mock native modules properly

- url: https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs
  why: GitHub Actions for Node.js CI/CD
  critical: Separate iOS/Android build workflows

# Monitoring
- url: https://langfuse.com/docs/model-usage-and-cost
  why: LLM usage monitoring and cost tracking
  critical: Trace every LLM call with user context
```

### Current Codebase Tree

```bash
/mnt/c/Users/lordmuffin/Git/ThinkPod/
├── .claude/                    # Claude Code commands and settings
├── PRPs/                       # Product Requirement Prompts
│   ├── templates/             # PRP templates for different stacks
│   ├── ai_docs/              # AI documentation and guides
│   └── scripts/              # PRP automation scripts
└── [No application code - greenfield project]
```

### Desired Codebase Tree

```bash
ThinkPod/
├── .claude/                    # Existing Claude Code setup
├── PRPs/                       # Existing PRP framework
├── packages/
│   ├── mobile/                 # React Native mobile app
│   │   ├── src/
│   │   │   ├── components/    # Shared UI components
│   │   │   ├── screens/       # Screen components
│   │   │   ├── services/      # API and business logic
│   │   │   ├── hooks/         # Custom React hooks
│   │   │   ├── utils/         # Utility functions
│   │   │   └── types/         # TypeScript type definitions
│   │   ├── __tests__/         # Mobile app tests
│   │   ├── android/           # Android platform code
│   │   ├── ios/              # iOS platform code
│   │   └── package.json       # Mobile dependencies
│   ├── web/                   # Next.js web application (PWA)
│   │   ├── app/              # Next.js 14+ app router
│   │   ├── components/       # Web-specific components
│   │   ├── lib/              # Web utilities and configs
│   │   └── public/           # Static assets
│   ├── api/                   # Node.js backend API
│   │   ├── src/
│   │   │   ├── routes/       # API routes
│   │   │   ├── middleware/   # Express middleware
│   │   │   ├── services/     # Business logic services
│   │   │   ├── models/       # Database models
│   │   │   ├── utils/        # Backend utilities
│   │   │   └── types/        # Shared TypeScript types
│   │   ├── tests/            # Backend tests
│   │   └── package.json      # API dependencies
│   └── shared/                # Shared TypeScript types and utilities
├── docs/                      # Project documentation
├── scripts/                   # Build and deployment scripts
├── .github/workflows/         # CI/CD pipelines
├── docker/                    # Docker configurations
├── database/                  # Database migrations and schemas
└── package.json              # Root package.json for monorepo
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: React Native Voice requires platform-specific setup
// iOS: Add NSMicrophoneUsageDescription and NSSpeechRecognitionUsageDescription to Info.plist
// Android: Add RECORD_AUDIO permission to AndroidManifest.xml
// Cannot use in Expo Go - requires development build

// CRITICAL: OpenAI Whisper API limitations
// File upload required (cannot use raw audio stream)
// Maximum file size: 25MB
// Supported formats: m4a, mp3, mp4, mpeg, mpga, wav, webm
// Cost: $0.006 per minute (track usage carefully)

// CRITICAL: Web Speech API browser compatibility
// Chrome: Requires internet connection, sends audio to Google servers
// Safari iOS: Doesn't work in PWA mode or iframe
// Firefox: No support for continuous recognition

// CRITICAL: Socket.IO with React Native
// Use '@react-native-async-storage/async-storage' for persistence
// iOS requires NSAppTransportSecurity configuration for local development
// Android requires INTERNET permission

// CRITICAL: PostgreSQL with pgvector
// Enable extension: CREATE EXTENSION IF NOT EXISTS vector;
// Vector dimensions must match embedding model (1536 for OpenAI text-embedding-3-small)
// Use proper indexes: CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops);

// CRITICAL: File handling in React Native
// Use react-native-document-picker for file selection
// Use react-native-fs for file system operations
// Convert files to ArrayBuffer for officeparser

// CRITICAL: TypeScript strict mode requirements
// All API responses must have proper typing
// Database queries need type-safe results
// Event handlers require proper event typing
```

## Implementation Blueprint

### Data Models and Structure

```typescript
// Database schema types
interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
  last_seen: Date;
  is_online: boolean;
}

interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  content: string;
  message_type: 'user' | 'assistant' | 'system';
  voice_recording_url?: string;
  created_at: Date;
}

interface Document {
  id: string;
  user_id: string;
  filename: string;
  content: string;
  file_type: string;
  file_size: number;
  upload_url: string;
  created_at: Date;
}

interface DocumentEmbedding {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[]; // Vector embedding
  created_at: Date;
}

interface LLMUsage {
  id: string;
  user_id: string;
  conversation_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  response_time_ms: number;
  created_at: Date;
}

// API request/response types
interface VoiceTranscriptionRequest {
  audio_file: File;
  language?: string;
}

interface VoiceTranscriptionResponse {
  text: string;
  confidence: number;
  processing_time_ms: number;
}

interface ChatCompletionRequest {
  conversation_id: string;
  message: string;
  document_context?: string[];
}

interface ChatCompletionResponse {
  message: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost: number;
  response_time_ms: number;
}
```

### List of Tasks to be Completed

```yaml
Task 1: Project Setup and Monorepo Configuration
CREATE package.json (root):
  - SETUP Lerna or npm workspaces for monorepo
  - CONFIGURE shared dependencies and scripts
  - ESTABLISH consistent TypeScript configuration

CREATE .github/workflows/:
  - SETUP separate CI/CD pipelines for mobile, web, and API
  - CONFIGURE automated testing on PR
  - ESTABLISH deployment pipelines

Task 2: Database Setup and Schema
CREATE database/migrations/:
  - SETUP PostgreSQL with pgvector extension
  - CREATE tables for users, conversations, messages, documents, embeddings, llm_usage
  - ESTABLISH proper indexes for performance
  - CONFIGURE vector similarity search indexes

CREATE database/seeds/:
  - SETUP development data for testing
  - CREATE sample users, conversations, and documents

Task 3: Backend API Development
CREATE packages/api/src/app.ts:
  - SETUP Express server with TypeScript
  - CONFIGURE CORS, helmet, rate limiting
  - ESTABLISH error handling middleware
  - INTEGRATE Socket.IO for real-time features

CREATE packages/api/src/routes/:
  - IMPLEMENT /auth routes (login, register, refresh token)
  - IMPLEMENT /conversations routes (CRUD operations)
  - IMPLEMENT /messages routes with real-time updates
  - IMPLEMENT /documents routes (upload, processing, search)
  - IMPLEMENT /voice routes (transcription)
  - IMPLEMENT /analytics routes (usage monitoring)

CREATE packages/api/src/services/:
  - IMPLEMENT AuthService (JWT tokens, password hashing)
  - IMPLEMENT VoiceService (OpenAI Whisper integration)
  - IMPLEMENT LLMService (OpenAI/Anthropic API calls with usage tracking)
  - IMPLEMENT DocumentService (parsing, chunking, embeddings)
  - IMPLEMENT VectorSearchService (ChromaDB integration)
  - IMPLEMENT AnalyticsService (usage metrics aggregation)

Task 4: Mobile App Foundation
CREATE packages/mobile/:
  - SETUP React Native with TypeScript
  - CONFIGURE Expo development build for native modules
  - ESTABLISH navigation structure with React Navigation
  - SETUP state management with React Query and Zustand

CREATE packages/mobile/src/services/:
  - IMPLEMENT ApiClient (HTTP client with auth)
  - IMPLEMENT SocketClient (real-time messaging)
  - IMPLEMENT VoiceRecorder (platform-specific voice recording)
  - IMPLEMENT FileManager (document handling)
  - IMPLEMENT AuthManager (token management, biometric auth)

Task 5: Core Mobile Screens and Components
CREATE packages/mobile/src/screens/:
  - IMPLEMENT LoginScreen (authentication)
  - IMPLEMENT ChatListScreen (conversation list)
  - IMPLEMENT ChatScreen (messaging interface)
  - IMPLEMENT VoiceRecordingScreen (voice input)
  - IMPLEMENT DocumentsScreen (file management)
  - IMPLEMENT SettingsScreen (user preferences)

CREATE packages/mobile/src/components/:
  - IMPLEMENT VoiceRecordButton (animated recording UI)
  - IMPLEMENT MessageBubble (chat message display)
  - IMPLEMENT DocumentPreview (file preview component)
  - IMPLEMENT TypingIndicator (real-time typing status)
  - IMPLEMENT AudioWaveform (voice recording visualization)

Task 6: Progressive Web App (PWA)
CREATE packages/web/:
  - SETUP Next.js 14 with app router and TypeScript
  - CONFIGURE PWA with service worker
  - ESTABLISH responsive design with Tailwind CSS
  - IMPLEMENT fallback for native features

CREATE packages/web/app/:
  - MIRROR mobile functionality for web users
  - IMPLEMENT Web Speech API fallback for voice input
  - ESTABLISH file upload with drag-and-drop
  - CONFIGURE push notifications for web

Task 7: Document Processing Pipeline
CREATE packages/api/src/services/DocumentProcessor:
  - IMPLEMENT file parsing with officeparser
  - ESTABLISH text chunking strategies (500-1000 chars with overlap)
  - INTEGRATE OpenAI embeddings API
  - SETUP vector storage in ChromaDB
  - IMPLEMENT similarity search with reranking

CREATE packages/api/src/workers/:
  - SETUP background job processing for document parsing
  - IMPLEMENT queue management with Bull/BullMQ
  - ESTABLISH error handling and retry logic

Task 8: Voice-to-Text Integration
CREATE packages/mobile/src/services/VoiceService:
  - IMPLEMENT @react-native-voice/voice for real-time transcription
  - SETUP OpenAI Whisper as backup for high accuracy
  - ESTABLISH audio file management and compression
  - IMPLEMENT permission handling and error states

CREATE packages/web/src/services/WebSpeechService:
  - IMPLEMENT Web Speech API with browser detection
  - SETUP MediaRecorder API for audio capture
  - ESTABLISH fallback to file upload + Whisper
  - IMPLEMENT audio quality optimization

Task 9: Real-Time Chat System
CREATE packages/api/src/sockets/:
  - IMPLEMENT Socket.IO event handlers
  - ESTABLISH user presence tracking
  - SETUP typing indicators and read receipts
  - CONFIGURE message broadcasting and persistence

CREATE packages/mobile/src/hooks/useChat:
  - IMPLEMENT real-time message synchronization
  - ESTABLISH offline message queueing
  - SETUP optimistic UI updates
  - IMPLEMENT message retry and error handling

Task 10: LLM Integration and Monitoring
CREATE packages/api/src/services/LLMService:
  - IMPLEMENT OpenAI Chat Completions with usage tracking
  - SETUP Anthropic Claude as fallback provider
  - ESTABLISH document context injection
  - IMPLEMENT streaming responses for real-time UI

CREATE packages/api/src/services/UsageMonitoring:
  - IMPLEMENT Langfuse integration for LLM observability
  - SETUP cost tracking per user and conversation
  - ESTABLISH rate limiting and quota management
  - IMPLEMENT usage analytics and reporting

Task 11: Authentication and User Management
CREATE packages/api/src/middleware/auth:
  - IMPLEMENT JWT token validation
  - SETUP refresh token rotation
  - ESTABLISH role-based access control
  - IMPLEMENT session management with Redis

CREATE packages/mobile/src/contexts/AuthContext:
  - IMPLEMENT secure token storage
  - SETUP biometric authentication
  - ESTABLISH auto-logout on inactivity
  - IMPLEMENT social login options

Task 12: Administrative Dashboard
CREATE packages/web/app/admin/:
  - IMPLEMENT usage analytics dashboard
  - SETUP real-time user monitoring
  - ESTABLISH cost tracking and alerts
  - IMPLEMENT user management interface

CREATE packages/web/components/charts/:
  - IMPLEMENT usage metrics visualization
  - SETUP cost analysis charts
  - ESTABLISH user activity heatmaps
  - IMPLEMENT exportable reports

Task 13: Comprehensive Testing Suite
CREATE __tests__/ directories:
  - IMPLEMENT unit tests for all services (>80% coverage)
  - SETUP integration tests for API endpoints
  - ESTABLISH E2E tests with Detox for mobile
  - IMPLEMENT performance testing for voice/LLM features

CREATE packages/api/tests/:
  - IMPLEMENT API endpoint testing with supertest
  - SETUP database testing with test containers
  - ESTABLISH mocking for external services
  - IMPLEMENT load testing for concurrent users

Task 14: CI/CD Pipeline and Deployment
CREATE .github/workflows/:
  - SETUP automated testing on all pull requests
  - ESTABLISH separate deployment workflows
  - IMPLEMENT security scanning and dependency updates
  - SETUP monitoring and alerting

CREATE docker/:
  - IMPLEMENT containerization for API and web
  - SETUP docker-compose for local development
  - ESTABLISH production-ready Dockerfile
  - IMPLEMENT database backup and restore scripts

Task 15: Performance Optimization and Monitoring
CREATE packages/shared/monitoring:
  - IMPLEMENT application performance monitoring
  - SETUP error tracking with Sentry
  - ESTABLISH user analytics with privacy compliance
  - IMPLEMENT real-time alerting for issues

OPTIMIZE packages/mobile:
  - IMPLEMENT code splitting and lazy loading
  - SETUP bundle size monitoring
  - ESTABLISH image optimization and caching
  - IMPLEMENT offline functionality with sync
```

### Per Task Pseudocode

```typescript
// Task 3: Backend API Development - Core Structure
// packages/api/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL }
});

// PATTERN: Middleware stack order is critical
app.use(helmet()); // Security headers first
app.use(cors()); // CORS before other middleware
app.use(express.json({ limit: '50mb' })); // Large limit for file uploads
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// CRITICAL: Error handling must be last middleware
app.use((error, req, res, next) => {
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

// Task 5: Mobile Voice Recording - Core Implementation
// packages/mobile/src/components/VoiceRecordButton.tsx
import Voice from '@react-native-voice/voice';
import { useState, useEffect } from 'react';
import { Animated, TouchableOpacity } from 'react-native';

const VoiceRecordButton = ({ onTranscript, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // PATTERN: Setup voice recognition callbacks
    Voice.onSpeechStart = () => setIsRecording(true);
    Voice.onSpeechEnd = () => setIsRecording(false);
    Voice.onSpeechResults = (e) => {
      const result = e.value?.[0] || '';
      setTranscript(result);
      onTranscript?.(result);
    };
    Voice.onSpeechError = (e) => {
      onError?.(e.error);
      setIsRecording(false);
    };

    return () => {
      // CRITICAL: Cleanup voice recognition on unmount
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const startRecording = async () => {
    try {
      // GOTCHA: Must request permissions before starting
      const hasPermission = await Voice.isAvailable();
      if (!hasPermission) throw new Error('Voice recognition not available');
      
      await Voice.start('en-US');
      
      // PATTERN: Visual feedback for recording state
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.2, duration: 1000 }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 1000 })
        ])
      ).start();
    } catch (error) {
      onError?.(error.message);
    }
  };

  const stopRecording = async () => {
    try {
      await Voice.stop();
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);
    } catch (error) {
      onError?.(error.message);
    }
  };

  return (
    <TouchableOpacity
      onPress={isRecording ? stopRecording : startRecording}
      style={[styles.button, { transform: [{ scale: scaleAnim }] }]}
    >
      <Text>{isRecording ? 'Stop Recording' : 'Start Recording'}</Text>
    </TouchableOpacity>
  );
};

// Task 7: Document Processing Pipeline
// packages/api/src/services/DocumentProcessor.ts
import { officeParser } from 'officeparser';
import OpenAI from 'openai';
import { ChromaClient } from 'chromadb';

class DocumentProcessor {
  private openai: OpenAI;
  private chroma: ChromaClient;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.chroma = new ChromaClient({ path: process.env.CHROMA_URL });
  }

  async processDocument(fileBuffer: ArrayBuffer, filename: string, userId: string) {
    try {
      // PATTERN: Parse document based on file extension
      const ext = filename.split('.').pop()?.toLowerCase();
      let textContent = '';

      if (['pdf', 'docx', 'xlsx', 'pptx'].includes(ext)) {
        // CRITICAL: officeparser requires ArrayBuffer input
        const result = await officeParser.parseOfficeAsync(fileBuffer);
        textContent = result.toString();
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }

      // PATTERN: Chunk text for optimal embedding and retrieval
      const chunks = this.chunkText(textContent, 1000, 200); // 1000 chars, 200 overlap
      
      // CRITICAL: Generate embeddings in batches to avoid rate limits
      const embeddings = await this.generateEmbeddings(chunks);
      
      // PATTERN: Store in vector database with metadata
      const collection = await this.chroma.getOrCreateCollection({
        name: `user_${userId}_documents`,
      });

      await collection.add({
        documents: chunks,
        embeddings: embeddings,
        metadatas: chunks.map((chunk, index) => ({
          filename,
          chunk_index: index,
          user_id: userId,
          created_at: new Date().toISOString(),
        })),
        ids: chunks.map((_, index) => `${filename}_chunk_${index}`),
      });

      return {
        chunks_processed: chunks.length,
        total_characters: textContent.length,
        embeddings_generated: embeddings.length,
      };
    } catch (error) {
      // PATTERN: Structured error handling with context
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - overlap; // Create overlap between chunks
    }

    return chunks;
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // CRITICAL: Batch processing to stay within rate limits
    const batchSize = 100;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small', // Most cost-effective model
        input: batch,
      });

      embeddings.push(...response.data.map(item => item.embedding));
      
      // GOTCHA: Add delay to avoid rate limiting
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return embeddings;
  }
}

// Task 10: LLM Integration with Monitoring
// packages/api/src/services/LLMService.ts
import OpenAI from 'openai';
import { Langfuse } from 'langfuse';

class LLMService {
  private openai: OpenAI;
  private langfuse: Langfuse;
  private costPerToken = {
    'gpt-4': { input: 0.00003, output: 0.00006 },
    'gpt-3.5-turbo': { input: 0.0000015, output: 0.000002 },
  };

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.langfuse = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    });
  }

  async generateChatCompletion(
    messages: Array<{role: string, content: string}>,
    userId: string,
    conversationId: string,
    documentContext?: string[]
  ) {
    const startTime = Date.now();
    
    // PATTERN: Create trace for monitoring
    const trace = this.langfuse.trace({
      name: 'chat-completion',
      userId,
      sessionId: conversationId,
      metadata: { documentContext: !!documentContext },
    });

    try {
      // PATTERN: Inject document context if provided
      if (documentContext && documentContext.length > 0) {
        const contextMessage = {
          role: 'system',
          content: `Context from uploaded documents:\n${documentContext.join('\n\n')}`,
        };
        messages.unshift(contextMessage);
      }

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        user: userId, // For OpenAI usage tracking
        temperature: 0.7,
        max_tokens: 2000,
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const usage = completion.usage!;

      // CRITICAL: Calculate and track costs
      const cost = this.calculateCost('gpt-3.5-turbo', usage.prompt_tokens, usage.completion_tokens);

      // PATTERN: Log to monitoring service
      const generation = trace.generation({
        name: 'openai-chat',
        model: 'gpt-3.5-turbo',
        input: messages,
        output: completion.choices[0].message.content,
        usage: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
          total: usage.total_tokens,
        },
        totalCost: cost,
      });

      // PATTERN: Store usage in database for analytics
      await this.logUsageMetrics({
        userId,
        conversationId,
        model: 'gpt-3.5-turbo',
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        cost,
        responseTimeMs: responseTime,
      });

      await this.langfuse.shutdownAsync();

      return {
        message: completion.choices[0].message.content,
        usage,
        cost,
        responseTime,
      };
    } catch (error) {
      trace.update({ output: `Error: ${error.message}` });
      throw error;
    }
  }

  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = this.costPerToken[model];
    return (promptTokens * pricing.input) + (completionTokens * pricing.output);
  }
}
```

### Integration Points

```yaml
DATABASE:
  - migration: "CREATE EXTENSION IF NOT EXISTS vector;"
  - indexes: "CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops);"
  - pooling: "Use connection pooling with pg-pool for scalability"

EXTERNAL_APIS:
  - openai: "Store API keys in environment variables"
  - anthropic: "Implement as fallback provider with circuit breaker"
  - langfuse: "Configure for LLM observability and cost tracking"

FILE_STORAGE:
  - local: "Use multer for development file uploads"
  - cloud: "AWS S3 or Google Cloud Storage for production"
  - processing: "Background job queue for document parsing"

REAL_TIME:
  - socket_io: "Redis adapter for horizontal scaling"
  - presence: "Track user online status and typing indicators"
  - sync: "Offline message queueing with conflict resolution"

MOBILE_NATIVE:
  - permissions: "Microphone and storage permissions"
  - background: "Background app refresh for notifications"
  - security: "Keychain/Keystore for secure token storage"

MONITORING:
  - performance: "Application performance monitoring with Sentry"
  - logging: "Structured logging with Winston or Pino"
  - metrics: "Custom metrics for business KPIs"
```

## Validation Loop

### Level 1: Syntax & Style

```bash
# Mobile App
cd packages/mobile
npm run lint                    # ESLint for React Native
npx tsc --noEmit               # TypeScript checking
npm run format                 # Prettier formatting

# Backend API
cd packages/api
npm run lint                    # ESLint for Node.js
npx tsc --noEmit               # TypeScript checking
npm test --coverage            # Unit tests with coverage

# Web App
cd packages/web
npm run lint                    # Next.js linting
npm run build                   # Production build check
npm run type-check             # TypeScript validation

# Expected: No errors. Fix all linting and type errors before proceeding.
```

### Level 2: Unit Tests

```typescript
// packages/mobile/__tests__/VoiceRecordButton.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Voice from '@react-native-voice/voice';
import { VoiceRecordButton } from '../src/components/VoiceRecordButton';

// Mock the Voice module
jest.mock('@react-native-voice/voice', () => ({
  onSpeechStart: null,
  onSpeechEnd: null,
  onSpeechResults: null,
  onSpeechError: null,
  start: jest.fn(() => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
  destroy: jest.fn(() => Promise.resolve()),
  removeAllListeners: jest.fn(),
  isAvailable: jest.fn(() => Promise.resolve(true)),
}));

describe('VoiceRecordButton', () => {
  const mockOnTranscript = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('starts recording when pressed', async () => {
    const { getByText } = render(
      <VoiceRecordButton onTranscript={mockOnTranscript} onError={mockOnError} />
    );

    const button = getByText('Start Recording');
    fireEvent.press(button);

    await waitFor(() => {
      expect(Voice.start).toHaveBeenCalledWith('en-US');
    });
  });

  test('handles voice recognition results', async () => {
    const { getByText } = render(
      <VoiceRecordButton onTranscript={mockOnTranscript} onError={mockOnError} />
    );

    // Simulate voice recognition result
    Voice.onSpeechResults({ value: ['Hello world'] });

    expect(mockOnTranscript).toHaveBeenCalledWith('Hello world');
  });

  test('handles voice recognition errors', async () => {
    const { getByText } = render(
      <VoiceRecordButton onTranscript={mockOnTranscript} onError={mockOnError} />
    );

    // Simulate voice recognition error
    Voice.onSpeechError({ error: 'No speech detected' });

    expect(mockOnError).toHaveBeenCalledWith('No speech detected');
  });
});

// packages/api/tests/DocumentProcessor.test.ts
import { DocumentProcessor } from '../src/services/DocumentProcessor';
import fs from 'fs';
import path from 'path';

describe('DocumentProcessor', () => {
  let processor: DocumentProcessor;

  beforeEach(() => {
    processor = new DocumentProcessor();
  });

  test('processes PDF documents correctly', async () => {
    const pdfBuffer = fs.readFileSync(path.join(__dirname, 'fixtures/sample.pdf'));
    
    const result = await processor.processDocument(
      pdfBuffer.buffer,
      'sample.pdf',
      'test-user-123'
    );

    expect(result.chunks_processed).toBeGreaterThan(0);
    expect(result.total_characters).toBeGreaterThan(0);
    expect(result.embeddings_generated).toBe(result.chunks_processed);
  });

  test('throws error for unsupported file types', async () => {
    const textBuffer = Buffer.from('This is a text file').buffer;

    await expect(
      processor.processDocument(textBuffer, 'sample.txt', 'test-user-123')
    ).rejects.toThrow('Unsupported file type: txt');
  });

  test('handles document parsing errors gracefully', async () => {
    const invalidBuffer = Buffer.from('Invalid PDF content').buffer;

    await expect(
      processor.processDocument(invalidBuffer, 'invalid.pdf', 'test-user-123')
    ).rejects.toThrow('Document processing failed');
  });
});

// packages/api/tests/LLMService.test.ts
import { LLMService } from '../src/services/LLMService';
import OpenAI from 'openai';

jest.mock('openai');
jest.mock('langfuse');

describe('LLMService', () => {
  let llmService: LLMService;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Test response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    });

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } }
    } as any));

    llmService = new LLMService();
  });

  test('generates chat completion successfully', async () => {
    const messages = [{ role: 'user', content: 'Hello' }];
    
    const result = await llmService.generateChatCompletion(
      messages,
      'test-user',
      'test-conversation'
    );

    expect(result.message).toBe('Test response');
    expect(result.usage.total_tokens).toBe(30);
    expect(result.cost).toBeGreaterThan(0);
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-3.5-turbo',
      messages,
      user: 'test-user',
      temperature: 0.7,
      max_tokens: 2000,
    });
  });

  test('injects document context when provided', async () => {
    const messages = [{ role: 'user', content: 'What does the document say?' }];
    const documentContext = ['Document content here'];
    
    await llmService.generateChatCompletion(
      messages,
      'test-user',
      'test-conversation',
      documentContext
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[0].content).toContain('Document content here');
  });
});
```

```bash
# Run and iterate until all tests pass:
npm test --coverage
# Target: >80% code coverage across all packages
# If failing: Read errors, understand root cause, fix code, re-run
```

### Level 3: Integration Tests

```bash
# Start all services
docker-compose up -d postgres redis
cd packages/api && npm run dev &
cd packages/web && npm run dev &

# Test API endpoints
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com", "password": "password123"}'
# Expected: {"success": true, "user": {...}, "token": "..."}

curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'
# Expected: {"success": true, "user": {...}, "token": "...", "refreshToken": "..."}

# Test file upload
curl -X POST http://localhost:3001/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-document.pdf"
# Expected: {"success": true, "document": {...}, "processing_status": "queued"}

# Test chat completion
curl -X POST http://localhost:3001/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversation_id": "test-conv", "message": "Hello, how are you?"}'
# Expected: {"message": "...", "usage": {...}, "cost": 0.001}

# Test mobile app builds
cd packages/mobile
npx react-native run-ios --simulator="iPhone 14"
npx react-native run-android

# Test web app
curl http://localhost:3000
# Expected: HTML response with React app

# If errors: Check logs in terminal, browser console, or React Native debugger
```

### Level 4: End-to-End and Performance Testing

```bash
# Mobile E2E Testing with Detox
cd packages/mobile
npm run detox:build:ios
npm run detox:test:ios

# Expected test flows:
# - User can register and login
# - User can record voice and see transcription
# - User can upload document and ask questions
# - User can view chat history
# - Real-time messaging works correctly

# Web E2E Testing with Playwright
cd packages/web
npx playwright test

# Performance Testing
# Load test API with k6
k6 run tests/load-test.js
# Target: <200ms response time for 100 concurrent users

# Voice recognition performance
# Test on actual devices with varying network conditions
# Target: Transcription within 2 seconds of stopping recording

# LLM cost monitoring
# Verify usage tracking accuracy
# Test rate limiting and quota enforcement
# Monitor for cost anomalies

# Security Testing
npm audit --audit-level moderate
# Run OWASP ZAP security scan
# Test authentication and authorization flows
# Verify data encryption and secure storage
```

## Final Validation Checklist

- [ ] All unit tests pass with >80% coverage: `npm test --coverage`
- [ ] All integration tests pass: API, mobile, and web
- [ ] No linting errors: `npm run lint` in all packages
- [ ] No type errors: `npx tsc --noEmit` in all packages
- [ ] Manual testing successful: Voice recording → transcription → LLM response
- [ ] Document upload and processing works end-to-end
- [ ] Real-time chat functions properly across devices
- [ ] Authentication and session management secure
- [ ] Usage monitoring and cost tracking accurate
- [ ] Performance targets met: <2s voice transcription, <200ms API responses
- [ ] Mobile apps build and run on iOS and Android
- [ ] PWA works offline and receives push notifications
- [ ] Database migrations run successfully
- [ ] CI/CD pipeline deploys without errors
- [ ] Security audit shows no critical vulnerabilities
- [ ] Error handling graceful across all failure scenarios
- [ ] Logs informative but not verbose
- [ ] Documentation updated with API specs and user guides

---

## Anti-Patterns to Avoid

- ❌ Don't use Web Speech API as primary voice solution (limited browser support)
- ❌ Don't skip voice permission handling (will crash on mobile)
- ❌ Don't ignore LLM cost monitoring (can lead to unexpected bills)
- ❌ Don't use synchronous file processing (will block the UI)
- ❌ Don't store API keys in client-side code (security risk)
- ❌ Don't skip input validation (prone to injection attacks)
- ❌ Don't ignore offline scenarios (poor mobile UX)
- ❌ Don't use untyped API responses (leads to runtime errors)
- ❌ Don't skip error boundaries (crashes will propagate)
- ❌ Don't hardcode rate limits (should be configurable)
- ❌ Don't skip connection pooling (poor database performance)
- ❌ Don't use long-polling for real-time features (WebSockets are better)

## Success Confidence Score

**9/10** - This PRP provides comprehensive context, detailed implementation guidance, extensive validation loops, and addresses all the complex integration points needed for a production-ready mobile app with voice-to-text and LLM capabilities. The research-backed approach with specific URLs, code examples, and gotchas should enable successful one-pass implementation with the Claude Code system.