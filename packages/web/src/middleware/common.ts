import { MiddlewareActor, MiddlewareContext, MiddlewareResult } from './types';

export class LoggerMiddleware extends MiddlewareActor {
  protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
    const { method, url } = context.request;
    console.log(`[LoggerMiddleware] Processing ${method} ${url}`);
    console.log(`[LoggerMiddleware] Headers:`, Object.fromEntries(context.request.headers.entries()));
    console.log(`[LoggerMiddleware] State:`, Object.fromEntries(context.state.entries()));
    return { context, handled: false };
  }
}

export class CorsMiddleware extends MiddlewareActor {
  protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
    console.log(`[CorsMiddleware] Processing request method: ${context.request.method}`);
    if (context.request.method === 'OPTIONS') {
      console.log('[CorsMiddleware] Handling OPTIONS request');
      context.response = {
        status: 204,
        headers: new Headers({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }),
        body: null
      };
      console.log('[CorsMiddleware] Set CORS headers for OPTIONS:', Object.fromEntries(context.response.headers.entries()));
      return { context, handled: true };
    }

    // Add CORS headers to all responses
    console.log('[CorsMiddleware] Adding CORS headers to state');
    context.state.set('cors', {
      'Access-Control-Allow-Origin': '*'
    });
    console.log('[CorsMiddleware] Updated state:', Object.fromEntries(context.state.entries()));
    
    return { context, handled: false };
  }
}

export class AuthMiddleware extends MiddlewareActor {
  protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
    console.log('[AuthMiddleware] Processing request');
    const authHeader = context.request.headers.get('Authorization');
    console.log('[AuthMiddleware] Authorization header:', authHeader);
    
    if (!authHeader) {
      console.log('[AuthMiddleware] No authorization header, returning 401');
      context.response = {
        status: 401,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Unauthorized' })
      };
      return { context, handled: true };
    }

    // Simple token validation (for demo)
    const token = authHeader.replace('Bearer ', '');
    console.log('[AuthMiddleware] Token:', token);
    if (token !== 'demo-token') {
      console.log('[AuthMiddleware] Invalid token, returning 403');
      context.response = {
        status: 403,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Invalid token' })
      };
      return { context, handled: true };
    }

    // Add user info to context
    console.log('[AuthMiddleware] Valid token, adding user info to state');
    context.state.set('user', { id: 1, role: 'admin' });
    console.log('[AuthMiddleware] Updated state:', Object.fromEntries(context.state.entries()));
    return { context, handled: false };
  }
} 