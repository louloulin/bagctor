import { Message, PID } from '../core/types';

export interface RemoteTransport {
  send(target: PID, message: Message): Promise<void>;
  receive(): AsyncIterator<Message>;
}

export class GrpcTransport implements RemoteTransport {
  constructor(private address: string) {}

  async send(target: PID, message: Message): Promise<void> {
    // Implement gRPC send
  }

  async *receive(): AsyncIterator<Message> {
    // Implement gRPC receive
    while (true) {
      yield await this.receiveNext();
    }
  }

  private async receiveNext(): Promise<Message> {
    // Implement actual gRPC receive
    throw new Error("Not implemented");
  }
} 