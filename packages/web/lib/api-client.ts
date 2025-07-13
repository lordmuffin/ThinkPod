import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { getCSRFHeaders, clearCSRFToken } from './csrf';

interface ApiClientConfig {
  baseURL?: string;
  timeout?: number;
}

class ApiClient {
  private client: AxiosInstance;

  constructor(config: ApiClientConfig = {}) {
    this.client = axios.create({
      baseURL: config.baseURL || '/api',
      timeout: config.timeout || 10000,
      withCredentials: true, // Include cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor to add CSRF token
    this.client.interceptors.request.use(
      async (config) => {
        // Only add CSRF token for state-changing methods
        if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
          const csrfHeaders = await getCSRFHeaders();
          config.headers = {
            ...config.headers,
            ...csrfHeaders,
          };
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle CSRF errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 403 && 
            error.response?.data?.code === 'CSRF_TOKEN_INVALID') {
          // Clear invalid token and retry once
          clearCSRFToken();
          
          const originalRequest = error.config;
          if (!originalRequest._retried) {
            originalRequest._retried = true;
            
            // Get new CSRF token and retry
            const csrfHeaders = await getCSRFHeaders();
            originalRequest.headers = {
              ...originalRequest.headers,
              ...csrfHeaders,
            };
            
            return this.client(originalRequest);
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  // GET request
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  // POST request
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  // PUT request
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  // PATCH request
  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  // DELETE request
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  // Upload file with progress
  async uploadFile<T = any>(
    url: string, 
    file: File | FormData, 
    onProgress?: (progress: number) => void
  ): Promise<AxiosResponse<T>> {
    const formData = file instanceof FormData ? file : new FormData();
    if (file instanceof File) {
      formData.append('file', file);
    }

    return this.client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
  }

  // Set authorization header
  setAuthToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // Clear authorization header
  clearAuthToken(): void {
    delete this.client.defaults.headers.common['Authorization'];
  }

  // Get the underlying axios instance for advanced usage
  getInstance(): AxiosInstance {
    return this.client;
  }
}

// Create default instance
export const apiClient = new ApiClient();

// Export the class for creating custom instances
export { ApiClient };

// Convenience exports for common API calls
export const api = {
  get: apiClient.get.bind(apiClient),
  post: apiClient.post.bind(apiClient),
  put: apiClient.put.bind(apiClient),
  patch: apiClient.patch.bind(apiClient),
  delete: apiClient.delete.bind(apiClient),
  upload: apiClient.uploadFile.bind(apiClient),
  setAuth: apiClient.setAuthToken.bind(apiClient),
  clearAuth: apiClient.clearAuthToken.bind(apiClient),
};