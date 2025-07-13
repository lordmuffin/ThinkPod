import { CookieOptions, Response } from 'express';
import { securityConfig } from '../config/security';

export interface SecureCookieConfig {
  name: string;
  value: string;
  options?: Partial<CookieOptions>;
}

export const setSecureCookie = (
  res: Response, 
  name: string, 
  value: string, 
  options: Partial<CookieOptions> = {}
): void => {
  const defaultOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    domain: process.env.COOKIE_DOMAIN,
  };

  const finalOptions = { ...defaultOptions, ...options };
  res.cookie(name, value, finalOptions);
};

export const setAuthCookie = (res: Response, token: string): void => {
  setSecureCookie(res, 'auth-token', token, {
    ...securityConfig.cookies.auth,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
};

export const setRefreshCookie = (res: Response, token: string): void => {
  setSecureCookie(res, 'refresh-token', token, {
    ...securityConfig.cookies.auth,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh', // Restrict to refresh endpoint
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie('auth-token', { path: '/' });
  res.clearCookie('refresh-token', { path: '/api/auth/refresh' });
  res.clearCookie(securityConfig.csrf.cookieName, { path: '/' });
};

export const getCookieValue = (cookies: Record<string, string>, name: string): string | undefined => {
  return cookies[name];
};