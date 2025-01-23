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
    const url = new URL(request.url);
    const path = url.pathname;

    for (const route of this.routes) {
      if (route.method !== request.method) {
        continue;
      }

      const params = this.matchRoute(path, route.pattern);
      if (params === null) {
        continue;
      }

      const context: HttpContext = {
        ...this.context,
        request,
        params,
        query: url.searchParams,
        state: new Map()
      };

      try {
        return await route.handler(context);
      } catch (error) {
        return {
          status: 500,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ error: 'Internal Server Error' })
        };
      }
    }

    return {
      status: 404,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Not Found' })
    };
  }
} 