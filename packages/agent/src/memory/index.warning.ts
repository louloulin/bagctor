import { MastraMemory as BaseMemory } from './memory';

export * from './index';

export abstract class MastraMemory extends BaseMemory {
  constructor(_arg?: any) {
    // @ts-ignore
    super({ name: `Deprecated memory` });

    this.logger.warn('Please import "MastraMemory" from "@bactor/agent/memory" instead of "@bactor/agent"');
  }
}
