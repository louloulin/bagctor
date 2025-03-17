import { ActorContext } from '@bactor/core';

/**
 * HTTP request object
 */
export interface HttpRequest {
  method: string;
  url: string;
  headers: Headers;
  body: ReadableStream | null;
  state: Map<string, any>;
}

/**
 * HTTP response object
 */
export interface HttpResponse {
  status: number;
  headers: Headers;
  body: any;
  statusCode?: number; // Added for compatibility with node http response
  setHeader?: (name: string, value: string) => void; // Added for compatibility with node http response
  end?: (data?: any) => void; // Added for compatibility with node http response
}

/**
 * Route parameters
 */
export interface RouteParams {
  [key: string]: string | undefined;
}

/**
 * HTTP context with request information, parameters, and actor context
 */
export interface HttpContext {
  request: HttpRequest;
  params: RouteParams;
  query: URLSearchParams;
  state: Map<string, any>;
  actorContext: ActorContext;
}

/**
 * HTTP handler function type
 */
export type HttpHandler = (context: HttpContext) => Promise<HttpResponse> | HttpResponse;

/**
 * Handler function for processing HTTP requests
 */
export type HandlerFunction = (req: HttpRequest, params: RouteParams) => Promise<HttpResponse> | HttpResponse;

/**
 * Middleware function for HTTP request/response processing
 */
export type MiddlewareFunction = (req: HttpRequest, res: HttpResponse, next: () => Promise<void>) => Promise<void>;

/**
 * Server configuration options
 */
export interface ServerOptions {
  /**
   * Server port
   */
  port?: number;

  /**
   * Server hostname
   */
  hostname?: string;

  /**
   * TLS configuration for HTTPS
   */
  tls?: {
    cert: string;
    key: string;
  };

  /**
   * Debug mode flag
   */
  debug?: boolean;
}

/**
 * Route definition
 */
export interface Route {
  method: string;
  pattern: string;
  handler: HttpHandler;
}

/**
 * HTTP status codes with descriptive names
 */
export enum HttpStatus {
  // 2xx - Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,

  // 3xx - Redirection
  MOVED_PERMANENTLY = 301,
  FOUND = 302,
  SEE_OTHER = 303,
  NOT_MODIFIED = 304,
  TEMPORARY_REDIRECT = 307,
  PERMANENT_REDIRECT = 308,

  // 4xx - Client errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  NOT_ACCEPTABLE = 406,
  REQUEST_TIMEOUT = 408,
  CONFLICT = 409,
  GONE = 410,
  PRECONDITION_FAILED = 412,
  PAYLOAD_TOO_LARGE = 413,
  UNSUPPORTED_MEDIA_TYPE = 415,
  RANGE_NOT_SATISFIABLE = 416,
  EXPECTATION_FAILED = 417,
  TOO_MANY_REQUESTS = 429,

  // 5xx - Server errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
  HTTP_VERSION_NOT_SUPPORTED = 505
}

/**
 * Helper functions for common HTTP responses
 */
export const HttpResponses = {
  /**
   * Create a JSON response
   * @param data Data to send as JSON
   * @param status HTTP status code
   * @param headers Additional headers
   * @returns HTTP response
   */
  json: (data: any, status: number = HttpStatus.OK, headers: Record<string, string> = {}): HttpResponse => {
    return {
      status,
      headers: new Headers({
        'Content-Type': 'application/json',
        ...headers
      }),
      body: JSON.stringify(data)
    };
  },

  /**
   * Create a text response
   * @param text Text to send
   * @param status HTTP status code
   * @param headers Additional headers
   * @returns HTTP response
   */
  text: (text: string, status: number = HttpStatus.OK, headers: Record<string, string> = {}): HttpResponse => {
    return {
      status,
      headers: new Headers({
        'Content-Type': 'text/plain',
        ...headers
      }),
      body: text
    };
  },

  /**
   * Create an HTML response
   * @param html HTML to send
   * @param status HTTP status code
   * @param headers Additional headers
   * @returns HTTP response
   */
  html: (html: string, status: number = HttpStatus.OK, headers: Record<string, string> = {}): HttpResponse => {
    return {
      status,
      headers: new Headers({
        'Content-Type': 'text/html',
        ...headers
      }),
      body: html
    };
  },

  /**
   * Create a no content response
   * @param headers Additional headers
   * @returns HTTP response
   */
  noContent: (headers: Record<string, string> = {}): HttpResponse => {
    return {
      status: HttpStatus.NO_CONTENT,
      headers: new Headers(headers),
      body: null
    };
  },

  /**
   * Create a redirect response
   * @param location URL to redirect to
   * @param status HTTP status code
   * @param headers Additional headers
   * @returns HTTP response
   */
  redirect: (location: string, status: number = HttpStatus.FOUND, headers: Record<string, string> = {}): HttpResponse => {
    return {
      status,
      headers: new Headers({
        'Location': location,
        ...headers
      }),
      body: null
    };
  },

  /**
   * Create an error response
   * @param message Error message
   * @param status HTTP status code
   * @param headers Additional headers
   * @returns HTTP response
   */
  error: (message: string, status: number = HttpStatus.INTERNAL_SERVER_ERROR, headers: Record<string, string> = {}): HttpResponse => {
    return {
      status,
      headers: new Headers({
        'Content-Type': 'application/json',
        ...headers
      }),
      body: JSON.stringify({ error: message })
    };
  }
}; 