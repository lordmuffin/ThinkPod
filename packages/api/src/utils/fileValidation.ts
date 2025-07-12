import fs from 'fs/promises';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';
import { logger } from './logger';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileInfo?: {
    size: number;
    mimeType: string;
    detectedType?: string;
    extension: string;
    isExecutable: boolean;
    hasMetadata: boolean;
  };
}

export interface ValidationOptions {
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
  checkMagicBytes?: boolean;
  scanForMalware?: boolean;
  validateContent?: boolean;
  strictTypeChecking?: boolean;
}

export class FileValidator {
  private readonly defaultOptions: Required<ValidationOptions> = {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ],
    allowedExtensions: ['.pdf', '.doc', '.docx', '.txt', '.md', '.markdown'],
    checkMagicBytes: true,
    scanForMalware: true,
    validateContent: true,
    strictTypeChecking: true
  };

  // Known malicious signatures and patterns
  private readonly maliciousSignatures = [
    // PE executable signatures
    Buffer.from([0x4D, 0x5A]), // MZ header
    Buffer.from([0x50, 0x45, 0x00, 0x00]), // PE header
    
    // Script signatures
    Buffer.from('<?php'),
    Buffer.from('#!/bin/'),
    Buffer.from('<script'),
    Buffer.from('javascript:'),
    Buffer.from('vbscript:'),
    
    // Archive bombs and suspicious ZIP content
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP header (requires additional checking)
    Buffer.from([0x52, 0x61, 0x72, 0x21]), // RAR header
  ];

  // Suspicious filename patterns
  private readonly suspiciousPatterns = [
    /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i, /\.pif$/i,
    /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.com$/i, /\.app$/i,
    /\.dmg$/i, /\.pkg$/i, /\.deb$/i, /\.rpm$/i,
    /\.\./,  // Directory traversal
    /[<>:"|?*\x00-\x1f]/, // Invalid filename characters
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, // Windows reserved names
  ];

  /**
   * Validate a file comprehensively
   */
  async validateFile(filePath: string, originalName?: string, options: ValidationOptions = {}): Promise<ValidationResult> {
    const opts = { ...this.defaultOptions, ...options };
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Check if file exists and get stats
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        result.errors.push('Path is not a file');
        result.isValid = false;
        return result;
      }

      // Read file buffer for analysis
      const buffer = await fs.readFile(filePath);
      const filename = originalName || path.basename(filePath);
      const extension = path.extname(filename).toLowerCase();

      // Initialize file info
      result.fileInfo = {
        size: buffer.length,
        mimeType: 'unknown',
        extension,
        isExecutable: false,
        hasMetadata: false
      };

      // 1. File size validation
      if (buffer.length > opts.maxFileSize) {
        result.errors.push(`File size ${Math.round(buffer.length / (1024 * 1024))}MB exceeds maximum ${Math.round(opts.maxFileSize / (1024 * 1024))}MB`);
        result.isValid = false;
      }

      if (buffer.length === 0) {
        result.errors.push('File is empty');
        result.isValid = false;
      }

      // 2. Filename validation
      const filenameValidation = this.validateFilename(filename);
      if (!filenameValidation.isValid) {
        result.errors.push(...filenameValidation.errors);
        result.warnings.push(...filenameValidation.warnings);
        result.isValid = false;
      }

      // 3. Extension validation
      if (!opts.allowedExtensions.includes(extension)) {
        result.errors.push(`File extension '${extension}' is not allowed`);
        result.isValid = false;
      }

      // 4. Magic bytes validation
      if (opts.checkMagicBytes) {
        const detectedType = await fileTypeFromBuffer(buffer);
        result.fileInfo.detectedType = detectedType?.mime;

        if (opts.strictTypeChecking && detectedType) {
          if (!opts.allowedMimeTypes.includes(detectedType.mime)) {
            result.errors.push(`Detected file type '${detectedType.mime}' is not allowed`);
            result.isValid = false;
          }

          // Check for extension mismatch
          const expectedExtensions = this.getExpectedExtensions(detectedType.mime);
          if (expectedExtensions.length > 0 && !expectedExtensions.includes(extension)) {
            result.warnings.push(`File extension '${extension}' doesn't match detected type '${detectedType.mime}'`);
          }
        }

        result.fileInfo.mimeType = detectedType?.mime || 'unknown';
      }

      // 5. Malware scanning
      if (opts.scanForMalware) {
        const malwareResult = await this.scanForMalware(buffer, filename);
        if (!malwareResult.isSafe) {
          result.errors.push(...malwareResult.threats);
          result.isValid = false;
        }
        result.warnings.push(...malwareResult.warnings);
      }

      // 6. Executable detection
      result.fileInfo.isExecutable = this.isExecutableFile(buffer, filename);
      if (result.fileInfo.isExecutable) {
        result.errors.push('File appears to be executable');
        result.isValid = false;
      }

      // 7. Content validation (specific to file types)
      if (opts.validateContent && result.fileInfo.detectedType) {
        const contentValidation = await this.validateFileContent(buffer, result.fileInfo.detectedType);
        if (!contentValidation.isValid) {
          result.errors.push(...contentValidation.errors);
          result.warnings.push(...contentValidation.warnings);
          result.isValid = false;
        }
        result.fileInfo.hasMetadata = contentValidation.hasMetadata;
      }

      // 8. Additional security checks
      const securityResult = await this.performSecurityChecks(buffer, filename);
      if (!securityResult.isSafe) {
        result.errors.push(...securityResult.issues);
        result.isValid = false;
      }
      result.warnings.push(...securityResult.warnings);

      logger.debug('File validation completed', {
        filename,
        size: buffer.length,
        isValid: result.isValid,
        errors: result.errors.length,
        warnings: result.warnings.length,
        detectedType: result.fileInfo.detectedType
      });

    } catch (error) {
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      result.isValid = false;
      
      logger.error('File validation error', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return result;
  }

  /**
   * Quick validation for uploaded files
   */
  async quickValidate(buffer: Buffer, filename: string, mimeType: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fileInfo: {
        size: buffer.length,
        mimeType,
        extension: path.extname(filename).toLowerCase(),
        isExecutable: false,
        hasMetadata: false
      }
    };

    // Basic checks
    if (buffer.length === 0) {
      result.errors.push('File is empty');
      result.isValid = false;
    }

    if (buffer.length > this.defaultOptions.maxFileSize) {
      result.errors.push('File too large');
      result.isValid = false;
    }

    // Malware scan
    const malwareResult = await this.scanForMalware(buffer, filename);
    if (!malwareResult.isSafe) {
      result.errors.push(...malwareResult.threats);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate filename for security issues
   */
  private validateFilename(filename: string): { isValid: boolean; errors: string[]; warnings: string[] } {
    const result = { isValid: true, errors: [], warnings: [] };

    // Check length
    if (filename.length === 0) {
      result.errors.push('Filename cannot be empty');
      result.isValid = false;
    }

    if (filename.length > 255) {
      result.errors.push('Filename too long (max 255 characters)');
      result.isValid = false;
    }

    // Check for suspicious patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(filename)) {
        result.errors.push('Filename contains suspicious patterns');
        result.isValid = false;
        break;
      }
    }

    // Check for multiple extensions (potential camouflage)
    const extensions = filename.match(/\.[a-zA-Z0-9]+/g);
    if (extensions && extensions.length > 2) {
      result.warnings.push('Filename has multiple extensions');
    }

    // Check for Unicode homoglyphs and suspicious characters
    if (this.containsSuspiciousUnicode(filename)) {
      result.warnings.push('Filename contains unusual Unicode characters');
    }

    return result;
  }

  /**
   * Scan buffer for malicious content
   */
  private async scanForMalware(buffer: Buffer, filename: string): Promise<{ 
    isSafe: boolean; 
    threats: string[]; 
    warnings: string[] 
  }> {
    const threats: string[] = [];
    const warnings: string[] = [];

    // Check for known malicious signatures
    for (const signature of this.maliciousSignatures) {
      if (buffer.includes(signature)) {
        threats.push('File contains suspicious binary signatures');
        break;
      }
    }

    // Check for script injection attempts
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024 * 10)); // First 10KB
    const scriptPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onclick\s*=/gi,
      /onerror\s*=/gi,
      /onload\s*=/gi,
      /<iframe[^>]*>/gi,
      /<object[^>]*>/gi,
      /<embed[^>]*>/gi
    ];

    for (const pattern of scriptPatterns) {
      if (pattern.test(content)) {
        threats.push('File contains potentially malicious script content');
        break;
      }
    }

    // Check for embedded executables in document files
    if (filename.toLowerCase().endsWith('.pdf') || filename.toLowerCase().endsWith('.docx')) {
      if (this.containsEmbeddedExecutable(buffer)) {
        threats.push('Document contains embedded executable content');
      }
    }

    // Check for macro signatures in Office documents
    if (filename.toLowerCase().endsWith('.docx') || filename.toLowerCase().endsWith('.doc')) {
      if (this.containsMacros(buffer)) {
        warnings.push('Document may contain macros');
      }
    }

    return {
      isSafe: threats.length === 0,
      threats,
      warnings
    };
  }

  /**
   * Check if file is executable
   */
  private isExecutableFile(buffer: Buffer, filename: string): boolean {
    // Check PE header (Windows executables)
    if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
      return true;
    }

    // Check ELF header (Linux executables)
    if (buffer.length >= 4 && 
        buffer[0] === 0x7F && buffer[1] === 0x45 && 
        buffer[2] === 0x4C && buffer[3] === 0x46) {
      return true;
    }

    // Check Mach-O header (macOS executables)
    if (buffer.length >= 4 && 
        ((buffer[0] === 0xFE && buffer[1] === 0xED && buffer[2] === 0xFA && buffer[3] === 0xCE) ||
         (buffer[0] === 0xCE && buffer[1] === 0xFA && buffer[2] === 0xED && buffer[3] === 0xFE))) {
      return true;
    }

    // Check shebang for scripts
    if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) { // #!
      return true;
    }

    return false;
  }

  /**
   * Validate file content based on type
   */
  private async validateFileContent(buffer: Buffer, mimeType: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    hasMetadata: boolean;
  }> {
    const result = { isValid: true, errors: [], warnings: [], hasMetadata: false };

    try {
      switch (mimeType) {
        case 'application/pdf':
          return this.validatePDFContent(buffer);
        
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return this.validateDocxContent(buffer);
        
        case 'text/plain':
        case 'text/markdown':
          return this.validateTextContent(buffer);
        
        default:
          result.warnings.push(`Content validation not implemented for ${mimeType}`);
      }
    } catch (error) {
      result.errors.push(`Content validation failed: ${error instanceof Error ? error.message : String(error)}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate PDF content
   */
  private validatePDFContent(buffer: Buffer): { isValid: boolean; errors: string[]; warnings: string[]; hasMetadata: boolean } {
    const result = { isValid: true, errors: [], warnings: [], hasMetadata: false };

    // Check PDF header
    if (!buffer.toString('ascii', 0, 4).startsWith('%PDF')) {
      result.errors.push('Invalid PDF header');
      result.isValid = false;
      return result;
    }

    const content = buffer.toString('ascii');

    // Check for suspicious PDF features
    if (content.includes('/JavaScript') || content.includes('/JS')) {
      result.warnings.push('PDF contains JavaScript');
    }

    if (content.includes('/EmbeddedFile')) {
      result.warnings.push('PDF contains embedded files');
    }

    if (content.includes('/Launch')) {
      result.warnings.push('PDF contains launch actions');
    }

    // Check for metadata
    if (content.includes('/Info') || content.includes('/Metadata')) {
      result.hasMetadata = true;
    }

    return result;
  }

  /**
   * Validate DOCX content
   */
  private validateDocxContent(buffer: Buffer): { isValid: boolean; errors: string[]; warnings: string[]; hasMetadata: boolean } {
    const result = { isValid: true, errors: [], warnings: [], hasMetadata: true };

    // Check ZIP header (DOCX is a ZIP file)
    if (!(buffer[0] === 0x50 && buffer[1] === 0x4B)) {
      result.errors.push('Invalid DOCX format (not a ZIP file)');
      result.isValid = false;
      return result;
    }

    const content = buffer.toString('ascii');

    // Check for macro-enabled document indicators
    if (content.includes('vbaProject') || content.includes('macroEnabled')) {
      result.warnings.push('Document may be macro-enabled');
    }

    // Check for external references
    if (content.includes('http://') || content.includes('https://')) {
      result.warnings.push('Document contains external references');
    }

    return result;
  }

  /**
   * Validate text content
   */
  private validateTextContent(buffer: Buffer): { isValid: boolean; errors: string[]; warnings: string[]; hasMetadata: boolean } {
    const result = { isValid: true, errors: [], warnings: [], hasMetadata: false };

    try {
      const content = buffer.toString('utf8');
      
      // Check for binary content in text file
      if (this.containsBinaryContent(content)) {
        result.warnings.push('Text file contains binary content');
      }

      // Check for very long lines (potential binary data)
      const lines = content.split('\n');
      const maxLineLength = Math.max(...lines.map(line => line.length));
      if (maxLineLength > 10000) {
        result.warnings.push('Text file contains very long lines');
      }

    } catch (error) {
      result.errors.push('Unable to decode file as UTF-8 text');
      result.isValid = false;
    }

    return result;
  }

  /**
   * Additional security checks
   */
  private async performSecurityChecks(buffer: Buffer, filename: string): Promise<{
    isSafe: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for ZIP bombs (for ZIP-based formats like DOCX)
    if (this.isZipFile(buffer)) {
      const compressionRatio = this.estimateCompressionRatio(buffer);
      if (compressionRatio > 100) { // Very high compression ratio
        warnings.push('File has unusually high compression ratio');
      }
    }

    // Check for polyglot files (files that are valid in multiple formats)
    const detectedTypes = await this.detectMultipleFormats(buffer);
    if (detectedTypes.length > 1) {
      warnings.push('File appears to be valid in multiple formats (polyglot)');
    }

    return {
      isSafe: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Utility methods
   */

  private getExpectedExtensions(mimeType: string): string[] {
    const mimeToExt: Record<string, string[]> = {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md', '.markdown']
    };
    return mimeToExt[mimeType] || [];
  }

  private containsSuspiciousUnicode(text: string): boolean {
    // Check for potentially dangerous Unicode characters
    const suspiciousRanges = [
      /[\u200B-\u200F]/,  // Zero-width characters
      /[\u2060-\u206F]/,  // Word joiner and similar
      /[\uFEFF]/,         // Byte order mark
      /[\u202A-\u202E]/   // Direction override characters
    ];
    
    return suspiciousRanges.some(pattern => pattern.test(text));
  }

  private containsEmbeddedExecutable(buffer: Buffer): boolean {
    // Look for PE headers within the file
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i] === 0x4D && buffer[i + 1] === 0x5A) {
        return true;
      }
    }
    return false;
  }

  private containsMacros(buffer: Buffer): boolean {
    const content = buffer.toString('ascii').toLowerCase();
    return content.includes('vbaproject') || 
           content.includes('macrosheet') ||
           content.includes('xl/macrosheets');
  }

  private containsBinaryContent(text: string): boolean {
    // Check for null bytes or other binary indicators
    return text.includes('\x00') || /[\x01-\x08\x0E-\x1F\x7F-\x9F]/.test(text);
  }

  private isZipFile(buffer: Buffer): boolean {
    return buffer.length >= 4 && 
           buffer[0] === 0x50 && buffer[1] === 0x4B &&
           (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
           (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
  }

  private estimateCompressionRatio(buffer: Buffer): number {
    // Very simplified estimation - in practice, you'd need to actually decompress
    if (buffer.length < 100) return 1;
    
    // Count unique bytes as a rough indicator
    const uniqueBytes = new Set(buffer).size;
    return buffer.length / uniqueBytes;
  }

  private async detectMultipleFormats(buffer: Buffer): Promise<string[]> {
    const formats: string[] = [];
    
    // Check for common format signatures
    const signatures = [
      { pattern: Buffer.from('%PDF'), format: 'PDF' },
      { pattern: Buffer.from([0x50, 0x4B]), format: 'ZIP' },
      { pattern: Buffer.from([0x89, 0x50, 0x4E, 0x47]), format: 'PNG' },
      { pattern: Buffer.from([0xFF, 0xD8, 0xFF]), format: 'JPEG' }
    ];

    for (const sig of signatures) {
      if (buffer.includes(sig.pattern)) {
        formats.push(sig.format);
      }
    }

    return formats;
  }
}