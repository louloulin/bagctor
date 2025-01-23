import { Actor, PID, Props } from '@bactor/core';
import { HttpRequest, HttpResponse } from '../types';
import { MiddlewareContext, MiddlewareResult } from './types';

export class MiddlewareManager extends Actor {
  private middlewares: PID[] = [];
  private currentContext: MiddlewareContext | null = null;
  private currentMiddlewareIndex: number = 0;

  constructor(props: Props) {
    super(props);
  }

  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'middleware.add') {
        this.middlewares.push(msg.payload as PID);
      } else if (msg.type === 'middleware.process') {
        // Start middleware chain
        this.currentContext = {
          request: msg.payload as HttpRequest,
          state: new Map()
        };
        this.currentMiddlewareIndex = 0;
        
        if (this.middlewares.length > 0) {
          await this.processNextMiddleware(msg.sender);
        } else {
          // No middleware, send null response
          if (msg.sender) {
            await this.context.send(msg.sender, {
              type: 'middleware.complete',
              payload: null
            });
          }
        }
      } else if (msg.type === 'middleware.result') {
        const result = msg.payload as MiddlewareResult;
        
        if (!this.currentContext) {
          return;
        }

        // Update context with middleware result
        this.currentContext.response = result.context.response;
        this.currentContext.state = result.context.state;

        // If middleware handled the request or we're done, send response
        if (result.handled || this.currentMiddlewareIndex >= this.middlewares.length) {
          if (msg.sender) {
            await this.context.send(msg.sender, {
              type: 'middleware.complete',
              payload: result.handled ? this.currentContext.response : null
            });
          }
          this.currentContext = null;
          this.currentMiddlewareIndex = 0;
        } else {
          // Process next middleware
          await this.processNextMiddleware(msg.sender);
        }
      }
    });
  }

  private async processNextMiddleware(sender: PID | undefined): Promise<void> {
    if (!this.currentContext || this.currentMiddlewareIndex >= this.middlewares.length) {
      return;
    }

    const middleware = this.middlewares[this.currentMiddlewareIndex++];
    await this.context.send(middleware, {
      type: 'process',
      context: this.currentContext,
      sender: this.context.self
    });
  }
} 