import { LibSQLStore as BaseLibSQLStore } from '.';
import type { LibSQLConfig } from '.';

export * from '.';

export class LibSQLStore extends BaseLibSQLStore {
  constructor(args: { config: LibSQLConfig }) {
    super(args);

    this.logger.warn('Please import "LibSQLStore" from "@bactor/agent/storage" instead of "@bactor/agent"');
  }
}
