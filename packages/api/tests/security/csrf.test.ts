import request from 'supertest';
import { app } from '../../src/app';
import { generateToken } from '../../src/middleware/csrf';

describe('CSRF Protection', () => {
  describe('CSRF Token Generation', () => {
    it('should generate a valid CSRF token', () => {
      const token = generateToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes in hex = 64 characters
    });

    it('should generate unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('CSRF Token Endpoint', () => {
    it('should return a CSRF token on GET /api/csrf-token', async () => {
      const response = await request(app.app)
        .get('/api/csrf-token')
        .expect(200);

      expect(response.body).toHaveProperty('csrfToken');
      expect(typeof response.body.csrfToken).toBe('string');
      expect(response.body.csrfToken.length).toBe(64);
    });

    it('should set CSRF cookie when requesting token', async () => {
      const response = await request(app.app)
        .get('/api/csrf-token')
        .expect(200);

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      
      const csrfCookie = cookies?.find((cookie: string) => 
        cookie.startsWith('csrf-token=')
      );
      expect(csrfCookie).toBeDefined();
    });
  });

  describe('CSRF Protection Middleware', () => {
    let csrfToken: string;
    let cookies: string[];

    beforeEach(async () => {
      const response = await request(app.app)
        .get('/api/csrf-token');
      
      csrfToken = response.body.csrfToken;
      cookies = response.headers['set-cookie'];
    });

    describe('Exempted Endpoints', () => {
      it('should allow POST to /api/auth/login without CSRF token', async () => {
        await request(app.app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123'
          })
          .expect(401); // Should fail auth, not CSRF
      });

      it('should allow POST to /api/auth/register without CSRF token', async () => {
        await request(app.app)
          .post('/api/auth/register')
          .send({
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123'
          })
          .expect(409); // Should fail due to user exists, not CSRF
      });

      it('should allow GET /health without CSRF token', async () => {
        await request(app.app)
          .get('/health')
          .expect(200);
      });
    });

    describe('Protected Endpoints', () => {
      it('should reject POST requests without CSRF token', async () => {
        await request(app.app)
          .post('/api/conversations')
          .send({ title: 'Test Conversation' })
          .expect(403);
      });

      it('should reject PUT requests without CSRF token', async () => {
        await request(app.app)
          .put('/api/conversations/123')
          .send({ title: 'Updated Title' })
          .expect(403);
      });

      it('should reject DELETE requests without CSRF token', async () => {
        await request(app.app)
          .delete('/api/conversations/123')
          .expect(403);
      });

      it('should accept requests with valid CSRF token in header', async () => {
        await request(app.app)
          .post('/api/conversations')
          .set('Cookie', cookies)
          .set('x-csrf-token', csrfToken)
          .send({ title: 'Test Conversation' })
          .expect(401); // Should fail auth, not CSRF
      });

      it('should accept requests with valid CSRF token in body', async () => {
        await request(app.app)
          .post('/api/conversations')
          .set('Cookie', cookies)
          .send({ 
            title: 'Test Conversation',
            _csrf: csrfToken 
          })
          .expect(401); // Should fail auth, not CSRF
      });

      it('should reject requests with invalid CSRF token', async () => {
        await request(app.app)
          .post('/api/conversations')
          .set('Cookie', cookies)
          .set('x-csrf-token', 'invalid-token')
          .send({ title: 'Test Conversation' })
          .expect(403);
      });

      it('should reject requests with mismatched CSRF tokens', async () => {
        const otherToken = generateToken();
        
        await request(app.app)
          .post('/api/conversations')
          .set('Cookie', cookies)
          .set('x-csrf-token', otherToken)
          .send({ title: 'Test Conversation' })
          .expect(403);
      });
    });

    describe('Safe Methods', () => {
      it('should allow GET requests without CSRF token', async () => {
        await request(app.app)
          .get('/api/conversations')
          .expect(401); // Should fail auth, not CSRF
      });

      it('should allow HEAD requests without CSRF token', async () => {
        await request(app.app)
          .head('/api/conversations')
          .expect(401); // Should fail auth, not CSRF
      });

      it('should allow OPTIONS requests without CSRF token', async () => {
        await request(app.app)
          .options('/api/conversations')
          .expect(200);
      });
    });
  });

  describe('Cookie Security', () => {
    it('should set CSRF cookie with correct security flags in production', async () => {
      // Mock production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app.app)
        .get('/api/csrf-token');

      const cookies = response.headers['set-cookie'];
      const csrfCookie = cookies?.find((cookie: string) => 
        cookie.startsWith('csrf-token=')
      );

      expect(csrfCookie).toContain('SameSite=lax');
      expect(csrfCookie).toContain('Secure');

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should not set Secure flag in development', async () => {
      // Ensure development environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const response = await request(app.app)
        .get('/api/csrf-token');

      const cookies = response.headers['set-cookie'];
      const csrfCookie = cookies?.find((cookie: string) => 
        cookie.startsWith('csrf-token=')
      );

      expect(csrfCookie).not.toContain('Secure');

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('CSRF Disabled', () => {
    it('should allow all requests when CSRF is disabled', async () => {
      // Mock CSRF disabled
      const originalEnv = process.env.CSRF_ENABLED;
      process.env.CSRF_ENABLED = 'false';

      await request(app.app)
        .post('/api/conversations')
        .send({ title: 'Test Conversation' })
        .expect(401); // Should fail auth, not CSRF

      // Restore environment
      process.env.CSRF_ENABLED = originalEnv;
    });
  });
});