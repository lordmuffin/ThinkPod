import winston from 'winston';
import path from 'path';

// Custom log format
const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += `\n${JSON.stringify(metadata, null, 2)}`;
  }
  
  return msg;
});

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  defaultMeta: {
    service: 'thinkpod-api',
    version: process.env.npm_package_version || '1.0.0',
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        logFormat
      ),
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'app.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Error log file
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Create logs directory if it doesn't exist
import fs from 'fs';
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Add request logger for Express
export const requestLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'requests.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// Performance logger for monitoring
export const performanceLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'performance.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Utility functions for specific logging scenarios
export const logError = (error: Error, context?: Record<string, unknown>) => {
  logger.error(error.message, {
    stack: error.stack,
    name: error.name,
    ...context,
  });
};

export const logPerformance = (operation: string, duration: number, metadata?: Record<string, unknown>) => {
  performanceLogger.info('Performance metric', {
    operation,
    duration,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
};

export const logRequest = (req: any, res: any, duration: number) => {
  requestLogger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });
};

// Export default logger
export default logger;