import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { fileTypeFromBuffer } from 'file-type';
import { logger } from '../utils/logger';

export interface ExtractionResult {
  content: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    characterCount: number;
    language?: string;
    title?: string;
    author?: string;
    createdDate?: Date;
  };
}

export interface ExtractionOptions {
  preserveFormatting?: boolean;
  maxLength?: number;
  extractMetadata?: boolean;
}

export class TextExtractionService {
  private readonly supportedTypes = {
    'application/pdf': this.extractPDF.bind(this),
    'application/msword': this.extractDOC.bind(this),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': this.extractDOCX.bind(this),
    'text/plain': this.extractTXT.bind(this),
    'text/markdown': this.extractMarkdown.bind(this),
    'application/x-empty': this.extractTXT.bind(this), // Handle empty files
  };

  /**
   * Extract text from file based on its type
   */
  async extractText(
    filePath: string, 
    mimeType?: string, 
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    try {
      // Read file buffer
      const buffer = await fs.readFile(filePath);
      
      // Detect file type if not provided
      if (!mimeType) {
        const detectedType = await fileTypeFromBuffer(buffer);
        mimeType = detectedType?.mime || 'text/plain';
      }

      // Validate file type is supported
      const extractor = this.supportedTypes[mimeType as keyof typeof this.supportedTypes];
      if (!extractor) {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Extract content
      const result = await extractor(buffer, options);
      
      // Apply length limit if specified
      if (options.maxLength && result.content.length > options.maxLength) {
        result.content = result.content.substring(0, options.maxLength);
        result.metadata.characterCount = options.maxLength;
      }

      const processingTime = Date.now() - startTime;
      
      logger.info('Text extraction completed', {
        filePath,
        mimeType,
        contentLength: result.content.length,
        wordCount: result.metadata.wordCount,
        processingTime
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Text extraction failed', {
        filePath,
        mimeType,
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new Error(`Failed to extract text from file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract text from PDF file
   */
  private async extractPDF(buffer: Buffer, options: ExtractionOptions): Promise<ExtractionResult> {
    try {
      const data = await pdfParse(buffer);
      
      const content = this.cleanText(data.text, options.preserveFormatting);
      const wordCount = this.countWords(content);
      
      return {
        content,
        metadata: {
          pageCount: data.numpages,
          wordCount,
          characterCount: content.length,
          title: data.info?.Title,
          author: data.info?.Author,
          createdDate: data.info?.CreationDate ? new Date(data.info.CreationDate) : undefined
        }
      };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract text from DOC file (legacy Word format)
   */
  private async extractDOC(buffer: Buffer, options: ExtractionOptions): Promise<ExtractionResult> {
    try {
      // For DOC files, we need a different approach as mammoth primarily handles DOCX
      // This is a basic implementation - in production, you might want to use a more robust solution
      const content = buffer.toString('utf8');
      const cleanedContent = this.cleanText(content, options.preserveFormatting);
      const wordCount = this.countWords(cleanedContent);
      
      return {
        content: cleanedContent,
        metadata: {
          wordCount,
          characterCount: cleanedContent.length
        }
      };
    } catch (error) {
      throw new Error(`DOC extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract text from DOCX file
   */
  private async extractDOCX(buffer: Buffer, options: ExtractionOptions): Promise<ExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      const content = this.cleanText(result.value, options.preserveFormatting);
      const wordCount = this.countWords(content);
      
      return {
        content,
        metadata: {
          wordCount,
          characterCount: content.length
        }
      };
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract text from plain text file
   */
  private async extractTXT(buffer: Buffer, options: ExtractionOptions): Promise<ExtractionResult> {
    try {
      const content = buffer.toString('utf8');
      const cleanedContent = this.cleanText(content, options.preserveFormatting);
      const wordCount = this.countWords(cleanedContent);
      
      return {
        content: cleanedContent,
        metadata: {
          wordCount,
          characterCount: cleanedContent.length
        }
      };
    } catch (error) {
      throw new Error(`TXT extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract text from Markdown file
   */
  private async extractMarkdown(buffer: Buffer, options: ExtractionOptions): Promise<ExtractionResult> {
    try {
      const content = buffer.toString('utf8');
      
      // For markdown, preserve formatting by default unless explicitly disabled
      const preserveFormatting = options.preserveFormatting !== false;
      const cleanedContent = this.cleanText(content, preserveFormatting);
      const wordCount = this.countWords(cleanedContent);
      
      return {
        content: cleanedContent,
        metadata: {
          wordCount,
          characterCount: cleanedContent.length
        }
      };
    } catch (error) {
      throw new Error(`Markdown extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean extracted text
   */
  private cleanText(text: string, preserveFormatting = false): string {
    if (!text) return '';
    
    let cleaned = text;
    
    if (!preserveFormatting) {
      // Remove excessive whitespace
      cleaned = cleaned.replace(/\s+/g, ' ');
      // Remove leading/trailing whitespace
      cleaned = cleaned.trim();
    } else {
      // Preserve formatting but normalize line endings
      cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      // Remove excessive empty lines (more than 2 consecutive)
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    }
    
    return cleaned;
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Get supported file types
   */
  getSupportedTypes(): string[] {
    return Object.keys(this.supportedTypes);
  }

  /**
   * Check if file type is supported
   */
  isTypeSupported(mimeType: string): boolean {
    return mimeType in this.supportedTypes;
  }

  /**
   * Validate file for text extraction
   */
  async validateFile(filePath: string): Promise<{
    isValid: boolean;
    mimeType?: string;
    error?: string;
  }> {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Read file buffer to detect type
      const buffer = await fs.readFile(filePath);
      const detectedType = await fileTypeFromBuffer(buffer);
      const mimeType = detectedType?.mime || 'text/plain';
      
      // Check if type is supported
      if (!this.isTypeSupported(mimeType)) {
        return {
          isValid: false,
          mimeType,
          error: `Unsupported file type: ${mimeType}`
        };
      }
      
      return {
        isValid: true,
        mimeType
      };
      
    } catch (error) {
      return {
        isValid: false,
        error: `File validation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Estimate processing time based on file size
   */
  estimateProcessingTime(fileSize: number, mimeType: string): number {
    // Base processing time in milliseconds per MB
    const baseTimePerMB = {
      'application/pdf': 2000,
      'application/msword': 1000,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 1500,
      'text/plain': 100,
      'text/markdown': 100
    };
    
    const timePerMB = baseTimePerMB[mimeType as keyof typeof baseTimePerMB] || 1000;
    const fileSizeMB = fileSize / (1024 * 1024);
    
    return Math.max(500, Math.round(fileSizeMB * timePerMB)); // Minimum 500ms
  }
}