import { MiddlewareActor, MiddlewareContext, MiddlewareResult } from './types';

export class LoggerMiddleware extends MiddlewareActor {
  protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
    const { method, url } = context.request;
    console.log(`[${this.name}] ${method} ${url}`);
    return { context, handled: false };
  }
}

export class CorsMiddleware extends MiddlewareActor {
  protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
    if (context.request.method === 'OPTIONS') {
      context.response = {
        status: 204,
        headers: new Headers({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }),
        body: null
      };
      return { context, handled: true };
    }

    // Add CORS headers to all responses
    context.state.set('cors', {
      'Access-Control-Allow-Origin': '*'
    });
    
    return { context, handled: false };
  }
}

export class AuthMiddleware extends MiddlewareActor {
  protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
    const authHeader = context.request.headers.get('Authorization');
    
    if (!authHeader) {
      context.response = {
        status: 401,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Unauthorized' })
      };
      return { context, handled: true };
    }

    // Simple token validation (for demo)
    const token = authHeader.replace('Bearer ', '');
    if (token !== 'demo-token') {
      context.response = {
        status: 403,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Invalid token' })
      };
      return { context, handled: true };
    }

    // Add user info to context
    context.state.set('user', { id: 1, role: 'admin' });
    return { context, handled: false };
  }
} 