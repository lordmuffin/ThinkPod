import { CookieOptions } from 'express';

export interface SecurityConfig {
  csrf: {
    enabled: boolean;
    cookieName: string;
    headerName: string;
    exemptPaths: string[];
    tokenLength: number;
  };
  cookies: {
    auth: CookieOptions;
    csrf: CookieOptions;
  };
}

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

export const securityConfig: SecurityConfig = {
  csrf: {
    enabled: process.env.CSRF_ENABLED !== 'false',
    cookieName: 'csrf-token',
    headerName: 'x-csrf-token',
    exemptPaths: [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
      '/api/auth/forgot-password',
      '/api/health',
      '/api/webhooks',
    ],
    tokenLength: 32,
  },
  cookies: {
    auth: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
      domain: process.env.COOKIE_DOMAIN,
    },
    csrf: {
      httpOnly: false, // Must be readable by JavaScript
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
      domain: process.env.COOKIE_DOMAIN,
    },
  },
};

export const isCSRFExempt = (path: string): boolean => {
  return securityConfig.csrf.exemptPaths.some(exemptPath => 
    path.startsWith(exemptPath)
  );
};