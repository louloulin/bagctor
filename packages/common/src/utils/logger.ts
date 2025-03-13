import pino from 'pino';
import type { LoggerConfig } from '../types';

const defaultConfig: LoggerConfig = {
    level: 'info',
    pretty: true
};

let logger = pino(defaultConfig);

export const log = logger;

export function configureLogger(config: LoggerConfig): void {
    logger = pino({
        ...defaultConfig,
        ...config
    });
}

export function createLogger(name: string, config?: LoggerConfig): pino.Logger {
    return logger.child({ name, ...config });
}

export function trace(name: string): MethodDecorator {
    return function (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const methodLogger = createLogger(name);
            methodLogger.debug('Enter method', { method: propertyKey.toString() });

            try {
                const result = await originalMethod.apply(this, args);
                methodLogger.debug('Exit method', { method: propertyKey.toString() });
                return result;
            } catch (error) {
                methodLogger.error('Method error', {
                    method: propertyKey.toString(),
                    error
                });
                throw error;
            }
        };

        return descriptor;
    };
} 