import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { securityConfig, isCSRFExempt } from '../config/security';

// Simple double-submit cookie CSRF implementation
export const generateToken = (): string => {
  return crypto.randomBytes(securityConfig.csrf.tokenLength).toString('hex');
};

const setCSRFCookie = (res: Response, token: string): void => {
  res.cookie(securityConfig.csrf.cookieName, token, securityConfig.cookies.csrf);
};

const getCSRFToken = (req: Request): string | undefined => {
  return req.headers[securityConfig.csrf.headerName] as string || 
         req.body?._csrf || 
         req.query._csrf as string;
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (!securityConfig.csrf.enabled) {
    return next();
  }

  if (isCSRFExempt(req.path)) {
    return next();
  }

  // For safe methods, generate and set token
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const token = generateToken();
    setCSRFCookie(res, token);
    res.locals.csrfToken = token;
    return next();
  }

  // For unsafe methods, validate token
  const cookieToken = req.cookies[securityConfig.csrf.cookieName];
  const requestToken = getCSRFToken(req);

  if (!cookieToken || !requestToken || cookieToken !== requestToken) {
    return res.status(403).json({
      error: 'CSRF token validation failed',
      code: 'CSRF_TOKEN_INVALID'
    });
  }

  next();
};

export const getCsrfTokenEndpoint = (req: Request, res: Response) => {
  if (!securityConfig.csrf.enabled) {
    return res.json({ csrfToken: null });
  }

  const token = generateToken();
  setCSRFCookie(res, token);
  res.json({ csrfToken: token });
};