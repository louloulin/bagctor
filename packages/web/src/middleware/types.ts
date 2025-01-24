import { Actor, Props, PID } from '@bactor/core';
import { HttpRequest, HttpResponse } from '../types';

export interface MiddlewareContext {
  request: HttpRequest;
  response?: HttpResponse;
  state: Map<string, any>;
}

export interface MiddlewareResult {
  context: MiddlewareContext;
  handled: boolean;
}

export interface MiddlewareProps extends Props {
  actorContext?: {
    name: string;
  };
}

export interface MiddlewareMessage {
  type: 'process';
  context: MiddlewareContext;
  sender?: PID;
}

export abstract class MiddlewareActor extends Actor {
  protected name: string;

  constructor(props: MiddlewareProps) {
    super(props);
    this.name = props.actorContext?.name || 'middleware';
  }

  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      console.log(`[${this.name}] Received message:`, msg.type, 'from:', msg.sender?.id);
      
      if (msg.type === 'process') {
        try {
          console.log(`[${this.name}] Processing request from:`, msg.sender?.id);
          console.log(`[${this.name}] Request:`, {
            method: (msg as MiddlewareMessage).context.request.method,
            url: (msg as MiddlewareMessage).context.request.url,
            headers: Object.fromEntries((msg as MiddlewareMessage).context.request.headers.entries()),
            state: Object.fromEntries((msg as MiddlewareMessage).context.state.entries())
          });
          
          const result = await this.process((msg as MiddlewareMessage).context);
          console.log(`[${this.name}] Processing complete`);
          console.log(`[${this.name}] Result:`, {
            handled: result.handled,
            response: result.context.response,
            state: Object.fromEntries(result.context.state.entries())
          });
          
          if (msg.sender) {
            console.log(`[${this.name}] Sending result back to:`, msg.sender.id);
            try {
              await this.context.send(msg.sender, {
                type: 'middleware.result',
                payload: result,
                sender: this.context.self
              });
              console.log(`[${this.name}] Result sent successfully`);
            } catch (error) {
              console.error(`[${this.name}] Error sending result:`, error);
              // Try to send error result
              await this.context.send(msg.sender, {
                type: 'middleware.result',
                payload: {
                  context: (msg as MiddlewareMessage).context,
                  handled: false
                },
                sender: this.context.self
              });
            }
          } else {
            console.log(`[${this.name}] Warning: No sender to return result to`);
          }
        } catch (error) {
          console.error(`[${this.name}] Error processing request:`, error);
          if (msg.sender) {
            try {
              await this.context.send(msg.sender, {
                type: 'middleware.result',
                payload: {
                  context: (msg as MiddlewareMessage).context,
                  handled: false
                },
                sender: this.context.self
              });
              console.log(`[${this.name}] Error result sent`);
            } catch (sendError) {
              console.error(`[${this.name}] Error sending error result:`, sendError);
            }
          }
        }
      } else {
        console.log(`[${this.name}] Ignoring unknown message type:`, msg.type);
      }
    });
  }

  protected abstract process(context: MiddlewareContext): Promise<MiddlewareResult>;
} 