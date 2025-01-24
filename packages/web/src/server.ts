import { Actor, PID, Props } from '@bactor/core';
import { Router } from './router';
import { HttpRequest, HttpResponse } from './types';
import { MiddlewareManager } from './middleware/manager';
import type { Server } from 'bun';

export interface HttpServerProps extends Props {
  port: number;
  hostname?: string;
}

export class HttpServer extends Actor {
  private server: Server | null = null;
  private router: Router;
  private middlewareManagerPid: PID;
  private config: { port: number; hostname: string };

  constructor(props: Props) {
    super(props);
    this.config = {
      port: (props as HttpServerProps).port || 3000,
      hostname: (props as HttpServerProps).hostname || 'localhost'
    };
    this.router = new Router(this.context);
    
    // Create middleware manager as a child actor
    this.middlewareManagerPid = this.context.spawn({
      actorClass: MiddlewareManager
    });
  }

  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'start') {
        await this.start();
      } else if (msg.type === 'stop') {
        await this.stop();
      } else if (msg.type === 'middleware.add') {
        await this.context.send(this.middlewareManagerPid, msg);
      }
    });
  }

  getRouter(): Router {
    return this.router;
  }

  private async start() {
    const { port, hostname } = this.config;

    this.server = Bun.serve({
      port,
      hostname,
      fetch: async (request: Request) => {
        console.log(`[Server] Received ${request.method} request to ${request.url}`);
        
        const httpRequest: HttpRequest = {
          method: request.method,
          url: new URL(request.url).pathname,
          headers: request.headers,
          body: request.body,
          state: new Map()
        };

        try {
          console.log('[Server] Processing middleware...');
          // Process middleware
          const middlewareResponse = await new Promise<HttpResponse | null>((resolve) => {
            const behaviorId = 'await_middleware';
            console.log('[Server] Adding await_middleware behavior');
            
            this.addBehavior(behaviorId, async (msg) => {
              console.log('[Server] Received message in await_middleware:', msg.type);
              if (msg.type === 'middleware.complete') {
                console.log('[Server] Middleware complete, payload:', msg.payload);
                this.become('default');
                resolve(msg.payload as HttpResponse | null);
              }
            });
            
            this.become(behaviorId);
            console.log('[Server] Sending middleware.process message');
            
            this.context.send(this.middlewareManagerPid, {
              type: 'middleware.process',
              payload: httpRequest,
              sender: this.context.self
            });
          });

          console.log('[Server] Middleware response:', middlewareResponse);

          // If middleware handled the request, return its response
          if (middlewareResponse) {
            console.log('[Server] Returning middleware response');
            return new Response(middlewareResponse.body, {
              status: middlewareResponse.status,
              headers: middlewareResponse.headers
            });
          }

          console.log('[Server] Processing route handler');
          // Process route handler
          const response = await this.router.handleRequest(httpRequest);
          
          // Add any CORS headers from middleware state
          if (response && response.headers) {
            const corsHeaders = httpRequest.state?.get('cors');
            if (corsHeaders) {
              Object.entries(corsHeaders).forEach(([key, value]) => {
                response.headers.set(key, value as string);
              });
            }
          }

          console.log('[Server] Returning route response:', response);
          return new Response(response.body, {
            status: response.status,
            headers: response.headers
          });
        } catch (error) {
          console.error('[Server] Error:', error);
          return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    });

    console.log(`Server running at http://${hostname}:${port}`);
  }

  private async stop() {
    if (this.server) {
      this.server.stop();
      this.server = null;
      console.log('Server stopped');
    }
  }
} 