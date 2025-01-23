import pino from 'pino';

// Configure the logger with sensible defaults
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  base: undefined, // Removes pid and hostname from logs
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Export convenience methods
export const log = {
  trace: (msg: string, ...args: any[]) => logger.trace(msg, ...args),
  debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
  info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
  warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
  fatal: (msg: string, ...args: any[]) => logger.fatal(msg, ...args),
};

// Create child loggers with context
export const createLogger = (context: string) => {
  return logger.child({ context });
}; 