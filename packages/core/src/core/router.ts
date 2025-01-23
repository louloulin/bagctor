import { Message, PID } from './types';
import { ActorSystem } from './system';
import { Actor } from './actor';
import { log } from '../utils/logger';

// Router interface
export interface IRouter {
  route(message: Message, routees: PID[]): Promise<void>;
}

// Base router configuration
export interface RouterConfig {
  poolSize?: number;
  routees?: PID[];
  system: ActorSystem;
}

// Router types
export type RouterType = 'round-robin' | 'random' | 'broadcast' | 'consistent-hash';

// Router messages
export interface RouterManagementMessage extends Message {
  type: 'router.add-routee' | 'router.remove-routee' | 'router.get-routees';
  routee?: PID;
}

// Base Router Actor
export abstract class RouterActor extends Actor {
  protected routees: PID[] = [];
  protected router: IRouter;
  private routingInProgress: boolean = false;
  private messageQueue: Message[] = [];

  constructor(config: RouterConfig) {
    const routerId = `router_${Math.random().toString(36).substring(7)}`;
    const context = {
      self: { id: routerId },
      system: config.system,
      send: async (target: PID, message: Message) => {
        await config.system.send(target, message);
      },
      spawn: async (props: any) => {
        return await config.system.spawn(props);
      }
    };
    super(context);
    this.routees = config.routees || [];
    this.router = this.createRouter(config.system);
    log.debug(`[RouterActor ${routerId}] Created with ${this.routees.length} routees:`, this.routees.map(r => r.id));
  }

  protected abstract createRouter(system: ActorSystem): IRouter;

  protected behaviors(): void {
    this.addBehavior('default', async (message: Message) => {
      log.debug(`[RouterActor] Received message for routing:`, message);
      
      if (this.isRouterManagementMessage(message)) {
        log.debug(`[RouterActor] Processing management message:`, message.type);
        await this.handleRouterManagement(message as RouterManagementMessage);
        return;
      }

      if (this.routees.length === 0) {
        log.debug(`[RouterActor] No routees available, message will be dropped:`, message);
        return;
      }

      log.debug(`[RouterActor] Adding message to queue, current queue size: ${this.messageQueue.length}`);
      this.messageQueue.push(message);
      await this.processMessageQueue();
    });
  }

  private async processMessageQueue(): Promise<void> {
    if (this.routingInProgress || this.messageQueue.length === 0) {
      log.debug(`[RouterActor] Queue processing skipped - inProgress: ${this.routingInProgress}, queueSize: ${this.messageQueue.length}`);
      return;
    }

    log.debug(`[RouterActor] Starting to process message queue of size: ${this.messageQueue.length}`);
    this.routingInProgress = true;
    const startTime = Date.now();
    
    try {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift()!;
        log.debug(`[RouterActor] Routing message:`, message);
        await this.router.route(message, [...this.routees]);
      }
    } finally {
      this.routingInProgress = false;
      const duration = Date.now() - startTime;
      log.debug(`[RouterActor] Finished processing message queue in ${duration}ms`);
    }
  }

  private isRouterManagementMessage(message: Message): boolean {
    return message.type.startsWith('router.');
  }

  private async handleRouterManagement(message: RouterManagementMessage): Promise<void> {
    log.debug(`[RouterActor] Handling management message:`, message);
    switch (message.type) {
      case 'router.add-routee':
        if (message.routee && !this.routees.find(r => r.id === message.routee!.id)) {
          this.routees.push(message.routee);
          log.debug(`[RouterActor] Added routee ${message.routee.id}, total routees: ${this.routees.length}`);
        }
        break;
      case 'router.remove-routee':
        if (message.routee) {
          const initialLength = this.routees.length;
          this.routees = this.routees.filter(r => r.id !== message.routee!.id);
          log.debug(`[RouterActor] Removed routee ${message.routee.id}, routees changed from ${initialLength} to ${this.routees.length}`);
        }
        break;
      case 'router.get-routees':
        if (message.sender) {
          log.debug(`[RouterActor] Sending routee list to ${message.sender.id}`);
          await this.context.system.send(message.sender, { 
            type: 'routees', 
            routees: [...this.routees] 
          });
        }
        break;
    }
  }
}

// Broadcast Router
export class BroadcastRouter implements IRouter {
  private readonly batchSize: number = 10;
  
  constructor(private system: ActorSystem) {}

  async route(message: Message, routees: PID[]): Promise<void> {
    if (routees.length === 0) return;

    const startTime = Date.now();
    log.debug(`[BroadcastRouter] Broadcasting message to ${routees.length} routees`);

    // Process in batches for better performance
    for (let i = 0; i < routees.length; i += this.batchSize) {
      const batch = routees.slice(i, i + this.batchSize);
      log.debug(`[BroadcastRouter] Processing batch ${i / this.batchSize + 1}, size: ${batch.length}`);
      await Promise.all(batch.map(routee => this.system.send(routee, message)));
    }

    const duration = Date.now() - startTime;
    log.debug(`[BroadcastRouter] Broadcast completed in ${duration}ms`);
  }
}

// Round Robin Router
export class RoundRobinRouter implements IRouter {
  private current: number = 0;
  private readonly batchSize: number = 10;
  
  constructor(private system: ActorSystem) {}

  async route(message: Message, routees: PID[]): Promise<void> {
    if (routees.length === 0) return;
    
    log.debug(`[RoundRobinRouter] Routing message to routee ${routees[this.current].id} (index: ${this.current})`);
    const startTime = Date.now();
    
    const routee = routees[this.current];
    await this.system.send(routee, message);
    
    // Increment counter atomically
    const nextIndex = (this.current + 1) % routees.length;
    this.current = nextIndex;
    
    const duration = Date.now() - startTime;
    log.debug(`[RoundRobinRouter] Message routed in ${duration}ms, next index: ${this.current}`);
  }
}

// Random Router
export class RandomRouter implements IRouter {
  private readonly rng: () => number;

  constructor(private system: ActorSystem) {
    this.rng = () => Math.random();
  }

  async route(message: Message, routees: PID[]): Promise<void> {
    if (routees.length === 0) return;
    
    const startTime = Date.now();
    const index = Math.floor(this.rng() * routees.length);
    log.debug(`[RandomRouter] Selected routee ${routees[index].id} at index ${index}`);
    
    await this.system.send(routees[index], message);
    
    const duration = Date.now() - startTime;
    log.debug(`[RandomRouter] Message routed in ${duration}ms`);
  }
}

// Router Factory
export function createRouter(type: RouterType, config: RouterConfig): RouterActor {
  switch (type) {
    case 'round-robin':
      return new class extends RouterActor {
        protected createRouter(system: ActorSystem): IRouter {
          return new RoundRobinRouter(system);
        }
      }(config);
    case 'random':
      return new class extends RouterActor {
        protected createRouter(system: ActorSystem): IRouter {
          return new RandomRouter(system);
        }
      }(config);
    case 'broadcast':
      return new class extends RouterActor {
        protected createRouter(system: ActorSystem): IRouter {
          return new BroadcastRouter(system);
        }
      }(config);
    case 'consistent-hash':
      throw new Error('ConsistentHashRouter not implemented yet');
    default:
      throw new Error(`Unknown router type: ${type}`);
  }
} 