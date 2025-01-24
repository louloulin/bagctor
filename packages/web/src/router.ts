import { Actor, Props } from '@bactor/core';
import { HttpContext, HttpHandler, HttpRequest, HttpResponse, Route, RouteParams } from './types';

export class Router extends Actor {
  private routes: Route[] = [];

  constructor(props: Props) {
    super(props);
  }

  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'http.request') {
        const request = msg.payload as HttpRequest;
        const response = await this.handleRequest(request);
        if (msg.sender) {
          await this.context.send(msg.sender, {
            type: 'http.response',
            payload: response
          });
        }
      }
    });
  }

  get(pattern: string, handler: HttpHandler) {
    this.routes.push({ pattern, method: 'GET', handler });
    return this;
  }

  post(pattern: string, handler: HttpHandler) {
    this.routes.push({ pattern, method: 'POST', handler });
    return this;
  }

  put(pattern: string, handler: HttpHandler) {
    this.routes.push({ pattern, method: 'PUT', handler });
    return this;
  }

  delete(pattern: string, handler: HttpHandler) {
    this.routes.push({ pattern, method: 'DELETE', handler });
    return this;
  }

  private matchRoute(path: string, pattern: string): RouteParams | null {
    const pathParts = path.split('/').filter(Boolean);
    const patternParts = pattern.split('/').filter(Boolean);

    if (pathParts.length !== patternParts.length) {
      return null;
    }

    const params: RouteParams = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(':')) {
        params[patternPart.slice(1)] = pathPart;
      } else if (patternPart !== pathPart) {
        return null;
      }
    }

    return params;
  }

  async handleRequest(request: HttpRequest): Promise<HttpResponse> {
    console.log('[Router] Handling request:', request.method, request.url);
    const path = request.url;
    const searchParams = new URLSearchParams();

    for (const route of this.routes) {
      if (route.method !== request.method) {
        continue;
      }

      const params = this.matchRoute(path, route.pattern);
      if (params === null) {
        continue;
      }

      console.log('[Router] Found matching route:', route.pattern);
      const context: HttpContext = {
        ...this.context,
        request,
        params,
        query: searchParams,
        state: request.state
      };

      try {
        const response = await route.handler(context);
        console.log('[Router] Route handler response:', response);
        return response;
      } catch (error) {
        console.error('[Router] Error in route handler:', error);
        return {
          status: 500,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ error: 'Internal Server Error' })
        };
      }
    }

    console.log('[Router] No matching route found');
    return {
      status: 404,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Not Found' })
    };
  }
} 