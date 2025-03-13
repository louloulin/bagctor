// Basic actor types
export interface PID {
    id: string;
    address?: string;
}

// Concrete implementation for runtime use
export const PID = {
    create: (id: string, address?: string): PID => ({
        id,
        address
    })
};

export interface Message {
    type: string;
    payload?: any;
    sender?: PID;
    metadata?: Record<string, any>;
    // Router-specific fields
    routee?: PID;
    content?: string;
    index?: number;
    messageId?: string;  // For tracking message flow
}

// Concrete implementation for runtime use
export const Message = {
    create: (type: string, payload?: any, sender?: PID, metadata?: Record<string, any>): Message => ({
        type,
        payload,
        sender,
        metadata
    })
};

// Common configuration types
export interface LoggerConfig {
    level?: string;
    pretty?: boolean;
    destination?: string;
}

// Common interfaces
export interface Disposable {
    dispose(): Promise<void>;
}

export interface Startable {
    start(): Promise<void>;
    stop(): Promise<void>;
} 