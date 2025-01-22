import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ProtoGrpcType } from './protos/actor';
import { Message, PID } from '../core/types';
import path from 'path';

const PROTO_PATH = path.resolve(__dirname, './protos/actor.proto');

export class ActorClient {
  private client: any;

  constructor(private host: string = 'localhost:50051') {}

  async connect(): Promise<void> {
    const packageDefinition = await protoLoader.load(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;
    this.client = new proto.actor.ActorService(
      this.host,
      grpc.credentials.createInsecure()
    );
  }

  async sendMessage(targetId: string, message: Message): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const payload = message.payload ? 
          Buffer.from(JSON.stringify(message.payload), 'utf-8') : 
          undefined;

        const request = {
          target_id: targetId,
          type: message.type,
          payload,
          sender_id: message.sender?.id
        };

        this.client.sendMessage(request, (error: any, response: any) => {
          if (error) {
            console.error('gRPC error:', error);
            reject(error);
            return;
          }
          if (!response?.success) {
            const err = new Error(response?.error || 'Unknown error');
            console.error('Send message failed:', err);
            reject(err);
            return;
          }
          resolve();
        });
      } catch (error) {
        console.error('Send message error:', error);
        reject(error);
      }
    });
  }

  async spawnActor(
    actorClass: string,
    initPayload?: any,
    mailboxType?: string
  ): Promise<PID> {
    return new Promise((resolve, reject) => {
      try {
        const request = {
          actor_class: actorClass,
          init_payload: undefined,
          mailbox_type: mailboxType
        };

        this.client.spawnActor(request, (error: any, response: any) => {
          if (error) {
            console.error('gRPC error:', error);
            reject(error);
            return;
          }
          if (!response?.success) {
            const err = new Error(response?.error || 'Unknown error');
            console.error('Spawn actor failed:', err);
            reject(err);
            return;
          }
          resolve({ id: response.actor_id });
        });
      } catch (error) {
        console.error('Spawn actor error:', error);
        reject(error);
      }
    });
  }

  async stopActor(actorId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client.stopActor({ actor_id: actorId }, (error: any, response: any) => {
          if (error) {
            console.error('gRPC error:', error);
            reject(error);
            return;
          }
          if (!response?.success) {
            const err = new Error(response?.error || 'Unknown error');
            console.error('Stop actor failed:', err);
            reject(err);
            return;
          }
          resolve();
        });
      } catch (error) {
        console.error('Stop actor error:', error);
        reject(error);
      }
    });
  }

  watchActor(actorId: string, watcherId: string): grpc.ClientReadableStream<any> {
    const request = {
      actor_id: actorId,
      watcher_id: watcherId
    };

    const stream = this.client.watchActor(request);
    
    stream.on('error', (error: Error) => {
      console.error(`Watch error for actor ${actorId}:`, error);
    });

    return stream;
  }

  close(): void {
    if (this.client) {
      grpc.closeClient(this.client);
    }
  }
} 