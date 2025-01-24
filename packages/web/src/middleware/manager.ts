import { Actor, PID, Props } from '@bactor/core';
import { HttpRequest, HttpResponse } from '../types';
import { MiddlewareContext, MiddlewareResult } from './types';

export class MiddlewareManager extends Actor {
  private middlewares: PID[] = [];
  private currentContext: MiddlewareContext | null = null;
  private currentMiddlewareIndex: number = 0;
  private originalSender: PID | undefined;

  constructor(props: Props) {
    super(props);
  }

  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'middleware.add') {
        console.log('[MiddlewareManager] Adding middleware:', msg.payload);
        this.middlewares.push(msg.payload as PID);
      } else if (msg.type === 'middleware.process') {
        console.log('[MiddlewareManager] Processing middleware chain');
        // Start middleware chain
        this.currentContext = {
          request: msg.payload as HttpRequest,
          state: new Map()
        };
        this.currentMiddlewareIndex = 0;
        this.originalSender = msg.sender;
        
        if (this.middlewares.length > 0) {
          console.log('[MiddlewareManager] Starting middleware chain with', this.middlewares.length, 'middlewares');
          await this.processNextMiddleware();
        } else {
          console.log('[MiddlewareManager] No middlewares registered, completing chain');
          // No middleware, send null response
          if (this.originalSender) {
            await this.context.send(this.originalSender, {
              type: 'middleware.complete',
              payload: null
            });
          }
          this.resetState();
        }
      } else if (msg.type === 'middleware.result') {
        console.log('[MiddlewareManager] Received middleware result');
        const result = msg.payload as MiddlewareResult;
        
        if (!this.currentContext) {
          console.log('[MiddlewareManager] No current context, ignoring result');
          return;
        }

        // Update context with middleware result
        this.currentContext.response = result.context.response;
        this.currentContext.state = result.context.state;

        // If middleware handled the request or we're done, send response
        if (result.handled || this.currentMiddlewareIndex >= this.middlewares.length) {
          console.log('[MiddlewareManager] Chain complete, handled:', result.handled);
          if (this.originalSender) {
            await this.context.send(this.originalSender, {
              type: 'middleware.complete',
              payload: result.handled ? this.currentContext.response : null
            });
          }
          this.resetState();
        } else {
          console.log('[MiddlewareManager] Processing next middleware');
          // Process next middleware
          await this.processNextMiddleware();
        }
      }
    });
  }

  private async processNextMiddleware(): Promise<void> {
    if (!this.currentContext || this.currentMiddlewareIndex >= this.middlewares.length) {
      console.log('[MiddlewareManager] No more middlewares to process');
      // Ensure we complete the chain if we somehow get here
      if (this.originalSender && this.currentContext) {
        await this.context.send(this.originalSender, {
          type: 'middleware.complete',
          payload: this.currentContext.response || null
        });
      }
      this.resetState();
      return;
    }

    const middleware = this.middlewares[this.currentMiddlewareIndex++];
    console.log('[MiddlewareManager] Processing middleware at index:', this.currentMiddlewareIndex - 1);
    await this.context.send(middleware, {
      type: 'process',
      context: this.currentContext,
      sender: this.context.self
    });
  }

  private resetState(): void {
    console.log('[MiddlewareManager] Resetting state');
    this.currentContext = null;
    this.currentMiddlewareIndex = 0;
    this.originalSender = undefined;
  }
} 