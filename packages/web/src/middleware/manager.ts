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
    console.log('[MiddlewareManager] Initializing with props:', props);
    console.log('[MiddlewareManager] Actor context:', this.context?.self?.id);
  }

  protected behaviors(): void {
    console.log('[MiddlewareManager] Setting up behaviors');
    this.addBehavior('default', async (msg) => {
      console.log('[MiddlewareManager] Received message in default behavior');
      console.log('[MiddlewareManager] Message type:', msg.type);
      console.log('[MiddlewareManager] Message sender:', msg.sender?.id);
      console.log('[MiddlewareManager] Current state:', {
        middlewareCount: this.middlewares.length,
        middlewareIds: this.middlewares.map(m => m.id),
        hasCurrentContext: !!this.currentContext,
        currentIndex: this.currentMiddlewareIndex,
        originalSender: this.originalSender?.id
      });
      
      if (msg.type === 'middleware.add') {
        console.log('[MiddlewareManager] Adding middleware:', msg.payload);
        this.middlewares.push(msg.payload as PID);
        console.log('[MiddlewareManager] Current middleware chain:', this.middlewares.map(m => m.id));
      } else if (msg.type === 'middleware.process') {
        console.log('[MiddlewareManager] Processing middleware chain');
        console.log('[MiddlewareManager] Request sender:', msg.sender?.id);
        console.log('[MiddlewareManager] Request method:', (msg.payload as HttpRequest).method);
        console.log('[MiddlewareManager] Request URL:', (msg.payload as HttpRequest).url);
        console.log('[MiddlewareManager] Request headers:', Object.fromEntries((msg.payload as HttpRequest).headers.entries()));
        
        // Start middleware chain
        this.currentContext = {
          request: msg.payload as HttpRequest,
          state: new Map()
        };
        this.currentMiddlewareIndex = 0;
        this.originalSender = msg.sender;
        
        if (this.middlewares.length > 0) {
          console.log('[MiddlewareManager] Starting middleware chain with', this.middlewares.length, 'middlewares');
          console.log('[MiddlewareManager] Middleware chain:', this.middlewares.map(m => m.id));
          try {
            console.log('[MiddlewareManager] Attempting to process first middleware');
            await this.processNextMiddleware();
            console.log('[MiddlewareManager] First middleware processed successfully');
          } catch (error) {
            console.error('[MiddlewareManager] Error processing middleware:', error);
            if (this.originalSender) {
              console.log('[MiddlewareManager] Sending error response to:', this.originalSender.id);
              await this.context.send(this.originalSender, {
                type: 'middleware.complete',
                payload: null,
                sender: this.context.self
              });
            }
            this.resetState();
          }
        } else {
          console.log('[MiddlewareManager] No middlewares registered, completing chain');
          // No middleware, send null response
          if (this.originalSender) {
            console.log('[MiddlewareManager] Sending null response to:', this.originalSender.id);
            await this.context.send(this.originalSender, {
              type: 'middleware.complete',
              payload: null,
              sender: this.context.self
            });
          }
          this.resetState();
        }
      } else if (msg.type === 'middleware.result') {
        console.log('[MiddlewareManager] Received middleware result');
        console.log('[MiddlewareManager] Result from:', msg.sender?.id);
        const result = msg.payload as MiddlewareResult;
        console.log('[MiddlewareManager] Result handled:', result.handled);
        console.log('[MiddlewareManager] Result response:', result.context.response);
        console.log('[MiddlewareManager] Result state:', Object.fromEntries(result.context.state.entries()));
        
        if (!this.currentContext) {
          console.log('[MiddlewareManager] No current context, ignoring result');
          return;
        }

        // Update context with middleware result
        this.currentContext.response = result.context.response;
        this.currentContext.state = result.context.state;

        // If middleware handled the request or we're done, send response
        if (result.handled || this.currentMiddlewareIndex >= this.middlewares.length) {
          console.log('[MiddlewareManager] Chain complete');
          console.log('[MiddlewareManager] Handled:', result.handled);
          console.log('[MiddlewareManager] Current index:', this.currentMiddlewareIndex);
          console.log('[MiddlewareManager] Chain length:', this.middlewares.length);
          
          if (this.originalSender) {
            console.log('[MiddlewareManager] Sending complete to:', this.originalSender.id);
            console.log('[MiddlewareManager] Response:', this.currentContext.response);
            try {
              await this.context.send(this.originalSender, {
                type: 'middleware.complete',
                payload: result.handled ? this.currentContext.response : null,
                sender: this.context.self
              });
              console.log('[MiddlewareManager] Complete message sent successfully');
            } catch (error) {
              console.error('[MiddlewareManager] Error sending complete:', error);
            }
          }
          this.resetState();
        } else {
          console.log('[MiddlewareManager] Processing next middleware');
          console.log('[MiddlewareManager] Current index:', this.currentMiddlewareIndex);
          try {
            await this.processNextMiddleware();
            console.log('[MiddlewareManager] Next middleware processed successfully');
          } catch (error) {
            console.error('[MiddlewareManager] Error processing next middleware:', error);
            if (this.originalSender) {
              await this.context.send(this.originalSender, {
                type: 'middleware.complete',
                payload: null,
                sender: this.context.self
              });
            }
            this.resetState();
          }
        }
      } else {
        console.log('[MiddlewareManager] Received unknown message type:', msg.type);
      }
    });
  }

  private async processNextMiddleware(): Promise<void> {
    if (!this.currentContext || this.currentMiddlewareIndex >= this.middlewares.length) {
      console.log('[MiddlewareManager] No more middlewares to process');
      console.log('[MiddlewareManager] Current index:', this.currentMiddlewareIndex);
      console.log('[MiddlewareManager] Chain length:', this.middlewares.length);
      // Ensure we complete the chain if we somehow get here
      if (this.originalSender && this.currentContext) {
        console.log('[MiddlewareManager] Sending final complete to:', this.originalSender.id);
        console.log('[MiddlewareManager] Final response:', this.currentContext.response);
        try {
          await this.context.send(this.originalSender, {
            type: 'middleware.complete',
            payload: this.currentContext.response || null,
            sender: this.context.self
          });
          console.log('[MiddlewareManager] Final complete sent successfully');
        } catch (error) {
          console.error('[MiddlewareManager] Error sending final complete:', error);
        }
      }
      this.resetState();
      return;
    }

    const middleware = this.middlewares[this.currentMiddlewareIndex++];
    console.log('[MiddlewareManager] Processing middleware');
    console.log('[MiddlewareManager] Index:', this.currentMiddlewareIndex - 1);
    console.log('[MiddlewareManager] Middleware ID:', middleware.id);
    try {
      console.log('[MiddlewareManager] Sending process message to middleware');
      await this.context.send(middleware, {
        type: 'process',
        context: this.currentContext,
        sender: this.context.self
      });
      console.log('[MiddlewareManager] Process message sent successfully');
    } catch (error) {
      console.error('[MiddlewareManager] Error sending to middleware:', error);
      throw error;
    }
  }

  private resetState(): void {
    console.log('[MiddlewareManager] Resetting state');
    console.log('[MiddlewareManager] Previous context:', this.currentContext);
    console.log('[MiddlewareManager] Previous index:', this.currentMiddlewareIndex);
    console.log('[MiddlewareManager] Previous sender:', this.originalSender?.id);
    this.currentContext = null;
    this.currentMiddlewareIndex = 0;
    this.originalSender = undefined;
  }
} 