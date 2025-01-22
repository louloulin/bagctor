import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { ProtoGrpcType } from './protos/actor';
import { Message, PID } from '../core/types';
import path from 'path';

const PROTO_PATH = path.resolve(__dirname, './protos/actor.proto');
const packageDefinition = loadSync(PROTO_PATH);
const proto = loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;

export class ActorClient {
  private client: any;
  private watchCallbacks: Map<string, Set<(event: string) => void>> = new Map();

  constructor(private address: string) {
    this.client = new proto.actor.ActorService(
      address,
      credentials.createInsecure()
    );
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.waitForReady(Date.now() + 5000, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async spawnActor(className: string): Promise<PID> {
    return new Promise((resolve, reject) => {
      this.client.spawnActor({ className }, (error: Error | null, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            id: response.id,
            address: response.address || this.address
          });
        }
      });
    });
  }

  async sendMessage(actorId: string, message: Message): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sendMessage(
        {
          actorId,
          message: {
            ...message,
            sender: message.sender ? {
              ...message.sender,
              address: message.sender.address
            } : undefined
          }
        },
        (error: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async stopActor(actorId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.stopActor({ actorId }, (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  watchActor(actorId: string, watcherId: string): void {
    const call = this.client.watchActor({ actorId, watcherId });

    // Set up monitoring callbacks
    if (!this.watchCallbacks.has(actorId)) {
      this.watchCallbacks.set(actorId, new Set());
    }

    const callbacks = this.watchCallbacks.get(actorId)!;

    call.on('data', (event: any) => {
      callbacks.forEach(callback => callback(event.type));
    });

    call.on('end', () => {
      this.watchCallbacks.delete(actorId);
    });

    call.on('error', (error: Error) => {
      console.error(`Watch error for actor ${actorId}:`, error);
      this.watchCallbacks.delete(actorId);
    });
  }

  onActorEvent(actorId: string, callback: (event: string) => void): void {
    if (!this.watchCallbacks.has(actorId)) {
      this.watchCallbacks.set(actorId, new Set());
    }
    this.watchCallbacks.get(actorId)!.add(callback);
  }

  close(): void {
    this.client.close();
  }
} 