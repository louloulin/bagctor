import { ActorSystem } from '../core/system';
import { Message, PID } from '../core/types';
import { TransportProvider } from './transport';

export class RemoteActorSystem extends ActorSystem {
  protected remotes: Map<string, TransportProvider> = new Map();

  constructor(address?: string) {
    super(address);
  }

  async send(pid: PID, message: Message): Promise<void> {
    if (pid.address && pid.address !== this.address) {
      const remote = this.remotes.get(pid.address);
      if (remote) {
        await remote.send(pid.id, message);
        return;
      }
    }
    await super.send(pid, message);
  }

  registerRemote(address: string, transport: TransportProvider) {
    this.remotes.set(address, transport);
  }
} 