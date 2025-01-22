import { ActorSystem } from '../core/system';
import { Message, PID } from '../core/types';
import { RemoteTransport } from './transport';

export class RemoteActorSystem extends ActorSystem {
  protected remotes: Map<string, RemoteTransport> = new Map();

  constructor(address?: string) {
    super(address);
  }

  async send(pid: PID, message: Message): Promise<void> {
    if (pid.address && pid.address !== this.address) {
      const remote = this.remotes.get(pid.address);
      if (remote) {
        await remote.send(pid, message);
        return;
      }
    }
    await super.send(pid, message);
  }

  registerRemote(address: string, transport: RemoteTransport) {
    this.remotes.set(address, transport);
  }
} 