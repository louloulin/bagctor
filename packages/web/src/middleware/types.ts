import { Actor, Props } from '@bactor/core';
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
}

export abstract class MiddlewareActor extends Actor {
  protected name: string;

  constructor(props: MiddlewareProps) {
    super(props);
    this.name = props.actorContext?.name || 'middleware';
  }

  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'process') {
        console.log(`[${this.name}] Processing request`);
        const result = await this.process((msg as MiddlewareMessage).context);
        console.log(`[${this.name}] Processing complete, handled:`, result.handled);
        if (msg.sender) {
          console.log(`[${this.name}] Sending result back to sender`);
          await this.context.send(msg.sender, {
            type: 'middleware.result',
            payload: result
          });
        } else {
          console.log(`[${this.name}] Warning: No sender to return result to`);
        }
      }
    });
  }

  protected abstract process(context: MiddlewareContext): Promise<MiddlewareResult>;
} 