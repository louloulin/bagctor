import { Message, PID, ActorContext } from './types';
import { ActorSystem } from './system';
import { Actor } from './actor';
import { log } from '../utils/logger';

// Router interface
export interface IRouter {
  route(message: Message, routees: PID[]): Promise<void>;
}

// Router Strategy interface
export interface IRoutingStrategy {
  selectRoutee(message: Message, routees: PID[]): Promise<PID | PID[]>;
}

// Base router configuration
export interface RouterConfig {
  poolSize?: number;
  routees?: PID[];
  system: ActorSystem;
  actorContext?: ActorContext;  // Added for Actor inheritance
  routingConfig?: {
    weights?: Map<string, number>;  // For weighted round-robin
    hashFunction?: (message: Message) => string | number;  // For consistent hash
    virtualNodeCount?: number;  // For consistent hash
    createRoutee?: (system: ActorSystem) => Promise<PID>;
  };
}

// Router types
export type RouterType = 'round-robin' | 'random' | 'broadcast' | 'consistent-hash' | 'weighted-round-robin';

// Router messages
export interface RouterManagementMessage extends Message {
  type: 'router.add-routee' | 'router.remove-routee' | 'router.get-routees' | 'router.broadcast';
  routee?: PID;
  payload?: any;
}

// Base Router class (not an Actor)
export abstract class Router extends Actor {
  protected routees: PID[] = [];
  protected readonly strategy: IRoutingStrategy;
  private readonly mutex = new Mutex();

  constructor(protected readonly system: ActorSystem, protected readonly config: RouterConfig) {
    super(config.actorContext);
    this.routees = config.routees || [];
    this.strategy = this.createStrategy();
    log.info(`[Router ${this.context?.self?.id}] Initialized with ${this.routees.length} routees: ${this.routees.map(r => r.id).join(', ')}`);
  }

  protected behaviors(): void {
    this.addBehavior('default', async (message: Message) => {
      const messageId = Math.random().toString(36).substring(7);
      log.info(`[Router ${this.context?.self?.id}] Received message ${messageId} of type ${message.type}`);
      await this.route(message);
    });
  }

  protected abstract createStrategy(): IRoutingStrategy;

  async route(message: Message): Promise<void> {
    const messageId = Math.random().toString(36).substring(7);
    log.info(`[Router ${this.context?.self?.id}] Starting to route message ${messageId} of type ${message.type}`);

    const release = await this.mutex.acquire();
    try {
      if (this.routees.length === 0) {
        log.error(`[Router ${this.context?.self?.id}] No routees available for routing message ${messageId}`);
        return;
      }

      log.info(`[Router ${this.context?.self?.id}] Selecting routee(s) for message ${messageId} using ${this.strategy.constructor.name}`);
      const selected = await this.strategy.selectRoutee(message, [...this.routees]);

      if (Array.isArray(selected)) {
        log.info(`[Router ${this.context?.self?.id}] Broadcasting message ${messageId} to ${selected.length} routees: ${selected.map(r => r.id).join(', ')}`);
        const sendPromises = selected.map(routee => this.sendToRoutee(routee, message, messageId));
        const results = await Promise.allSettled(sendPromises);

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        log.info(`[Router ${this.context?.self?.id}] Broadcast results for message ${messageId}: ${succeeded} succeeded, ${failed} failed`);
      } else {
        log.info(`[Router ${this.context?.self?.id}] Sending message ${messageId} to single routee ${selected.id}`);
        await this.sendToRoutee(selected, message, messageId);
      }
    } catch (error) {
      log.error(`[Router ${this.context?.self?.id}] Error routing message ${messageId}:`, error);
    } finally {
      release();
      log.info(`[Router ${this.context?.self?.id}] Completed routing message ${messageId}`);
    }
  }

  private async sendToRoutee(routee: PID, message: Message, messageId: string): Promise<void> {
    try {
      const routedMessage: Message = {
        ...message,
        routee,
        sender: message.sender || this.context?.self,
        type: message.type === 'router.broadcast' ? message.type : `routed.${message.type}`,
        messageId
      };

      log.info(`[Router ${this.context?.self?.id}] Sending message ${messageId} of type ${routedMessage.type} to routee ${routee.id}`);
      await this.context.send(routee, routedMessage);
      log.info(`[Router ${this.context?.self?.id}] Successfully sent message ${messageId} to routee ${routee.id}`);
    } catch (error) {
      log.error(`[Router ${this.context?.self?.id}] Error sending message ${messageId} to routee ${routee.id}:`, error);
      throw error;
    }
  }

  addRoutee(routee: PID): void {
    if (!this.routees.find(r => r.id === routee.id)) {
      log.info(`[Router] Adding new routee ${routee.id}`);
      this.routees.push(routee);
      log.info(`[Router] Current routees: ${this.routees.map(r => r.id).join(', ')}`);
    } else {
      log.info(`[Router] Routee ${routee.id} already exists`);
    }
  }

  removeRoutee(routee: PID): void {
    const initialLength = this.routees.length;
    this.routees = this.routees.filter(r => r.id !== routee.id);
    if (this.routees.length < initialLength) {
      log.info(`[Router] Removed routee ${routee.id}`);
      log.info(`[Router] Current routees: ${this.routees.map(r => r.id).join(', ')}`);
    } else {
      log.info(`[Router] Routee ${routee.id} not found for removal`);
    }
  }

  getRoutees(): PID[] {
    return [...this.routees];
  }
}

// Pool Router - manages routee lifecycle
export abstract class PoolRouter extends Router {
  constructor(system: ActorSystem, config: RouterConfig) {
    super(system, config);
    if (!config.poolSize || config.poolSize <= 0) {
      throw new Error('Pool router requires a positive pool size');
    }
  }

  protected abstract createRoutee(): Promise<PID>;
}

// Group Router - doesn't manage routee lifecycle
export abstract class GroupRouter extends Router {
  constructor(system: ActorSystem, config: RouterConfig) {
    super(system, config);
    if (!config.routees || config.routees.length === 0) {
      throw new Error('Group router requires routees to be provided');
    }
  }
}

// Routing Strategies
export class RoundRobinStrategy implements IRoutingStrategy {
  private current: number = 0;
  private readonly mutex = new Mutex();

  async selectRoutee(message: Message, routees: PID[]): Promise<PID> {
    const release = await this.mutex.acquire();
    try {
      log.info(`[RoundRobinStrategy] Current index before selection: ${this.current}`);
      const selected = routees[this.current];
      this.current = (this.current + 1) % routees.length;
      log.info(`[RoundRobinStrategy] Selected routee ${selected.id} (index: ${this.current - 1}), next index: ${this.current}`);
      return selected;
    } finally {
      release();
    }
  }
}

// Mutex implementation for proper synchronization
class Mutex {
  private mutex = Promise.resolve();

  async acquire(): Promise<() => void> {
    let resolveMutex: () => void;
    const newMutex = new Promise<void>((resolve) => {
      resolveMutex = resolve;
    });

    const oldMutex = this.mutex;
    this.mutex = newMutex;

    await oldMutex;
    return resolveMutex!;
  }
}

export class RandomStrategy implements IRoutingStrategy {
  private readonly buffer: Uint32Array;
  private bufferIndex: number;

  constructor() {
    // Initialize a buffer for random values
    this.buffer = new Uint32Array(1024);
    this.bufferIndex = this.buffer.length;
  }

  async selectRoutee(message: Message, routees: PID[]): Promise<PID> {
    // Refill buffer if needed
    if (this.bufferIndex >= this.buffer.length) {
      crypto.getRandomValues(this.buffer);
      this.bufferIndex = 0;
    }

    // Use modulo bias correction
    const range = routees.length;
    const min = (-range >>> 0) % range;
    let value;

    do {
      value = this.buffer[this.bufferIndex++];
    } while (value < min);

    const index = value % range;
    const selectedRoutee = routees[index];

    log.info(`[RandomStrategy] Selected routee ${selectedRoutee.id} (index: ${index})`);
    return selectedRoutee;
  }
}

export class BroadcastStrategy implements IRoutingStrategy {
  async selectRoutee(message: Message, routees: PID[]): Promise<PID[]> {
    console.log(`[BroadcastStrategy] Broadcasting to ${routees.length} routees`);
    return routees;
  }
}

export class ConsistentHashStrategy implements IRoutingStrategy {
  private readonly virtualNodes: number = 100;
  private readonly hashRing = new Map<number, PID>();
  private readonly hashFn: (message: Message) => string | number;

  constructor(config?: RouterConfig) {
    if (config?.routingConfig?.virtualNodeCount) {
      this.virtualNodes = config.routingConfig.virtualNodeCount;
    }
    this.hashFn = config?.routingConfig?.hashFunction ?? ((message: Message) => {
      // Use both message type and content for better distribution
      const key = `${message.type}-${message.content}-${Date.now()}`;
      log.info(`[ConsistentHashStrategy] Generated hash key: ${key}`);
      return key;
    });
    log.info(`[ConsistentHashStrategy] Initialized with ${this.virtualNodes} virtual nodes`);
  }

  async selectRoutee(message: Message, routees: PID[]): Promise<PID> {
    this.buildHashRing(routees);

    const messageKey = this.hashFn(message);
    const messageHash = typeof messageKey === 'string' ?
      this.hashString(messageKey) :
      Math.abs(messageKey);

    log.info(`[ConsistentHashStrategy] Message hash details:`, {
      key: messageKey,
      hash: messageHash
    });

    const hashes = Array.from(this.hashRing.keys()).sort((a, b) => a - b);
    if (hashes.length === 0) {
      throw new Error('No routees available');
    }

    // Find the first hash greater than or equal to the message hash
    let selectedHash = hashes.find(hash => hash >= messageHash);

    // If no such hash exists, wrap around to the first hash
    if (!selectedHash) {
      selectedHash = hashes[0];
    }

    const selectedRoutee = this.hashRing.get(selectedHash)!;

    log.info(`[ConsistentHashStrategy] Selection details:`, {
      messageHash,
      selectedHash,
      routeeId: selectedRoutee.id,
      wrapAround: !selectedHash
    });

    return selectedRoutee;
  }

  private buildHashRing(routees: PID[]): void {
    this.hashRing.clear();
    log.info(`[ConsistentHashStrategy] Building hash ring for ${routees.length} routees`);

    // Use a prime number for better distribution
    const PRIME_MULTIPLIER = 16777619;

    for (const routee of routees) {
      for (let i = 0; i < this.virtualNodes; i++) {
        // Use a better virtual node key generation
        const virtualNodeKey = `${routee.id}-${i}-${PRIME_MULTIPLIER * (i + 1)}`;
        const hash = this.hashString(virtualNodeKey);
        this.hashRing.set(hash, routee);

        if (i === 0 || i === this.virtualNodes - 1) {
          log.info(`[ConsistentHashStrategy] Virtual node details:`, {
            routeeId: routee.id,
            virtualNodeIndex: i,
            key: virtualNodeKey,
            hash: hash
          });
        }
      }
    }

    const hashes = Array.from(this.hashRing.keys()).sort((a, b) => a - b);
    log.info(`[ConsistentHashStrategy] Hash ring built:`, {
      totalNodes: this.hashRing.size,
      uniqueRoutees: new Set(Array.from(this.hashRing.values()).map(r => r.id)).size,
      hashRange: {
        min: hashes[0],
        max: hashes[hashes.length - 1]
      }
    });
  }

  private hashString(str: string): number {
    // FNV-1a hash algorithm
    let hash = 0x811c9dc5; // FNV offset basis
    const prime = 0x01000193; // FNV prime

    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, prime);
    }

    return Math.abs(hash);
  }
}

export class WeightedRoundRobinStrategy implements IRoutingStrategy {
  private current: number = 0;
  private currentWeight: number = 0;
  private readonly weights: Map<string, number>;
  private readonly gcd: number;
  private readonly mutex = new Mutex();

  constructor(weights: Map<string, number>) {
    this.weights = weights;
    this.gcd = this.calculateGCD(Array.from(weights.values()));
    this.currentWeight = Math.max(...Array.from(weights.values()));
    console.log(`[WeightedRoundRobinStrategy] Initialized with GCD: ${this.gcd}, max weight: ${this.currentWeight}`);
  }

  async selectRoutee(message: Message, routees: PID[]): Promise<PID> {
    const release = await this.mutex.acquire();
    try {
      let attempts = 0;
      while (true) {
        attempts++;
        this.current = (this.current + 1) % routees.length;
        if (this.current === 0) {
          this.currentWeight = this.currentWeight - this.gcd;
          if (this.currentWeight <= 0) {
            this.currentWeight = Math.max(...Array.from(this.weights.values()));
          }
          console.log(`[WeightedRoundRobinStrategy] Updated current weight to ${this.currentWeight}`);
        }

        const routeeWeight = this.weights.get(routees[this.current].id) || 0;
        console.log(`[WeightedRoundRobinStrategy] Checking routee ${routees[this.current].id} with weight ${routeeWeight}`);

        if (routeeWeight >= this.currentWeight) {
          console.log(`[WeightedRoundRobinStrategy] Selected routee ${routees[this.current].id} after ${attempts} attempts`);
          return routees[this.current];
        }
      }
    } finally {
      release();
    }
  }

  private calculateGCD(numbers: number[]): number {
    const gcd = (a: number, b: number): number => {
      while (b) {
        [a, b] = [b, a % b];
      }
      return a;
    };
    return numbers.reduce((a, b) => gcd(a, b));
  }
}

// Router Factory
export function createRouter(type: RouterType, config: RouterConfig): Router {
  const createStrategy = (type: RouterType, config: RouterConfig): IRoutingStrategy => {
    switch (type) {
      case 'round-robin':
        return new RoundRobinStrategy();
      case 'random':
        return new RandomStrategy();
      case 'broadcast':
        return new BroadcastStrategy();
      case 'consistent-hash':
        return new ConsistentHashStrategy(config);
      case 'weighted-round-robin':
        if (!config.routingConfig?.weights) {
          throw new Error('Weights must be provided for weighted-round-robin router');
        }
        return new WeightedRoundRobinStrategy(config.routingConfig.weights);
      default:
        throw new Error(`Unknown router type: ${type}`);
    }
  };

  const BaseRouterClass = config.poolSize ? PoolRouter : GroupRouter;

  class RouterImpl extends BaseRouterClass {
    protected createStrategy(): IRoutingStrategy {
      return createStrategy(type, config);
    }

    protected async createRoutee(): Promise<PID> {
      if (!config.routingConfig?.createRoutee) {
        throw new Error('createRoutee function must be provided for pool routers');
      }
      return config.routingConfig.createRoutee(this.system);
    }
  }

  return new RouterImpl(config.system, config);
}

// Concrete Router Implementations
export class BroadcastRouter extends Router {
  protected createStrategy(): IRoutingStrategy {
    return new BroadcastStrategy();
  }
}

export class RoundRobinRouter extends Router {
  protected createStrategy(): IRoutingStrategy {
    return new RoundRobinStrategy();
  }
}

export class RandomRouter extends Router {
  protected createStrategy(): IRoutingStrategy {
    return new RandomStrategy();
  }
} 