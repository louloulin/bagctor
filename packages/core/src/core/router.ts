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
    log.info(`[RouterActor ${routerId}] Created with ${this.routees.length} routees:`, this.routees.map(r => r.id));
  }

  protected abstract createRouter(system: ActorSystem): IRouter;

  protected behaviors(): void {
    this.addBehavior('default', async (message: Message) => {
      log.info(`[RouterActor] Received message for routing:`, message);
      
      if (this.isRouterManagementMessage(message)) {
        log.info(`[RouterActor] Processing management message:`, message.type);
        await this.handleRouterManagement(message as RouterManagementMessage);
        return;
      }

      if (this.routees.length === 0) {
        log.info(`[RouterActor] No routees available, message will be dropped:`, message);
        return;
      }

      log.info(`[RouterActor] Adding message to queue, current queue size: ${this.messageQueue.length}`);
      this.messageQueue.push(message);
      await this.processMessageQueue();
    });
  }

  private async processMessageQueue(): Promise<void> {
    if (this.routingInProgress || this.messageQueue.length === 0) {
      log.info(`[RouterActor] Queue processing skipped - inProgress: ${this.routingInProgress}, queueSize: ${this.messageQueue.length}`);
      return;
    }

    log.info(`[RouterActor] Starting to process message queue of size: ${this.messageQueue.length}`);
    this.routingInProgress = true;
    const startTime = Date.now();
    
    try {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift()!;
        log.info(`[RouterActor] Routing message:`, message);
        await this.router.route(message, [...this.routees]);
      }
    } finally {
      this.routingInProgress = false;
      const duration = Date.now() - startTime;
      log.info(`[RouterActor] Finished processing message queue in ${duration}ms`);
    }
  }

  private isRouterManagementMessage(message: Message): boolean {
    return message.type.startsWith('router.');
  }

  private async handleRouterManagement(message: RouterManagementMessage): Promise<void> {
    log.info(`[RouterActor] Handling management message:`, message);
    switch (message.type) {
      case 'router.add-routee':
        if (message.routee && !this.routees.find(r => r.id === message.routee!.id)) {
          this.routees.push(message.routee);
          log.info(`[RouterActor] Added routee ${message.routee.id}, total routees: ${this.routees.length}`);
        }
        break;
      case 'router.remove-routee':
        if (message.routee) {
          const initialLength = this.routees.length;
          this.routees = this.routees.filter(r => r.id !== message.routee!.id);
          log.info(`[RouterActor] Removed routee ${message.routee.id}, routees changed from ${initialLength} to ${this.routees.length}`);
        }
        break;
      case 'router.get-routees':
        if (message.sender) {
          log.info(`[RouterActor] Sending routee list to ${message.sender.id}`);
          await this.context.system.send(message.sender, { 
            type: 'routees', 
            routees: [...this.routees] 
          });
        }
        break;
    }
  }
}

// Round Robin Router
export class RoundRobinRouter implements IRouter {
  private current: number = 0;
  private readonly batchSize: number = 10;
  
  constructor(private system: ActorSystem) {}

  async route(message: Message, routees: PID[]): Promise<void> {
    if (routees.length === 0) return;
    
    log.info(`[RoundRobinRouter] Routing message to routee ${routees[this.current].id} (index: ${this.current})`);
    const startTime = Date.now();
    
    const routee = routees[this.current];
    await this.system.send(routee, message);
    
    // Increment counter atomically
    const nextIndex = (this.current + 1) % routees.length;
    this.current = nextIndex;
    
    const duration = Date.now() - startTime;
    log.info(`[RoundRobinRouter] Message routed in ${duration}ms, next index: ${this.current}`);
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
    log.info(`[RandomRouter] Selected routee ${routees[index].id} at index ${index}`);
    
    await this.system.send(routees[index], message);
    
    const duration = Date.now() - startTime;
    log.info(`[RandomRouter] Message routed in ${duration}ms`);
  }
}

// Broadcast Router
export class BroadcastRouter implements IRouter {
  private readonly batchSize: number = 10;
  
  constructor(private system: ActorSystem) {}

  async route(message: Message, routees: PID[]): Promise<void> {
    if (routees.length === 0) return;

    const startTime = Date.now();
    log.info(`[BroadcastRouter] Broadcasting message to ${routees.length} routees`);

    // Process in batches for better performance
    for (let i = 0; i < routees.length; i += this.batchSize) {
      const batch = routees.slice(i, i + this.batchSize);
      log.debug(`[BroadcastRouter] Processing batch ${i / this.batchSize + 1}, size: ${batch.length}`);
      await Promise.all(batch.map(routee => this.system.send(routee, message)));
    }

    const duration = Date.now() - startTime;
    log.info(`[BroadcastRouter] Broadcast completed in ${duration}ms`);
  }
}

// Consistent Hash Router
export class ConsistentHashRouter implements IRouter {
  private readonly virtualNodes: number;
  private readonly hashRing: Map<number, PID>;
  private readonly hashCache: Map<string, number>;
  
  constructor(private system: ActorSystem, virtualNodes: number = 100) {
    this.virtualNodes = virtualNodes;
    this.hashRing = new Map();
    this.hashCache = new Map();
    log.info(`[ConsistentHashRouter] Created with ${virtualNodes} virtual nodes`);
  }

  private getHash(key: string): number {
    const cached = this.hashCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) + hash) + key.charCodeAt(i);
      hash = hash & hash;
    }
    
    const result = Math.abs(hash);
    this.hashCache.set(key, result);
    return result;
  }

  private updateHashRing(routees: PID[]): void {
    log.info(`[ConsistentHashRouter] Updating hash ring with ${routees.length} routees and ${this.virtualNodes} virtual nodes`);
    const startTime = Date.now();
    
    this.hashRing.clear();
    this.hashCache.clear();
    
    for (const routee of routees) {
      for (let i = 0; i < this.virtualNodes; i++) {
        const hash = this.getHash(`${routee.id}-${i}`);
        this.hashRing.set(hash, routee);
      }
    }

    const duration = Date.now() - startTime;
    log.info(`[ConsistentHashRouter] Hash ring updated in ${duration}ms, total nodes: ${this.hashRing.size}`);
  }

  async route(message: Message, routees: PID[]): Promise<void> {
    if (routees.length === 0) return;
    
    const startTime = Date.now();
    log.info(`[ConsistentHashRouter] Starting message routing`);
    
    this.updateHashRing(routees);
    const messageHash = this.getHash(JSON.stringify(message));
    log.debug(`[ConsistentHashRouter] Message hash: ${messageHash}`);
    
    // Binary search for the closest hash
    const hashes = Array.from(this.hashRing.keys()).sort((a, b) => a - b);
    let left = 0;
    let right = hashes.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (hashes[mid] < messageHash) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    const selectedHash = hashes[left] || hashes[0];
    const selectedRoutee = this.hashRing.get(selectedHash)!;
    log.debug(`[ConsistentHashRouter] Selected routee ${selectedRoutee.id} for hash ${selectedHash}`);
    
    await this.system.send(selectedRoutee, message);
    
    const duration = Date.now() - startTime;
    log.info(`[ConsistentHashRouter] Message routed in ${duration}ms`);
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
      return new class extends RouterActor {
        protected createRouter(system: ActorSystem): IRouter {
          return new ConsistentHashRouter(system);
        }
      }(config);
    default:
      throw new Error(`Unknown router type: ${type}`);
  }
} 