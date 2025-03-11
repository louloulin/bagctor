import { MastraBundler as BaseMastraBundler } from './index';

export abstract class MastraBundler extends BaseMastraBundler {
  constructor(args: { name: string; mastraDir: string; outputDirectory: string }) {
    super(args);

    this.logger.warn('Please import "MastraBundler" from "@bactor/agent/bundler" instead of "@bactor/agent"');
  }
}
