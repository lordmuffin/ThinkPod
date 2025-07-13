import { useState, useEffect } from 'react';
import { getCookie, setCookie } from 'cookies-next';

const CSRF_TOKEN_KEY = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export interface CSRFTokenResponse {
  csrfToken: string | null;
}

let csrfToken: string | null = null;

/**
 * Get CSRF token from cookie or fetch from server
 */
export const getCSRFToken = async (): Promise<string | null> => {
  // Check if we have a cached token
  if (csrfToken) {
    return csrfToken;
  }

  // Check cookie first
  const cookieToken = getCookie(CSRF_TOKEN_KEY) as string;
  if (cookieToken) {
    csrfToken = cookieToken;
    return csrfToken;
  }

  // Fetch from server
  try {
    const response = await fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include',
    });

    if (response.ok) {
      const data: CSRFTokenResponse = await response.json();
      csrfToken = data.csrfToken;
      
      // Store in cookie for future use
      if (csrfToken) {
        setCookie(CSRF_TOKEN_KEY, csrfToken, {
          maxAge: 24 * 60 * 60, // 24 hours
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });
      }
      
      return csrfToken;
    }
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
  }

  return null;
};

/**
 * Get CSRF headers for requests
 */
export const getCSRFHeaders = async (): Promise<Record<string, string>> => {
  const token = await getCSRFToken();
  
  if (!token) {
    return {};
  }

  return {
    [CSRF_HEADER_NAME]: token,
  };
};

/**
 * Clear cached CSRF token (e.g., on logout)
 */
export const clearCSRFToken = (): void => {
  csrfToken = null;
  setCookie(CSRF_TOKEN_KEY, '', { maxAge: -1 });
};

/**
 * Validate CSRF token format
 */
export const isValidCSRFToken = (token: string): boolean => {
  return typeof token === 'string' && token.length === 64; // 32 bytes hex = 64 chars
};

/**
 * React hook to get CSRF token
 */
export const useCSRFToken = () => {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCSRFToken().then((fetchedToken) => {
      setToken(fetchedToken);
      setLoading(false);
    });
  }, []);

  const refreshToken = async () => {
    setLoading(true);
    clearCSRFToken();
    const newToken = await getCSRFToken();
    setToken(newToken);
    setLoading(false);
    return newToken;
  };

  return { token, loading, refreshToken };
};

