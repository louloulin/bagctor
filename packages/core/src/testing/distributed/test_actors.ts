/**
 * TestActors
 * 
 * A collection of actor implementations designed specifically for testing.
 * These actors provide predictable behavior and capabilities to help test
 * system properties like message delivery, fault tolerance, and performance.
 */

import { Message, PID } from '../../core/types';
import { log } from '../../utils/logger';
import { TestMonitor } from './test_monitor';

// 导入 ActorContext，但不导入 Actor 类型
import type { Actor } from '../../core/types';
import type { ActorContext } from '../../core/context';

/**
 * Base configuration for test actors
 */
export interface TestActorConfig {
    /** Name or identifier for this actor instance */
    name?: string;

    /** Delay before processing each message (ms) */
    processingDelay?: number;

    /** Whether to record detailed logs */
    verbose?: boolean;

    /** Optional test monitor to report metrics to */
    monitor?: TestMonitor;
}

/**
 * Base interface for test actors with common functionality
 */
export interface IBaseTestActor {
    receive(message: Message): Promise<void>;
    getReceivedMessages(): Message[];
    clearReceivedMessages(): void;
    postStop(): Promise<void>;
}

/**
 * Base class for test actors with common functionality
 */
export abstract class BaseTestActor implements IBaseTestActor {
    protected _config: Required<TestActorConfig>;
    protected receivedMessages: Message[] = [];
    protected context: ActorContext;

    constructor(context: ActorContext, config?: TestActorConfig) {
        this.context = context;

        this._config = {
            name: `test-actor-${context?.self?.id || Date.now().toString(36)}`,
            processingDelay: 0,
            verbose: false,
            monitor: undefined as any, // 使用 as any 暂时绕过类型检查
            ...(config || {})
        };
    }

    /**
     * Process an incoming message
     */
    async receive(message: Message): Promise<void> {
        // Record the message
        this.receivedMessages.push(message);

        // Notify the monitor if available
        if (this._config.monitor) {
            this._config.monitor.captureMessage(
                message,
                'received',
                message.sender,
                this.context?.self
            );
        }

        if (this._config.verbose) {
            log.debug(`[${this._config.name}] Received message: ${message.type}`);
        }

        // Simulate processing delay if configured
        if (this._config.processingDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this._config.processingDelay));
        }

        // Process the message
        await this.processMessage(message);
    }

    /**
     * Process a specific message (to be implemented by subclasses)
     */
    protected abstract processMessage(message: Message): Promise<void>;

    /**
     * Get all received messages
     */
    getReceivedMessages(): Message[] {
        return [...this.receivedMessages];
    }

    /**
     * Clear received messages history
     */
    clearReceivedMessages(): void {
        this.receivedMessages = [];
    }

    /**
     * Send a message with monitoring
     */
    protected async sendWithMonitoring(target: PID, message: Message): Promise<void> {
        if (this._config.monitor) {
            this._config.monitor.captureMessage(
                message,
                'sent',
                this.context?.self,
                target
            );
        }

        if (this._config.verbose) {
            log.debug(`[${this._config.name}] Sending message: ${message.type} to ${target.id}`);
        }

        await this.context?.send(target, message);
    }

    /**
     * Called when actor is stopped. Clean up resources here.
     */
    async postStop(): Promise<void> {
        if (this._config.verbose) {
            log.debug(`[${this._config.name}] Actor stopped`);
        }
    }
}

/**
 * EchoActor configuration
 */
export interface EchoActorConfig extends TestActorConfig {
    /** Whether to echo messages to their original sender */
    echoToSender?: boolean;

    /** Additional recipients to echo messages to */
    additionalRecipients?: PID[];

    /** Whether to include original message payload in echo */
    includeOriginalPayload?: boolean;

    /** Custom prefix to add to echoed message types */
    echoPrefix?: string;
}

/**
 * EchoActor - Echoes received messages back to sender or other targets
 */
export class EchoActor extends BaseTestActor {
    protected _echoConfig: Required<EchoActorConfig>;

    constructor(context: ActorContext, config?: EchoActorConfig) {
        super(context, config);

        this._echoConfig = {
            ...this._config,
            echoToSender: true,
            additionalRecipients: [],
            includeOriginalPayload: true,
            echoPrefix: 'echo.',
            ...(config || {})
        };
    }

    /**
     * Process a message by echoing it
     */
    protected async processMessage(message: Message): Promise<void> {
        const echoMessage: Message = {
            type: `${this._echoConfig.echoPrefix}${message.type}`,
            payload: this._echoConfig.includeOriginalPayload ? {
                originalMessage: message,
                echoedBy: this._echoConfig.name,
                timestamp: Date.now()
            } : {
                echoedBy: this._echoConfig.name,
                timestamp: Date.now()
            }
        };

        // Echo to original sender if configured
        if (this._echoConfig.echoToSender && message.sender) {
            await this.sendWithMonitoring(message.sender, echoMessage);
        }

        // Echo to additional recipients if configured
        for (const recipient of this._echoConfig.additionalRecipients) {
            await this.sendWithMonitoring(recipient, echoMessage);
        }
    }
}

/**
 * CounterActor configuration
 */
export interface CounterActorConfig extends TestActorConfig {
    /** Initial counter value */
    initialValue?: number;

    /** Whether to broadcast counter updates */
    broadcastUpdates?: boolean;

    /** PIDs to notify on counter changes */
    subscribers?: PID[];
}

/**
 * CounterActor - Maintains a counter that can be incremented, decremented, or reset
 */
export class CounterActor extends BaseTestActor {
    protected _counterConfig: Required<CounterActorConfig>;
    private value: number;

    constructor(context: ActorContext, config?: CounterActorConfig) {
        super(context, config);

        this._counterConfig = {
            ...this._config,
            initialValue: 0,
            broadcastUpdates: false,
            subscribers: [],
            ...(config || {})
        };

        this.value = this._counterConfig.initialValue;
    }

    /**
     * Process counter-related messages
     */
    protected async processMessage(message: Message): Promise<void> {
        switch (message.type) {
            case 'counter.increment':
                const incAmount = typeof message.payload?.amount === 'number'
                    ? message.payload.amount
                    : 1;
                this.value += incAmount;
                await this.notifyUpdate('incremented', incAmount);
                break;

            case 'counter.decrement':
                const decAmount = typeof message.payload?.amount === 'number'
                    ? message.payload.amount
                    : 1;
                this.value -= decAmount;
                await this.notifyUpdate('decremented', decAmount);
                break;

            case 'counter.reset':
                const resetValue = typeof message.payload?.value === 'number'
                    ? message.payload.value
                    : 0;
                this.value = resetValue;
                await this.notifyUpdate('reset', resetValue);
                break;

            case 'counter.get':
                if (message.sender) {
                    await this.sendWithMonitoring(message.sender, {
                        type: 'counter.value',
                        payload: { value: this.value }
                    });
                }
                break;

            case 'counter.subscribe':
                if (message.sender && !this._counterConfig.subscribers.some(p => p.id === message.sender?.id)) {
                    this._counterConfig.subscribers.push(message.sender);
                    if (this._config.verbose) {
                        log.debug(`[${this._config.name}] New subscriber: ${message.sender.id}`);
                    }
                }
                break;

            case 'counter.unsubscribe':
                if (message.sender) {
                    this._counterConfig.subscribers = this._counterConfig.subscribers.filter(p => p.id !== message.sender?.id);
                }
                break;
        }
    }

    /**
     * Notify subscribers about counter updates
     */
    private async notifyUpdate(operation: string, amount: number): Promise<void> {
        if (this._config.verbose) {
            log.debug(`[${this._config.name}] Counter ${operation} by ${amount}, new value: ${this.value}`);
        }

        if (this._counterConfig.broadcastUpdates) {
            const updateMessage: Message = {
                type: 'counter.updated',
                payload: {
                    value: this.value,
                    operation,
                    amount,
                    timestamp: Date.now()
                }
            };

            for (const subscriber of this._counterConfig.subscribers) {
                await this.sendWithMonitoring(subscriber, updateMessage);
            }
        }
    }

    /**
     * Get the current counter value
     */
    getValue(): number {
        return this.value;
    }
}

/**
 * PingPongActor configuration
 */
export interface PingPongActorConfig extends TestActorConfig {
    /** Target to send pings to */
    pingTarget?: PID;

    /** Number of automatic pings to send (0 = none) */
    autoPingCount?: number;

    /** Delay between automatic pings (ms) */
    autoPingDelay?: number;

    /** Whether to respond to pings with pongs */
    respondToPings?: boolean;

    /** Additional data to include in pings */
    pingMetadata?: Record<string, any>;
}

/**
 * PingPongActor - Sends pings and responds with pongs to test basic messaging
 */
export class PingPongActor extends BaseTestActor {
    protected _pingConfig: Required<PingPongActorConfig>;
    private pingSent: number = 0;
    private pongReceived: number = 0;
    private autoPingTimer?: ReturnType<typeof setInterval>;

    constructor(context: ActorContext, config?: PingPongActorConfig) {
        super(context, config);

        this._pingConfig = {
            ...this._config,
            pingTarget: undefined as any,
            autoPingCount: 0,
            autoPingDelay: 1000,
            respondToPings: true,
            pingMetadata: {},
            ...(config || {})
        };

        // Start auto-pinging if configured
        if (this._pingConfig.autoPingCount > 0 && this._pingConfig.pingTarget) {
            this.startAutoPing();
        }
    }

    /**
     * Process ping/pong messages
     */
    protected async processMessage(message: Message): Promise<void> {
        switch (message.type) {
            case 'ping':
                if (this._pingConfig.respondToPings && message.sender) {
                    // Respond with a pong
                    const pongMessage: Message = {
                        type: 'pong',
                        payload: {
                            pingId: message.payload?.id,
                            timestamp: Date.now(),
                            respondedBy: this._config.name,
                            ...(message.payload || {})
                        }
                    };

                    await this.sendWithMonitoring(message.sender, pongMessage);
                }
                break;

            case 'pong':
                this.pongReceived++;
                break;

            case 'start.ping':
                const count = typeof message.payload?.count === 'number'
                    ? message.payload.count
                    : 1;
                const target = message.payload?.target || this._pingConfig.pingTarget;

                if (target) {
                    for (let i = 0; i < count; i++) {
                        await this.sendPing(target);
                    }
                }
                break;

            case 'stop.ping':
                if (this.autoPingTimer) {
                    clearInterval(this.autoPingTimer);
                    this.autoPingTimer = undefined;
                }
                break;

            case 'get.stats':
                if (message.sender) {
                    await this.sendWithMonitoring(message.sender, {
                        type: 'ping.stats',
                        payload: this.getStats()
                    });
                }
                break;

            case 'configure':
                if (message.payload?.pingTarget) {
                    this._pingConfig.pingTarget = message.payload.pingTarget;
                }
                if (message.payload?.respondToPings !== undefined) {
                    this._pingConfig.respondToPings = message.payload.respondToPings;
                }
                break;
        }
    }

    /**
     * Start sending automatic pings
     */
    private startAutoPing(): void {
        if (this.autoPingTimer) {
            clearInterval(this.autoPingTimer);
        }

        let pingsSent = 0;
        this.autoPingTimer = setInterval(async () => {
            if (this._pingConfig.pingTarget) {
                await this.sendPing(this._pingConfig.pingTarget);
                pingsSent++;

                if (this._pingConfig.autoPingCount > 0 && pingsSent >= this._pingConfig.autoPingCount) {
                    if (this.autoPingTimer) {
                        clearInterval(this.autoPingTimer);
                        this.autoPingTimer = undefined;
                    }
                }
            }
        }, this._pingConfig.autoPingDelay);
    }

    /**
     * Send a ping message
     */
    async sendPing(target: PID): Promise<void> {
        this.pingSent++;
        const pingId = `ping-${this._config.name}-${this.pingSent}`;

        const pingMessage: Message = {
            type: 'ping',
            payload: {
                id: pingId,
                timestamp: Date.now(),
                sentBy: this._config.name,
                pingNumber: this.pingSent,
                ...this._pingConfig.pingMetadata
            }
        };

        await this.sendWithMonitoring(target, pingMessage);
    }

    /**
     * Get ping/pong statistics
     */
    getStats(): { pingSent: number; pongReceived: number; successRate: number } {
        const successRate = this.pingSent > 0 ? this.pongReceived / this.pingSent : 0;
        return {
            pingSent: this.pingSent,
            pongReceived: this.pongReceived,
            successRate
        };
    }

    /**
     * Reset ping/pong counters
     */
    resetStats(): void {
        this.pingSent = 0;
        this.pongReceived = 0;
    }

    /**
     * Override postStop to clean up timer
     */
    async postStop(): Promise<void> {
        if (this.autoPingTimer) {
            clearInterval(this.autoPingTimer);
            this.autoPingTimer = undefined;
        }
        await super.postStop();
    }
}

/**
 * Create an echo actor for testing
 */
export function createEchoActor(
    context: ActorContext,
    config?: EchoActorConfig
): EchoActor {
    return new EchoActor(context, config);
}

/**
 * Create a counter actor for testing
 */
export function createCounterActor(
    context: ActorContext,
    config?: CounterActorConfig
): CounterActor {
    return new CounterActor(context, config);
}

/**
 * Create a ping-pong actor for testing
 */
export function createPingPongActor(
    context: ActorContext,
    config?: PingPongActorConfig
): PingPongActor {
    return new PingPongActor(context, config);
}