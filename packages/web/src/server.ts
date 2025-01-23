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
        const httpRequest: HttpRequest = {
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body
        };

        try {
          // Process middleware
          await this.context.send(this.middlewareManagerPid, {
            type: 'middleware.process',
            payload: httpRequest,
            sender: this.context.self
          });

          // Wait for middleware result
          const middlewareResponse = await new Promise<HttpResponse | null>((resolve) => {
            this.addBehavior('await_middleware', async (msg) => {
              if (msg.type === 'middleware.complete') {
                this.become('default');
                resolve(msg.payload as HttpResponse | null);
              }
            });
            this.become('await_middleware');
          });

          // If middleware handled the request, return its response
          if (middlewareResponse) {
            return new Response(middlewareResponse.body, {
              status: middlewareResponse.status,
              headers: middlewareResponse.headers
            });
          }

          // Process route handler
          const response: HttpResponse = await this.router.handleRequest(httpRequest);
          return new Response(response.body, {
            status: response.status,
            headers: response.headers
          });
        } catch (error) {
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