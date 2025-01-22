import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { ProtoGrpcType } from './protos/actor';
import { ActorSystem } from '../core/system';
import { Message, PID } from '../core/types';
import { DefaultMailbox, PriorityMailbox } from '../core/mailbox';
import path from 'path';

const PROTO_PATH = path.resolve(__dirname, './protos/actor.proto');

// Actor class registry
const actorRegistry = new Map<string, any>();

export class ActorServer {
  private server: grpc.Server;
  private actorSystem: ActorSystem;
  private watchedActors: Map<string, Set<string>> = new Map(); // actorId -> Set of watcherIds
  private watchStreams: Map<string, grpc.ServerWritableStream<any, any>> = new Map(); // watcherId -> stream

  constructor(private host: string = '0.0.0.0:50051') {
    this.server = new grpc.Server();
    this.actorSystem = new ActorSystem();
  }

  // Register an actor class
  registerActor(name: string, actorClass: any) {
    actorRegistry.set(name, actorClass);
  }

  async start(): Promise<void> {
    const packageDefinition = await protoLoader.load(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;

    this.server.addService(proto.actor.ActorService.service, {
      sendMessage: this.handleSendMessage.bind(this),
      spawnActor: this.handleSpawnActor.bind(this),
      stopActor: this.handleStopActor.bind(this),
      watchActor: this.handleWatchActor.bind(this)
    });

    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        this.host,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            reject(error);
            return;
          }
          console.log(`Actor server running at ${this.host}`);
          resolve();
        }
      );
    });
  }

  private async handleSendMessage(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { target_id, type, payload, sender_id } = call.request;
      const message: Message = {
        type,
        payload: payload ? JSON.parse(payload.toString('utf-8')) : undefined,
        sender: sender_id ? { id: sender_id } : undefined
      };

      await this.actorSystem.send({ id: target_id }, message);
      callback(null, { success: true });
    } catch (error: any) {
      console.error('Send message error:', error);
      callback(null, { success: false, error: error.message || 'Unknown error' });
    }
  }

  private async handleSpawnActor(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { actor_class, init_payload, parent_id, mailbox_type } = call.request;
      
      const ActorClass = this.getActorClass(actor_class);
      if (!ActorClass) {
        throw new Error(`Actor class ${actor_class} not found`);
      }

      const pid = await this.actorSystem.spawn({
        actorClass: ActorClass,
        mailboxType: mailbox_type ? this.getMailboxType(mailbox_type) : undefined,
        actorContext: undefined
      });

      // Notify watchers
      this.notifyWatchers(pid.id, 'STARTED');

      callback(null, { success: true, actor_id: pid.id });
    } catch (error: any) {
      console.error('Spawn actor error:', error);
      callback(null, { success: false, error: error.message || 'Unknown error' });
    }
  }

  private async handleStopActor(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { actor_id } = call.request;
      await this.actorSystem.stop({ id: actor_id });
      
      // Notify watchers
      this.notifyWatchers(actor_id, 'STOPPED');
      
      callback(null, { success: true });
    } catch (error: any) {
      console.error('Stop actor error:', error);
      callback(null, { success: false, error: error.message || 'Unknown error' });
    }
  }

  private handleWatchActor(call: grpc.ServerWritableStream<any, any>) {
    const { actor_id, watcher_id } = call.request;
    
    // Add watcher
    if (!this.watchedActors.has(actor_id)) {
      this.watchedActors.set(actor_id, new Set());
    }
    this.watchedActors.get(actor_id)!.add(watcher_id);

    // Store the stream
    this.watchStreams.set(watcher_id, call);

    // Send initial status
    const actor = this.actorSystem.getActor(actor_id);
    if (actor) {
      call.write({
        actor_id,
        event_type: 'STARTED',
        error: null
      });
    }

    // Handle call end
    call.on('cancelled', () => {
      const watchers = this.watchedActors.get(actor_id);
      if (watchers) {
        watchers.delete(watcher_id);
        if (watchers.size === 0) {
          this.watchedActors.delete(actor_id);
        }
      }
      this.watchStreams.delete(watcher_id);
    });
  }

  private notifyWatchers(actorId: string, eventType: string, error?: string) {
    const watchers = this.watchedActors.get(actorId);
    if (watchers) {
      const event = {
        actor_id: actorId,
        event_type: eventType,
        error: error || null
      };

      watchers.forEach(watcherId => {
        const stream = this.watchStreams.get(watcherId);
        if (stream) {
          stream.write(event);
        }
      });
    }
  }

  private getActorClass(className: string): any {
    return actorRegistry.get(className);
  }

  private getMailboxType(typeName: string): any {
    switch (typeName.toLowerCase()) {
      case 'priority':
        return PriorityMailbox;
      case 'default':
      default:
        return DefaultMailbox;
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Clean up all watch streams
      this.watchStreams.forEach(stream => {
        try {
          stream.end();
        } catch (error) {
          console.error('Error closing watch stream:', error);
        }
      });
      this.watchStreams.clear();
      this.watchedActors.clear();

      this.server.tryShutdown(() => {
        resolve();
      });
    });
  }
} 