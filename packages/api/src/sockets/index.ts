import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { DatabaseConnection } from '../utils/database';
import type { User, SocketEvents } from '@thinkpod/shared';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: User;
}

// Socket authentication middleware
const authenticateSocket = async (socket: AuthenticatedSocket, next: any) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next(new Error('JWT secret not configured'));
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    
    // You would typically verify the user exists in the database here
    socket.userId = decoded.userId;
    
    logger.info('Socket authenticated', {
      socketId: socket.id,
      userId: decoded.userId,
    });

    next();
  } catch (error) {
    logger.error('Socket authentication failed:', error);
    next(new Error('Authentication error'));
  }
};

// Handle socket connection
const handleConnection = (socket: AuthenticatedSocket, db: DatabaseConnection) => {
  logger.info('User connected', {
    socketId: socket.id,
    userId: socket.userId,
  });

  // Update user online status
  if (socket.userId) {
    db.query('UPDATE users SET is_online = true WHERE id = $1', [socket.userId])
      .catch(error => logger.error('Failed to update user online status:', error));
  }

  // Join user to their conversations
  socket.on('join-conversations', async () => {
    try {
      if (!socket.userId) return;

      const conversations = await db.query(`
        SELECT id FROM conversations WHERE user_id = $1
      `, [socket.userId]);

      conversations.forEach(conv => {
        socket.join(`conversation:${conv.id}`);
      });

      logger.debug('User joined conversations', {
        socketId: socket.id,
        userId: socket.userId,
        conversationCount: conversations.length,
      });
    } catch (error) {
      logger.error('Error joining conversations:', error);
    }
  });

  // Handle new message
  socket.on('send-message', async (data) => {
    try {
      const { conversationId, content, parentId, tempId } = data;

      if (!socket.userId || !conversationId || !content) {
        socket.emit('error', 'Invalid message data');
        return;
      }

      // Verify user has access to conversation
      const hasAccess = await db.query(`
        SELECT id FROM conversations 
        WHERE id = $1 AND user_id = $2
      `, [conversationId, socket.userId]);

      if (hasAccess.length === 0) {
        socket.emit('error', 'Access denied to conversation');
        return;
      }

      // Save message to database
      const message = await db.insert('messages', {
        conversation_id: conversationId,
        user_id: socket.userId,
        content,
        message_type: 'user',
      });

      // Get user info
      const user = await db.findById('users', socket.userId);

      // Broadcast to conversation participants
      const messageResponse = {
        id: message.id,
        conversation_id: conversationId,
        content: message.content,
        message_type: message.message_type,
        created_at: message.created_at.toISOString(),
        sender: {
          id: socket.userId,
          username: user?.username || 'Unknown',
        },
      };

      socket.to(`conversation:${conversationId}`).emit('new-message', messageResponse);

      // Send delivery confirmation
      socket.emit('message-sent', { tempId, messageId: message.id });

      logger.info('Message sent', {
        messageId: message.id,
        conversationId,
        userId: socket.userId,
      });
    } catch (error) {
      logger.error('Error sending message:', error);
      socket.emit('error', 'Failed to send message');
    }
  });

  // Handle typing indicators
  socket.on('typing-start', (conversationId) => {
    if (!socket.userId || !conversationId) return;

    socket.to(`conversation:${conversationId}`).emit('user-typing', {
      userId: socket.userId,
      conversationId,
    });
  });

  socket.on('typing-stop', (conversationId) => {
    if (!socket.userId || !conversationId) return;

    socket.to(`conversation:${conversationId}`).emit('user-stopped-typing', {
      userId: socket.userId,
      conversationId,
    });
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    logger.info('User disconnected', {
      socketId: socket.id,
      userId: socket.userId,
    });

    // Update user offline status (after a delay in case of reconnection)
    if (socket.userId) {
      setTimeout(async () => {
        try {
          // Check if user has other active connections
          const userSockets = await socket.in(`user:${socket.userId}`).fetchSockets();
          
          if (userSockets.length === 0) {
            // No other connections, mark as offline
            await db.query('UPDATE users SET is_online = false WHERE id = $1', [socket.userId]);
          }
        } catch (error) {
          logger.error('Failed to update user offline status:', error);
        }
      }, 5000); // 5 second delay
    }
  });

  // Join user to their personal room for direct messaging
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }
};

// Setup socket handlers
export const setupSocketHandlers = (io: Server, db: DatabaseConnection) => {
  // Apply authentication middleware
  io.use(authenticateSocket);

  // Handle connections
  io.on('connection', (socket: AuthenticatedSocket) => {
    handleConnection(socket, db);
  });

  logger.info('Socket.IO handlers configured');
};

export default setupSocketHandlers;