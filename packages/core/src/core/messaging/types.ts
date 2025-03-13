import { PID } from '../types';

export interface MessageDeliveryConfig {
    deliveryGuarantee: DeliveryGuarantee;
    persistenceStrategy: PersistenceStrategy;
    acknowledgmentTimeout: number;
    replayStrategy: ReplayStrategy;
    maxRetries: number;
    retryBackoff: number;
}

export enum DeliveryGuarantee {
    AT_MOST_ONCE = 'AT_MOST_ONCE',
    AT_LEAST_ONCE = 'AT_LEAST_ONCE',
    EXACTLY_ONCE = 'EXACTLY_ONCE'
}

export enum PersistenceStrategy {
    MEMORY = 'MEMORY',
    FILE = 'FILE',
    DATABASE = 'DATABASE'
}

export enum ReplayStrategy {
    FROM_BEGINNING = 'FROM_BEGINNING',
    FROM_LAST_CHECKPOINT = 'FROM_LAST_CHECKPOINT',
    CUSTOM = 'CUSTOM'
}

export interface MessageEnvelope {
    id: string;
    sender: PID;
    receiver: PID;
    payload: any;
    metadata: MessageMetadata;
    timestamp: number;
}

export interface MessageMetadata {
    deliveryAttempt: number;
    messageType: string;
    correlationId?: string;
    causationId?: string;
    checkpointId?: string;
    priority?: number;
    ttl?: number;
    deduplicationId?: string;
}

export interface DeliveryStatus {
    messageId: string;
    status: DeliveryState;
    timestamp: number;
    error?: Error;
    retryCount: number;
}

export enum DeliveryState {
    PENDING = 'PENDING',
    SENT = 'SENT',
    DELIVERED = 'DELIVERED',
    ACKNOWLEDGED = 'ACKNOWLEDGED',
    FAILED = 'FAILED',
    RETRYING = 'RETRYING'
}

export interface MessageStore {
    save(message: MessageEnvelope): Promise<void>;
    get(messageId: string): Promise<MessageEnvelope | null>;
    delete(messageId: string): Promise<void>;
    getUnacknowledged(pid: PID): Promise<MessageEnvelope[]>;
    markAsAcknowledged(messageId: string): Promise<void>;
    markAsDelivered(messageId: string): Promise<void>;
}

export interface DeliveryTracker {
    track(messageId: string): void;
    acknowledge(messageId: string): void;
    isAcknowledged(messageId: string): boolean;
    getUnacknowledged(): string[];
    clear(messageId: string): void;
} 