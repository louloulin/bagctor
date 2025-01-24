import { Actor, PID, Props, Message } from '@bactor/core';
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
  private middlewareManagerPid!: PID;
  private config: { port: number; hostname: string };
  private middlewareResolver: ((value: HttpResponse | null) => void) | null = null;

  constructor(props: Props) {
    super(props);
    this.config = {
      port: (props as HttpServerProps).port || 3000,
      hostname: (props as HttpServerProps).hostname || 'localhost'
    };
    this.router = new Router(this.context);
  }

  public async preStart(): Promise<void> {
    // Create middleware manager as a child actor
    console.log('[Server] Creating middleware manager');
    this.middlewareManagerPid = await this.context.spawn({
      actorClass: MiddlewareManager
    });
    console.log('[Server] Middleware manager created with ID:', this.middlewareManagerPid.id);
  }

  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      console.log('[Server] Received message in default behavior:', msg.type);
      if (msg.type === 'start') {
        await this.start();
      } else if (msg.type === 'stop') {
        await this.stop();
      } else if (msg.type === 'middleware.add') {
        console.log('[Server] Forwarding middleware.add to manager:', this.middlewareManagerPid.id);
        await this.context.send(this.middlewareManagerPid, {
          type: msg.type,
          payload: msg.payload,
          sender: this.context.self
        });
      } else if (msg.type === 'middleware.complete') {
        console.log('[Server] Warning: Received middleware.complete in default behavior');
      }
    });

    this.addBehavior('await_middleware', async (msg: Message) => {
      console.log('[Server] Received message in await_middleware:', msg.type, 'from:', msg.sender?.id);
      if (msg.type === 'middleware.complete' && this.middlewareResolver) {
        console.log('[Server] Middleware complete, payload:', msg.payload);
        const resolver = this.middlewareResolver;
        this.middlewareResolver = null;
        this.become('default');
        resolver(msg.payload as HttpResponse | null);
      } else {
        console.log('[Server] Unexpected message in await_middleware:', msg.type);
        console.log('[Server] Has resolver:', !!this.middlewareResolver);
      }
    });
  }

  getRouter(): Router {
    return this.router;
  }

  private async processMiddleware(httpRequest: HttpRequest): Promise<HttpResponse | null> {
    return new Promise<HttpResponse | null>((resolve, reject) => {
      let isResolved = false;
      const timeoutId = setTimeout(() => {
        console.log('[Server] Middleware timeout triggered');
        console.log('[Server] Current resolver:', !!this.middlewareResolver);
        if (this.middlewareResolver && !isResolved) {
          console.log('[Server] Handling timeout, switching back to default behavior');
          const resolver = this.middlewareResolver;
          this.middlewareResolver = null;
          this.become('default');
          isResolved = true;
          resolver({
            status: 504,
            headers: new Headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ error: 'Gateway Timeout' })
          });
        }
      }, 5000);

      this.middlewareResolver = (response: HttpResponse | null) => {
        console.log('[Server] Middleware resolver called');
        console.log('[Server] Response:', response);
        if (!isResolved) {
          clearTimeout(timeoutId);
          isResolved = true;
          resolve(response);
        } else {
          console.log('[Server] Warning: Resolver called after timeout');
        }
      };

      console.log('[Server] Setting up middleware processing');
      this.become('await_middleware');
      
      console.log('[Server] Sending middleware.process message to:', this.middlewareManagerPid.id);
      this.context.send(this.middlewareManagerPid, {
        type: 'middleware.process',
        payload: httpRequest,
        sender: this.context.self
      }).then(() => {
        console.log('[Server] Middleware process message sent successfully');
      }).catch((error: Error) => {
        console.error('[Server] Error sending middleware process message:', error);
        if (!isResolved) {
          clearTimeout(timeoutId);
          isResolved = true;
          reject(error);
        }
      });
    });
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
          const middlewareResponse = await this.processMiddleware(httpRequest);

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