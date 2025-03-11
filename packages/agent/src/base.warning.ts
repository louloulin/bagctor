import { MastraBase as MastraBaseBase } from './base';
import type { RegisteredLogger } from './logger';

// Add the missing types that were referenced in the index.ts file
export enum WarningLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

export interface MastraWarning {
  level: WarningLevel;
  message: string;
  component?: string;
  timestamp: number;
  code?: string;
  details?: Record<string, any>;
}

export class MastraBase extends MastraBaseBase {
  constructor(args: { component?: RegisteredLogger; name?: string }) {
    super(args);

    this.logger.warn('Please import "MastraBase" from "@bactor/agent/base" instead of "@bactor/agent"');
  }
}
