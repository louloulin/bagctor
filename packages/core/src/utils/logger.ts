import pino, { Logger, TransportSingleOptions, TransportMultiOptions, LoggerOptions, DestinationStream } from 'pino';
import { randomUUID } from 'crypto';

// Logger configuration interface
export interface LoggerConfig {
  level?: string;
  enabled?: boolean;
  prettyPrint?: boolean;
  traceId?: string;
  context?: Record<string, unknown>;
  transport?: TransportSingleOptions | TransportMultiOptions | DestinationStream;
  formatters?: {
    level?: (label: string, number: number) => Record<string, unknown>;
    bindings?: (bindings: pino.Bindings) => Record<string, unknown>;
    log?: (object: Record<string, unknown>) => Record<string, unknown>;
  };
  customLevels?: Record<string, number>;
  redact?: string[];
}

// Trace context management
export class TraceContext {
  private static instance: TraceContext;
  private store: Map<string, any> = new Map();

  private constructor() { }

  static getInstance(): TraceContext {
    if (!TraceContext.instance) {
      TraceContext.instance = new TraceContext();
    }
    return TraceContext.instance;
  }

  getTraceId(): string {
    const traceId = this.store.get('traceId');
    return traceId || this.setNewTraceId();
  }

  setNewTraceId(): string {
    const traceId = randomUUID();
    this.store.set('traceId', traceId);
    return traceId;
  }

  setContext(key: string, value: any): void {
    this.store.set(key, value);
  }

  getContext(key: string): any {
    return this.store.get(key);
  }

  clearContext(): void {
    this.store.clear();
  }
}

// Logger configuration manager
export class LoggerManager {
  private static instance: LoggerManager;
  private config: LoggerConfig;
  private loggers: Map<string, Logger> = new Map();
  private baseLogger?: Logger;

  private constructor() {
    this.config = this.getDefaultConfig();
  }

  static getInstance(): LoggerManager {
    if (!LoggerManager.instance) {
      LoggerManager.instance = new LoggerManager();
    }
    return LoggerManager.instance;
  }

  private getDefaultConfig(): LoggerConfig {
    return {
      level: process.env.NODE_ENV === 'test' ? 'error' : 'info',
      enabled: true,
      prettyPrint: true,
      customLevels: {
        trace: 10,
        debug: 20,
        info: 30,
        warn: 40,
        error: 50,
        fatal: 60
      }
    };
  }

  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Clear existing loggers
    this.loggers.clear();
    this.baseLogger = undefined;
  }

  private createBaseLogger(): Logger {
    if (this.baseLogger) {
      return this.baseLogger;
    }

    const options: LoggerOptions = {
      level: this.config.level,
      enabled: this.config.enabled,
      customLevels: this.config.customLevels,
      redact: this.config.redact,
      base: undefined,
      formatters: this.config.formatters || {
        level: (label) => ({ level: label.toUpperCase() }),
        bindings: (bindings) => bindings,
        log: (obj) => {
          const traceContext = TraceContext.getInstance();
          return {
            ...obj,
            traceId: traceContext.getTraceId(),
            timestamp: new Date().toISOString()
          };
        }
      }
    };

    if (this.config.transport) {
      if ('write' in this.config.transport) {
        this.baseLogger = pino(options, this.config.transport);
      } else {
        options.transport = this.config.transport;
        this.baseLogger = pino(options);
      }
    } else if (this.config.prettyPrint) {
      options.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss UTC',
          ignore: 'pid,hostname',
        },
      };
      this.baseLogger = pino(options);
    } else {
      this.baseLogger = pino(options);
    }

    return this.baseLogger;
  }

  getLogger(context?: string): Logger {
    if (!context) {
      return this.createBaseLogger();
    }

    let logger = this.loggers.get(context);
    if (!logger) {
      const baseLogger = this.createBaseLogger();
      logger = baseLogger.child({ context });
      this.loggers.set(context, logger);
    }
    return logger;
  }
}

// Export the main logger instance
const loggerManager = LoggerManager.getInstance();
export const logger = loggerManager.getLogger();

// Export configuration methods
export const configureLogger = (config: Partial<LoggerConfig>) => {
  loggerManager.updateConfig(config);
};

// Export convenience methods with trace context
export const log = {
  trace: (msg: string, ...args: any[]) => {
    const traceContext = TraceContext.getInstance();
    logger.trace({ traceId: traceContext.getTraceId() }, msg, ...args);
  },
  debug: (msg: string, ...args: any[]) => {
    const traceContext = TraceContext.getInstance();
    logger.debug({ traceId: traceContext.getTraceId() }, msg, ...args);
  },
  info: (msg: string, ...args: any[]) => {
    const traceContext = TraceContext.getInstance();
    logger.info({ traceId: traceContext.getTraceId() }, msg, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    const traceContext = TraceContext.getInstance();
    logger.warn({ traceId: traceContext.getTraceId() }, msg, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    const traceContext = TraceContext.getInstance();
    logger.error({ traceId: traceContext.getTraceId() }, msg, ...args);
  },
  fatal: (msg: string, ...args: any[]) => {
    const traceContext = TraceContext.getInstance();
    logger.fatal({ traceId: traceContext.getTraceId() }, msg, ...args);
  },
};

// Create child loggers with context
export const createLogger = (context: string) => {
  return loggerManager.getLogger(context);
};

// Export trace context methods
export const trace = {
  setTraceId: (traceId: string) => {
    const traceContext = TraceContext.getInstance();
    traceContext.setContext('traceId', traceId);
  },
  getTraceId: () => {
    const traceContext = TraceContext.getInstance();
    return traceContext.getTraceId();
  },
  setContext: (key: string, value: unknown) => {
    const traceContext = TraceContext.getInstance();
    traceContext.setContext(key, value);
  },
  getContext: (key: string) => {
    const traceContext = TraceContext.getInstance();
    return traceContext.getContext(key);
  },
  clearContext: () => {
    const traceContext = TraceContext.getInstance();
    traceContext.clearContext();
  },
}; 