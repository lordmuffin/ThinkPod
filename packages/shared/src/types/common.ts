// Common utility types

// Generic pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// File types
export interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// Audio recording
export interface AudioRecordingState {
  isRecording: boolean;
  duration: number;
  audioUrl?: string;
  error?: string;
}

export interface VoiceRecognitionState {
  isListening: boolean;
  transcript: string;
  confidence: number;
  error?: string;
  isSupported: boolean;
}

// Chat states
export interface ChatState {
  messages: Record<string, MessageResponse[]>;
  conversations: ConversationResponse[];
  activeConversationId?: string;
  isLoading: boolean;
  error?: string;
  typingUsers: Record<string, string[]>; // conversationId -> userIds
}

// Connection states
export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
  lastConnected?: Date;
  retryCount: number;
}

// App configuration
export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
  };
  voice: {
    language: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
  };
  llm: {
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  };
  files: {
    maxSize: number; // in bytes
    allowedTypes: string[];
    chunkSize: number; // for large file uploads
  };
}

// Feature flags
export interface FeatureFlags {
  voiceRecording: boolean;
  documentUpload: boolean;
  realTimeChat: boolean;
  biometricAuth: boolean;
  offlineMode: boolean;
  pushNotifications: boolean;
}

// User preferences
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    push: boolean;
    email: boolean;
    sound: boolean;
  };
  voice: {
    autoStart: boolean;
    language: string;
    sensitivity: number;
  };
  privacy: {
    analytics: boolean;
    crashReporting: boolean;
  };
}

// Analytics events
export interface AnalyticsEvent {
  event: string;
  userId?: string;
  properties: Record<string, unknown>;
  timestamp: Date;
}

// Import the API types
import type { MessageResponse, ConversationResponse } from './api';

// Environment types
export type Environment = 'development' | 'staging' | 'production';

// Platform types
export type Platform = 'ios' | 'android' | 'web' | 'desktop';

// Device info
export interface DeviceInfo {
  platform: Platform;
  version: string;
  model?: string;
  manufacturer?: string;
  isEmulator?: boolean;
}

// Network info
export interface NetworkInfo {
  isConnected: boolean;
  type: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  isInternetReachable: boolean;
}

// Location (if needed for features)
export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

// Biometric types
export type BiometricType = 'fingerprint' | 'face' | 'voice' | 'none';

export interface BiometricOptions {
  promptMessage?: string;
  fallbackTitle?: string;
  disableDeviceFallback?: boolean;
}