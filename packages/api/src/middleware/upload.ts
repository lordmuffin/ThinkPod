import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import { logger } from '../utils/logger';

// Supported file types per PRP requirements
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/x-empty' // For empty files that might be detected
];

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.md',
  '.markdown'
];

// Maximum file size: 50MB per PRP
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Maximum number of files per upload
const MAX_FILES = 5;

// Custom storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
    cb(null, uploadDir);
  },
  
  filename: (req, file, cb) => {
    // Generate unique filename while preserving extension
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const sanitizedBaseName = sanitizeFilename(baseName);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    
    const uniqueFilename = `${timestamp}-${random}-${sanitizedBaseName}${ext}`;
    cb(null, uniqueFilename);
  }
});

// File filter function
const fileFilter = async (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  try {
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      logger.warn('File rejected: invalid extension', {
        originalName: file.originalname,
        extension: ext,
        userId: req.userId
      });
      return cb(new Error(`File type not supported. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      logger.warn('File rejected: invalid MIME type', {
        originalName: file.originalname,
        mimeType: file.mimetype,
        userId: req.userId
      });
      return cb(new Error(`MIME type not supported. File appears to be: ${file.mimetype}`));
    }

    // Additional security checks
    const securityCheck = await performSecurityChecks(file);
    if (!securityCheck.safe) {
      logger.warn('File rejected: security check failed', {
        originalName: file.originalname,
        reason: securityCheck.reason,
        userId: req.userId
      });
      return cb(new Error(securityCheck.reason));
    }

    logger.debug('File accepted for upload', {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      userId: req.userId
    });

    cb(null, true);

  } catch (error) {
    logger.error('Error in file filter', {
      originalName: file.originalname,
      error: error instanceof Error ? error.message : String(error),
      userId: req.userId
    });
    cb(new Error('File validation failed'));
  }
};

// Multer configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fieldNameSize: 100,
    fieldSize: 1024,
    fields: 10
  }
});

// Middleware for single file upload
export const uploadSingle = upload.single('file');

// Middleware for multiple file upload
export const uploadMultiple = upload.array('files', MAX_FILES);

// Enhanced error handling middleware
export const handleUploadErrors = (error: any, req: Request, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    let errorMessage = 'File upload error';
    let statusCode = 400;

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        errorMessage = `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`;
        break;
      case 'LIMIT_FILE_COUNT':
        errorMessage = `Too many files. Maximum is ${MAX_FILES} files`;
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        errorMessage = 'Unexpected field name for file upload';
        break;
      case 'LIMIT_FIELD_COUNT':
        errorMessage = 'Too many form fields';
        break;
      case 'LIMIT_FIELD_KEY':
        errorMessage = 'Field name too long';
        break;
      case 'LIMIT_FIELD_VALUE':
        errorMessage = 'Field value too long';
        break;
      case 'LIMIT_PART_COUNT':
        errorMessage = 'Too many parts in multipart upload';
        break;
      default:
        errorMessage = `Upload error: ${error.message}`;
    }

    logger.warn('Multer upload error', {
      code: error.code,
      message: error.message,
      field: error.field,
      userId: req.userId
    });

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: 'UPLOAD_ERROR'
    });
  }

  if (error.message) {
    logger.warn('Upload validation error', {
      message: error.message,
      userId: req.userId
    });

    return res.status(400).json({
      success: false,
      error: error.message,
      code: 'VALIDATION_ERROR'
    });
  }

  next(error);
};

// File validation middleware (additional checks after upload)
export const validateUploadedFile = async (req: Request, res: any, next: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        code: 'NO_FILE'
      });
    }

    const file = req.file;

    // Re-validate file type using file content (more secure than trusting headers)
    const buffer = await import('fs').then(fs => fs.promises.readFile(file.path));
    const detectedType = await fileTypeFromBuffer(buffer);
    
    // Allow text files that might not be detected by file-type
    const isTextFile = file.mimetype === 'text/plain' || file.mimetype === 'text/markdown';
    const validType = detectedType && ALLOWED_MIME_TYPES.includes(detectedType.mime);
    
    if (!validType && !isTextFile) {
      // Clean up uploaded file
      await import('fs').then(fs => fs.promises.unlink(file.path).catch(() => {}));
      
      logger.warn('File content validation failed', {
        originalName: file.originalname,
        uploadedMimeType: file.mimetype,
        detectedMimeType: detectedType?.mime,
        userId: req.userId
      });

      return res.status(400).json({
        success: false,
        error: 'File content does not match expected format',
        code: 'INVALID_FILE_CONTENT'
      });
    }

    // Add detected MIME type to request for use in processing
    req.file.detectedMimeType = detectedType?.mime || file.mimetype;

    logger.info('File upload validated successfully', {
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimetype,
      detectedType: detectedType?.mime,
      userId: req.userId
    });

    next();

  } catch (error) {
    logger.error('File validation error', {
      originalName: req.file?.originalname,
      error: error instanceof Error ? error.message : String(error),
      userId: req.userId
    });

    // Clean up uploaded file on error
    if (req.file?.path) {
      await import('fs').then(fs => fs.promises.unlink(req.file!.path).catch(() => {}));
    }

    res.status(500).json({
      success: false,
      error: 'File validation failed',
      code: 'VALIDATION_ERROR'
    });
  }
};

// Multiple files validation middleware
export const validateUploadedFiles = async (req: Request, res: any, next: any) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
        code: 'NO_FILES'
      });
    }

    const files = req.files as Express.Multer.File[];
    const validatedFiles: Express.Multer.File[] = [];
    const errors: string[] = [];

    // Validate each file
    for (const file of files) {
      try {
        const buffer = await import('fs').then(fs => fs.promises.readFile(file.path));
        const detectedType = await fileTypeFromBuffer(buffer);
        
        const isTextFile = file.mimetype === 'text/plain' || file.mimetype === 'text/markdown';
        const validType = detectedType && ALLOWED_MIME_TYPES.includes(detectedType.mime);
        
        if (validType || isTextFile) {
          file.detectedMimeType = detectedType?.mime || file.mimetype;
          validatedFiles.push(file);
        } else {
          errors.push(`${file.originalname}: Invalid file content`);
          // Clean up invalid file
          await import('fs').then(fs => fs.promises.unlink(file.path).catch(() => {}));
        }
      } catch (error) {
        errors.push(`${file.originalname}: Validation failed`);
        await import('fs').then(fs => fs.promises.unlink(file.path).catch(() => {}));
      }
    }

    if (validatedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid files found',
        details: errors,
        code: 'NO_VALID_FILES'
      });
    }

    // Update request with validated files
    req.files = validatedFiles;

    if (errors.length > 0) {
      logger.warn('Some files failed validation', {
        totalFiles: files.length,
        validFiles: validatedFiles.length,
        errors,
        userId: req.userId
      });
    }

    logger.info('Files upload validated', {
      totalFiles: validatedFiles.length,
      userId: req.userId
    });

    next();

  } catch (error) {
    logger.error('Files validation error', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.userId
    });

    // Clean up all uploaded files on error
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        await import('fs').then(fs => fs.promises.unlink(file.path).catch(() => {}));
      }
    }

    res.status(500).json({
      success: false,
      error: 'Files validation failed',
      code: 'VALIDATION_ERROR'
    });
  }
};

// Utility functions
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 200); // Limit length
}

async function performSecurityChecks(file: Express.Multer.File): Promise<{ safe: boolean; reason?: string }> {
  // Check filename for suspicious patterns
  const suspiciousPatterns = [
    /\.exe$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.scr$/i,
    /\.pif$/i,
    /\.vbs$/i,
    /\.js$/i,
    /\.jar$/i,
    /\.\./,  // Directory traversal
    /[<>:"|?*]/, // Invalid filename characters
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(file.originalname)) {
      return {
        safe: false,
        reason: 'Filename contains suspicious patterns'
      };
    }
  }

  // Check for excessively long filenames
  if (file.originalname.length > 255) {
    return {
      safe: false,
      reason: 'Filename too long'
    };
  }

  // Check for null bytes
  if (file.originalname.includes('\x00')) {
    return {
      safe: false,
      reason: 'Filename contains null bytes'
    };
  }

  return { safe: true };
}

// Type augmentation for Express Request to include detectedMimeType
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        detectedMimeType?: string;
      }
    }
  }
}

export {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_FILES
};