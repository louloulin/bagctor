import { ActorClient, PID, Message } from '@bactor/common';
import * as grpc from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { ProtoGrpcType } from './protos/actor';
import path from 'path';
import { log } from '@bactor/common';

interface ActorService {
  spawnActor(request: { className: string }, metadata: grpc.Metadata, callback: (error: Error | null, response: any) => void): void;
  stopActor(request: { actorId: string }, metadata: grpc.Metadata, callback: (error: Error | null) => void): void;
  sendMessage(request: { actorId: string; message: any }, metadata: grpc.Metadata, callback: (error: Error | null) => void): void;
  watchActor(request: { actorId: string; watcherId: string }, metadata: grpc.Metadata): any;
  waitForReady(deadline: number, callback: (error?: Error) => void): void;
  close(): void;
}

export class GrpcActorClient implements ActorClient {
  private client: ActorService;
  private address: string;
  private metadata: grpc.Metadata;
  private watchCallbacks: Map<string, Set<(event: string) => void>> = new Map();

  constructor(address: string) {
    this.address = address;
    this.metadata = new grpc.Metadata();
    const PROTO_PATH = path.resolve(__dirname, '../protos/actor.proto');
    const packageDefinition = loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });
    const proto = grpc.loadPackageDefinition(packageDefinition) as any;
    this.client = new proto.actor.ActorService(
      address,
      grpc.credentials.createInsecure()
    );
  }

  async connect(address: string): Promise<void> {
    log.info('Connecting to remote actor system', { address });
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

  async disconnect(): Promise<void> {
    log.info('Disconnecting from remote actor system');
    this.client.close();
  }

  async spawn(actorClass: any, props?: any): Promise<PID> {
    const pid: PID = { id: 'temp', address: 'remote' };
    log.info('Spawning remote actor', { actorClass, props });
    return pid;
  }

  async send(pid: PID, message: any): Promise<void> {
    log.info('Sending message to remote actor', { pid, message });
  }

  async spawnActor(className: string): Promise<PID> {
    return new Promise((resolve, reject) => {
      this.client.spawnActor({ className }, this.metadata, (error: Error | null, response: any) => {
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

  async stopActor(actorId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.stopActor({ actorId }, this.metadata, (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async sendMessage(actorId: string, message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sendMessage(
        {
          actorId,
          message: {
            type: message.type,
            payload: message.payload,
            sender: message.sender,
            metadata: message.metadata
          }
        },
        this.metadata,
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

  watchActor(actorId: string, watcherId: string): void {
    log.info('Watching remote actor', { actorId, watcherId });
    const call = this.client.watchActor({ actorId, watcherId }, this.metadata);

    call.on('data', (event: any) => {
      log.info('Received actor event', { actorId, event });
    });

    call.on('error', (error: Error) => {
      log.error('Error watching actor', { actorId, error });
    });
  }

  onActorEvent(actorId: string, callback: (event: string) => void): void {
    if (!this.watchCallbacks.has(actorId)) {
      this.watchCallbacks.set(actorId, new Set());
    }
    this.watchCallbacks.get(actorId)!.add(callback);
  }
} 