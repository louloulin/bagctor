// Basic actor types
export interface PID {
    id: string;
    address?: string;
}

export interface Message {
    type: string;
    payload?: any;
    sender?: PID;
    metadata?: Record<string, any>;
}

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