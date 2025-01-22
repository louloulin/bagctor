import { Server, ServerCredentials } from '@grpc/grpc-js';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { ProtoGrpcType } from './protos/actor';
import { Actor, Message, PID } from '../core/types';
import { ActorContext } from '../core/context';
import { DefaultMailbox } from '../core/mailbox';
import path from 'path';

const PROTO_PATH = path.resolve(__dirname, './protos/actor.proto');
const packageDefinition = loadSync(PROTO_PATH);
const proto = loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;

export class ActorServer {
  private server: Server;
  private actorClasses: Map<string, new (context: ActorContext) => Actor> = new Map();
  private actors: Map<string, Actor> = new Map();
  private contexts: Map<string, ActorContext> = new Map();
  private watchCallbacks: Map<string, Set<(event: string) => void>> = new Map();

  constructor(private address: string) {
    this.server = new Server();
    this.server.addService(proto.actor.ActorService.service, {
      spawnActor: this.handleSpawnActor.bind(this),
      sendMessage: this.handleSendMessage.bind(this),
      stopActor: this.handleStopActor.bind(this),
      watchActor: this.handleWatchActor.bind(this)
    });
  }

  registerActor(name: string, actorClass: new (context: ActorContext) => Actor): void {
    this.actorClasses.set(name, actorClass);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        this.address,
        ServerCredentials.createInsecure(),
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        resolve();
      });
    });
  }

  private async handleSpawnActor(call: any, callback: any): Promise<void> {
    try {
      const { className } = call.request;
      const actorClass = this.actorClasses.get(className);

      if (!actorClass) {
        callback(new Error(`Actor class ${className} not found`));
        return;
      }

      const pid: PID = { id: call.request.id || crypto.randomUUID(), address: this.address };
      const context = new ActorContext(pid, this as any, DefaultMailbox);
      const actor = new actorClass(context);

      this.actors.set(pid.id, actor);
      this.contexts.set(pid.id, context);

      try {
        await actor.preStart();
        callback(null, { id: pid.id, address: pid.address });
      } catch (error) {
        callback(error);
      }
    } catch (error) {
      callback(error);
    }
  }

  private async handleSendMessage(call: any, callback: any): Promise<void> {
    try {
      const { actorId, message } = call.request;
      const actor = this.actors.get(actorId);

      if (!actor) {
        callback(new Error(`Actor ${actorId} not found`));
        return;
      }

      const deserializedMessage: Message = {
        ...message,
        sender: message.sender ? {
          ...message.sender,
          address: message.sender.address
        } : undefined
      };

      try {
        await actor.receive(deserializedMessage);
        callback(null, {});
      } catch (error) {
        callback(error);
      }
    } catch (error) {
      callback(error);
    }
  }

  private async handleStopActor(call: any, callback: any): Promise<void> {
    try {
      const { actorId } = call.request;
      const actor = this.actors.get(actorId);
      const context = this.contexts.get(actorId);

      if (!actor || !context) {
        callback(new Error(`Actor ${actorId} not found`));
        return;
      }

      try {
        await context.stopAll(); // Stop all children first
        await actor.postStop();
        this.actors.delete(actorId);
        this.contexts.delete(actorId);
        callback(null, {});
      } catch (error) {
        callback(error);
      }
    } catch (error) {
      callback(error);
    }
  }

  private handleWatchActor(call: any): void {
    const { actorId, watcherId } = call.request;
    const actor = this.actors.get(actorId);
    const context = this.contexts.get(actorId);

    if (!actor || !context) {
      call.write({ type: 'terminated', actorId });
      call.end();
      return;
    }

    // Set up monitoring callbacks
    if (!this.watchCallbacks.has(actorId)) {
      this.watchCallbacks.set(actorId, new Set());
    }

    const callbacks = this.watchCallbacks.get(actorId)!;
    const terminatedCallback = () => {
      call.write({ type: 'terminated', actorId });
      call.end();
      callbacks.delete(terminatedCallback);
      callbacks.delete(restartedCallback);
    };

    const restartedCallback = () => {
      call.write({ type: 'restarted', actorId });
    };

    callbacks.add(terminatedCallback);
    callbacks.add(restartedCallback);

    // Clean up on stream end
    call.on('end', () => {
      callbacks.delete(terminatedCallback);
      callbacks.delete(restartedCallback);
    });
  }

  notifyActorTerminated(actorId: string): void {
    const callbacks = this.watchCallbacks.get(actorId);
    if (callbacks) {
      callbacks.forEach(callback => callback('terminated'));
    }
  }

  notifyActorRestarted(actorId: string): void {
    const callbacks = this.watchCallbacks.get(actorId);
    if (callbacks) {
      callbacks.forEach(callback => callback('restarted'));
    }
  }
} 