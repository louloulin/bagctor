import { createLogger as _createLogger } from './index';
import type { LogLevel, TransportMap } from './index';

export * from './index';

// Factory function for creating loggers
export function createLogger(options: { name?: string; level?: LogLevel; transports?: TransportMap }) {
  console.warn('Please import "createLogger" from "@bactor/agent/logger" instead of "@bactor/agent"');

  return _createLogger(options);
}
