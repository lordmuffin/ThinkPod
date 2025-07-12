-- Sample data for development and testing
-- This file should only be run in development environment

-- Insert sample users (passwords are 'password123' hashed with bcrypt)
INSERT INTO users (id, username, email, password_hash, is_online) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440001',
    'john_doe',
    'john@example.com',
    '$2b$10$K7nQ8j9F1Q2k7X8Y9Z0a1.1O2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y',
    true
),
(
    '550e8400-e29b-41d4-a716-446655440002',
    'jane_smith',
    'jane@example.com',
    '$2b$10$K7nQ8j9F1Q2k7X8Y9Z0a1.1O2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y',
    false
),
(
    '550e8400-e29b-41d4-a716-446655440003',
    'alice_johnson',
    'alice@example.com',
    '$2b$10$K7nQ8j9F1Q2k7X8Y9Z0a1.1O2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y',
    true
),
(
    '550e8400-e29b-41d4-a716-446655440004',
    'bob_wilson',
    'bob@example.com',
    '$2b$10$K7nQ8j9F1Q2k7X8Y9Z0a1.1O2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y',
    false
);

-- Insert sample conversations
INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES
(
    '660e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    'Getting Started with AI',
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    CURRENT_TIMESTAMP - INTERVAL '1 hour'
),
(
    '660e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440001',
    'Document Analysis Help',
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes'
),
(
    '660e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440002',
    'Voice Recording Questions',
    CURRENT_TIMESTAMP - INTERVAL '3 hours',
    CURRENT_TIMESTAMP - INTERVAL '10 minutes'
),
(
    '660e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440003',
    'Mobile App Features',
    CURRENT_TIMESTAMP - INTERVAL '6 hours',
    CURRENT_TIMESTAMP - INTERVAL '5 minutes'
);

-- Insert sample messages
INSERT INTO messages (id, conversation_id, user_id, content, message_type, created_at) VALUES
-- Conversation 1: Getting Started with AI
(
    '770e8400-e29b-41d4-a716-446655440001',
    '660e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    'Hi! I''m new to AI and would like to understand how this app works.',
    'user',
    CURRENT_TIMESTAMP - INTERVAL '2 days' + INTERVAL '5 minutes'
),
(
    '770e8400-e29b-41d4-a716-446655440002',
    '660e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    'Welcome! This app allows you to interact with AI through voice and text. You can record your voice, upload documents, and have natural conversations. Would you like me to explain any specific feature?',
    'assistant',
    CURRENT_TIMESTAMP - INTERVAL '2 days' + INTERVAL '6 minutes'
),
(
    '770e8400-e29b-41d4-a716-446655440003',
    '660e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    'How does the voice recording feature work?',
    'user',
    CURRENT_TIMESTAMP - INTERVAL '1 hour' + INTERVAL '30 seconds'
),
(
    '770e8400-e29b-41d4-a716-446655440004',
    '660e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    'The voice recording feature uses advanced speech-to-text technology. Simply tap the microphone button, speak naturally, and your words will be transcribed and sent to the AI. The transcription typically takes less than 2 seconds.',
    'assistant',
    CURRENT_TIMESTAMP - INTERVAL '1 hour'
),

-- Conversation 2: Document Analysis Help
(
    '770e8400-e29b-41d4-a716-446655440005',
    '660e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440001',
    'I uploaded a PDF document. Can you help me analyze it?',
    'user',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
),
(
    '770e8400-e29b-41d4-a716-446655440006',
    '660e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440001',
    'I''d be happy to help you analyze your document! Once uploaded, documents are processed and I can answer questions about their content. What specific aspects would you like me to focus on?',
    'assistant',
    CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '1 minute'
),
(
    '770e8400-e29b-41d4-a716-446655440007',
    '660e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440001',
    'Can you summarize the main points and identify any action items?',
    'user',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes'
),

-- Conversation 3: Voice Recording Questions
(
    '770e8400-e29b-41d4-a716-446655440008',
    '660e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440002',
    'Does the voice recording work offline?',
    'user',
    CURRENT_TIMESTAMP - INTERVAL '3 hours'
),
(
    '770e8400-e29b-41d4-a716-446655440009',
    '660e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440002',
    'The voice recording has both online and offline capabilities. For real-time transcription, an internet connection is required. However, the app can record audio offline and process it when connection is restored.',
    'assistant',
    CURRENT_TIMESTAMP - INTERVAL '3 hours' + INTERVAL '30 seconds'
),
(
    '770e8400-e29b-41d4-a716-446655440010',
    '660e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440002',
    'What languages are supported?',
    'user',
    CURRENT_TIMESTAMP - INTERVAL '10 minutes'
),

-- Conversation 4: Mobile App Features
(
    '770e8400-e29b-41d4-a716-446655440011',
    '660e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440003',
    'What are the main features of this mobile app?',
    'user',
    CURRENT_TIMESTAMP - INTERVAL '6 hours'
),
(
    '770e8400-e29b-41d4-a716-446655440012',
    '660e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440003',
    'The main features include: 1) Voice-to-text recording with real-time transcription, 2) Document upload and AI-powered analysis, 3) Real-time chat with conversation history, 4) Cross-platform support (iOS, Android, Web), 5) Secure authentication and data encryption. Each feature is designed for intuitive mobile use.',
    'assistant',
    CURRENT_TIMESTAMP - INTERVAL '6 hours' + INTERVAL '1 minute'
),
(
    '770e8400-e29b-41d4-a716-446655440013',
    '660e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440003',
    'Is my data secure?',
    'user',
    CURRENT_TIMESTAMP - INTERVAL '5 minutes'
);

-- Insert sample documents
INSERT INTO documents (id, user_id, filename, content, file_type, file_size, upload_url, created_at) VALUES
(
    '880e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    'project_requirements.pdf',
    'Project Requirements Document\n\nOverview:\nThis document outlines the requirements for the ThinkPod mobile application development project. The application will integrate voice-to-text capabilities with Large Language Model (LLM) interaction.\n\nKey Features:\n1. Voice Recording and Transcription\n2. Real-time Chat Interface\n3. Document Upload and Processing\n4. User Authentication\n5. Cross-platform Support\n\nTechnical Requirements:\n- React Native for mobile development\n- Next.js for web application\n- PostgreSQL database with vector search\n- Socket.IO for real-time communication\n- OpenAI integration for LLM capabilities\n\nSecurity Requirements:\n- End-to-end encryption for voice data\n- Secure authentication with JWT tokens\n- GDPR compliance for data handling\n\nPerformance Requirements:\n- Voice transcription within 2 seconds\n- Real-time message delivery under 100ms\n- Support for 1000+ concurrent users',
    'application/pdf',
    15420,
    '/uploads/documents/project_requirements_001.pdf',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
),
(
    '880e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440002',
    'user_manual.docx',
    'ThinkPod User Manual\n\nGetting Started:\nWelcome to ThinkPod, your AI-powered voice and document assistant.\n\nChapter 1: Voice Recording\nTo start recording:\n1. Tap the microphone button\n2. Speak clearly into your device\n3. Tap stop when finished\n4. Your speech will be transcribed automatically\n\nChapter 2: Document Upload\nSupported formats: PDF, DOCX, XLSX, PPTX\nMaximum file size: 25MB\n\nTo upload a document:\n1. Tap the upload button\n2. Select your file\n3. Wait for processing to complete\n4. Ask questions about your document\n\nChapter 3: Chat Features\n- Real-time messaging\n- Conversation history\n- Message search\n- Export conversations\n\nTroubleshooting:\n- If voice recording fails, check microphone permissions\n- For upload issues, verify file format and size\n- Contact support for technical assistance',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    8750,
    '/uploads/documents/user_manual_002.docx',
    CURRENT_TIMESTAMP - INTERVAL '3 hours'
);

-- Insert sample document embeddings (simplified for demo)
INSERT INTO document_embeddings (id, document_id, chunk_index, content, embedding, created_at) VALUES
(
    '990e8400-e29b-41d4-a716-446655440001',
    '880e8400-e29b-41d4-a716-446655440001',
    0,
    'Project Requirements Document. Overview: This document outlines the requirements for the ThinkPod mobile application development project. The application will integrate voice-to-text capabilities with Large Language Model (LLM) interaction.',
    '[0.1, 0.2, 0.3, 0.4, 0.5]',  -- Simplified embedding vector (real would be 1536 dimensions)
    CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '5 minutes'
),
(
    '990e8400-e29b-41d4-a716-446655440002',
    '880e8400-e29b-41d4-a716-446655440001',
    1,
    'Key Features: 1. Voice Recording and Transcription 2. Real-time Chat Interface 3. Document Upload and Processing 4. User Authentication 5. Cross-platform Support',
    '[0.2, 0.3, 0.4, 0.5, 0.6]',
    CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '5 minutes'
),
(
    '990e8400-e29b-41d4-a716-446655440003',
    '880e8400-e29b-41d4-a716-446655440002',
    0,
    'ThinkPod User Manual. Getting Started: Welcome to ThinkPod, your AI-powered voice and document assistant. Chapter 1: Voice Recording',
    '[0.3, 0.4, 0.5, 0.6, 0.7]',
    CURRENT_TIMESTAMP - INTERVAL '3 hours' + INTERVAL '2 minutes'
);

-- Insert sample LLM usage data
INSERT INTO llm_usage (id, user_id, conversation_id, model, prompt_tokens, completion_tokens, total_tokens, cost, response_time_ms, created_at) VALUES
(
    'aa0e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    '660e8400-e29b-41d4-a716-446655440001',
    'gpt-3.5-turbo',
    45,
    78,
    123,
    0.0001845,  -- Cost based on token usage
    1250,
    CURRENT_TIMESTAMP - INTERVAL '2 days' + INTERVAL '6 minutes'
),
(
    'aa0e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440001',
    '660e8400-e29b-41d4-a716-446655440001',
    'gpt-3.5-turbo',
    32,
    95,
    127,
    0.0001905,
    980,
    CURRENT_TIMESTAMP - INTERVAL '1 hour'
),
(
    'aa0e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440002',
    '660e8400-e29b-41d4-a716-446655440003',
    'gpt-3.5-turbo',
    28,
    67,
    95,
    0.0001425,
    875,
    CURRENT_TIMESTAMP - INTERVAL '3 hours' + INTERVAL '30 seconds'
),
(
    'aa0e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440003',
    '660e8400-e29b-41d4-a716-446655440004',
    'gpt-3.5-turbo',
    52,
    156,
    208,
    0.000312,
    1580,
    CURRENT_TIMESTAMP - INTERVAL '6 hours' + INTERVAL '1 minute'
);

-- Update last_seen timestamps for active users
UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE is_online = true;

-- Add some additional messages to make conversations more realistic
INSERT INTO messages (conversation_id, user_id, content, message_type, created_at) VALUES
(
    '660e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440001',
    'Based on your uploaded document, here are the main points:\n\n1. **Project Overview**: Development of ThinkPod mobile app with voice-to-text and LLM integration\n2. **Key Features**: Voice recording, real-time chat, document processing, authentication\n3. **Technical Stack**: React Native, Next.js, PostgreSQL, Socket.IO, OpenAI\n\n**Action Items Identified**:\n- Implement voice transcription under 2-second requirement\n- Ensure real-time messaging under 100ms latency\n- Implement GDPR compliance measures\n- Support 1000+ concurrent users\n- Add end-to-end encryption for voice data',
    'assistant',
    CURRENT_TIMESTAMP - INTERVAL '29 minutes'
),
(
    '660e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440002',
    'The app supports multiple languages including English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese, and Korean. The language can be set in your user preferences or detected automatically.',
    'assistant',
    CURRENT_TIMESTAMP - INTERVAL '9 minutes'
),
(
    '660e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440003',
    'Yes, your data is highly secure. We use:\n• End-to-end encryption for all voice recordings\n• AES-256 encryption for data at rest\n• JWT tokens with refresh rotation for authentication\n• HTTPS/TLS for all data transmission\n• Regular security audits and compliance with GDPR\n• No voice data is permanently stored after transcription',
    'assistant',
    CURRENT_TIMESTAMP - INTERVAL '4 minutes'
);