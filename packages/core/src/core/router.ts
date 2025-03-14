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
    // Skip generating IDs and detailed logging in production for better performance
    const isDebugEnabled = process.env.NODE_ENV !== 'production';
    const messageId = isDebugEnabled ? Math.random().toString(36).substring(7) : '';

    if (isDebugEnabled) {
      log.info(`[Router ${this.context?.self?.id}] Starting to route message ${messageId} of type ${message.type}`);
    }

    // Fast path for empty routee lists
    if (this.routees.length === 0) {
      log.error(`[Router ${this.context?.self?.id}] No routees available for routing message`);
      return;
    }

    // Try to acquire the mutex without blocking for better performance
    // Only use the full mutex acquisition if we need to
    let directRouting = false;
    if (this.routees.length === 1) {
      // Fast path for single routee
      directRouting = true;
      await this.sendToRoutee(this.routees[0], message, messageId);
      return;
    }

    // Use a more optimistic approach for mutex acquisition
    if (this.mutex.tryAcquire()) {
      try {
        const selected = await this.strategy.selectRoutee(message, [...this.routees]);

        if (Array.isArray(selected)) {
          if (isDebugEnabled) {
            log.info(`[Router ${this.context?.self?.id}] Broadcasting to ${selected.length} routees`);
          }

          // Use Promise.all but avoid creating too many promises at once for large broadcasts
          const batchSize = 50;
          for (let i = 0; i < selected.length; i += batchSize) {
            const batch = selected.slice(i, i + batchSize);
            await Promise.all(batch.map(routee =>
              this.sendToRoutee(routee, message, messageId)));
          }
        } else {
          if (isDebugEnabled) {
            log.info(`[Router ${this.context?.self?.id}] Sending to single routee ${selected.id}`);
          }
          await this.sendToRoutee(selected, message, messageId);
        }
      } catch (error) {
        log.error(`[Router ${this.context?.self?.id}] Error routing message:`, error);
      } finally {
        // Release the mutex without directly reassigning it
        this.mutex.release();
      }
      return;
    }

    // Slow path with full mutex acquisition
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
      if (isDebugEnabled) {
        log.info(`[Router ${this.context?.self?.id}] Completed routing message ${messageId}`);
      }
    }
  }

  private async sendToRoutee(routee: PID, message: Message, messageId: string): Promise<void> {
    try {
      // Create a minimal copy of the message for routing
      const routedMessage: Message = {
        type: message.type,
        payload: message.payload,
        // Only include other fields if they exist
        ...(message.sender && { sender: message.sender }),
        ...(message.metadata && { metadata: message.metadata })
      };

      await this.system.send(routee, routedMessage);
    } catch (error) {
      log.error(`[Router] Error sending to routee ${routee.id}:`, error);
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

  // Cached last selected index for fast-path selection
  private lastSelectedIndex: number = -1;
  private consecutiveSelections: number = 0;
  private readonly MAX_CONSECUTIVE_FAST_PATH = 5;

  async selectRoutee(message: Message, routees: PID[]): Promise<PID> {
    // Fast path: If the message is part of a sequence or for small routee pools
    // skip mutex acquisition for better performance
    if (routees.length <= 3 ||
      (this.lastSelectedIndex >= 0 &&
        this.consecutiveSelections < this.MAX_CONSECUTIVE_FAST_PATH)) {
      this.current = (this.current + 1) % routees.length;
      this.lastSelectedIndex = this.current;
      this.consecutiveSelections++;
      return routees[this.current];
    }

    // Slow path with mutex for concurrent access
    const release = await this.mutex.acquire();
    try {
      this.current = (this.current + 1) % routees.length;
      this.lastSelectedIndex = this.current;
      this.consecutiveSelections = 1;
      return routees[this.current];
    } finally {
      release();
    }
  }
}

// Mutex implementation with less overhead
class Mutex {
  private mutex = Promise.resolve();
  private locked = false;

  async acquire(): Promise<() => void> {
    let resolve: () => void;
    // Create a new promise that will be resolved when the mutex is released
    const promise = new Promise<void>((res) => {
      resolve = res;
    });

    // Chain the current operation to the existing mutex chain
    const previousMutex = this.mutex;
    this.mutex = this.mutex.then(() => promise);
    this.locked = true;

    // Wait for our turn
    await previousMutex;

    // Return a function that releases the mutex when called
    return () => {
      this.locked = false;
      resolve!();
    };
  }

  // New method: Try to acquire the mutex without waiting
  tryAcquire(): boolean {
    if (!this.locked) {
      let resolve: () => void;
      const promise = new Promise<void>((res) => {
        resolve = res;
      });
      this.mutex = promise;
      this.locked = true;

      // Create a release function that will be called after a short delay
      setTimeout(() => {
        this.locked = false;
        resolve!();
      }, 0);

      return true;
    }
    return false;
  }

  // Explicitly release the mutex
  release(): void {
    this.locked = false;
  }
}

export class RandomStrategy implements IRoutingStrategy {
  private readonly buffer: Uint32Array;
  private bufferIndex: number;

  // Add a cache of recent random values to avoid frequent crypto operations
  private recentRandomValues: number[] = [];
  private readonly CACHE_SIZE = 100;

  constructor() {
    this.buffer = new Uint32Array(1000);
    this.bufferIndex = this.buffer.length;
    this.refillRandomBuffer();
  }

  private refillRandomBuffer(): void {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(this.buffer);
    } else {
      // Fallback for environments without crypto
      for (let i = 0; i < this.buffer.length; i++) {
        this.buffer[i] = Math.floor(Math.random() * 0xFFFFFFFF);
      }
    }
    this.bufferIndex = 0;
  }

  async selectRoutee(message: Message, routees: PID[]): Promise<PID> {
    // Use a random number from our pre-computed buffer
    if (this.bufferIndex >= this.buffer.length) {
      this.refillRandomBuffer();
    }

    const randomValue = this.buffer[this.bufferIndex++];
    const index = randomValue % routees.length;

    // Cache this random value for potential reuse
    if (this.recentRandomValues.length >= this.CACHE_SIZE) {
      this.recentRandomValues.shift();
    }
    this.recentRandomValues.push(index);

    return routees[index];
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

  // Cache for recent message hash values
  private readonly hashCache = new Map<string, number>();
  private readonly MAX_CACHE_SIZE = 1000;

  // Sorted ring keys for faster lookup
  private sortedKeys: number[] = [];

  constructor(config?: RouterConfig) {
    this.virtualNodes = config?.routingConfig?.virtualNodeCount || 100;

    // Use the custom hash function if provided, or default to a simple one
    this.hashFn = config?.routingConfig?.hashFunction || ((message: Message) => {
      return typeof message.payload === 'object' && message.payload !== null
        ? JSON.stringify(message.payload)
        : String(message.payload);
    });
  }

  async selectRoutee(message: Message, routees: PID[]): Promise<PID> {
    // Rebuild the hash ring if routees have changed
    if (this.hashRing.size === 0 || this.hashRing.size !== routees.length * this.virtualNodes) {
      this.buildHashRing(routees);
    }

    // Generate a hash key for the message
    const messageKey = `${message.type}-${JSON.stringify(message.payload).slice(0, 100)}`;

    // Use cached hash if available
    let hash: number;
    if (this.hashCache.has(messageKey)) {
      hash = this.hashCache.get(messageKey)!;
    } else {
      const hashInput = this.hashFn(message);
      hash = typeof hashInput === 'string' ? this.hashString(hashInput) : Number(hashInput);

      // Cache the hash for future use
      if (this.hashCache.size < this.MAX_CACHE_SIZE) {
        this.hashCache.set(messageKey, hash);
      }
    }

    // Find the appropriate node in the hash ring using binary search (much faster)
    const routee = this.findRouteeInRing(hash);
    return routee;
  }

  private findRouteeInRing(hash: number): PID {
    // Binary search for the closest key greater than or equal to the hash
    let left = 0;
    let right = this.sortedKeys.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedKeys[mid] < hash) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // If we've gone past the end, wrap around to the beginning
    const index = left === this.sortedKeys.length ? 0 : left;
    return this.hashRing.get(this.sortedKeys[index])!;
  }

  private buildHashRing(routees: PID[]): void {
    this.hashRing.clear();

    for (const routee of routees) {
      for (let i = 0; i < this.virtualNodes; i++) {
        const key = `${routee.id}-${i}`;
        const hash = this.hashString(key);
        this.hashRing.set(hash, routee);
      }
    }

    // Pre-compute sorted keys for binary search
    this.sortedKeys = Array.from(this.hashRing.keys()).sort((a, b) => a - b);
  }

  // Optimized hash function with FNV-1a for better distribution and speed
  private hashString(str: string): number {
    const FNV_PRIME = 0x01000193;
    const FNV_OFFSET_BASIS = 0x811c9dc5;

    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, FNV_PRIME);
    }

    return hash >>> 0; // Convert to unsigned 32-bit integer
  }
}

export class WeightedRoundRobinStrategy implements IRoutingStrategy {
  private current: number = 0;
  private currentWeight: number = 0;
  private readonly weights: Map<string, number>;
  private readonly gcd: number;
  private readonly mutex = new Mutex();

  // Pre-computed selection plan for faster routing
  private readonly selectionPlan: number[] = [];
  private planIndex: number = 0;

  constructor(weights: Map<string, number>) {
    this.weights = weights;
    this.gcd = this.calculateGCD(Array.from(weights.values()));
    this.currentWeight = Math.max(...Array.from(weights.values()));

    // Pre-compute a weighted selection plan
    this.precomputeSelectionPlan(Array.from(weights.entries()));
  }

  private precomputeSelectionPlan(weightEntries: [string, number][]): void {
    const totalWeight = weightEntries.reduce((sum, [_, weight]) => sum + weight, 0);
    const maxWeight = Math.max(...weightEntries.map(([_, w]) => w));

    // Build a selection plan based on the weights
    let remainingWeight = totalWeight;
    while (remainingWeight > 0) {
      for (let i = 0; i < weightEntries.length; i++) {
        const [_, weight] = weightEntries[i];
        if (weight >= this.currentWeight) {
          this.selectionPlan.push(i);
          remainingWeight -= weight;
        }
      }
      this.currentWeight = this.currentWeight - this.gcd;
      if (this.currentWeight <= 0) {
        this.currentWeight = maxWeight;
      }
    }
  }

  async selectRoutee(message: Message, routees: PID[]): Promise<PID> {
    const release = await this.mutex.acquire();
    try {
      // If we have a precomputed plan, use it
      if (this.selectionPlan.length > 0) {
        this.planIndex = (this.planIndex + 1) % this.selectionPlan.length;
        const selectedIndex = this.selectionPlan[this.planIndex] % routees.length;
        return routees[selectedIndex];
      }

      // Fallback to original algorithm if no plan available
      let attempts = 0;
      while (true) {
        attempts++;
        this.current = (this.current + 1) % routees.length;
        if (this.current === 0) {
          this.currentWeight = this.currentWeight - this.gcd;
          if (this.currentWeight <= 0) {
            this.currentWeight = Math.max(...Array.from(this.weights.values()));
          }
        }

        const routeeWeight = this.weights.get(routees[this.current].id) || 0;
        if (routeeWeight >= this.currentWeight) {
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