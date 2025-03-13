import * as grpc from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import path from 'path';
import { log, Message, PID, ActorServer } from '@bactor/common';
import { Actor, ActorContext, DefaultMailbox, ActorSystem } from '@bactor/core';

interface ActorService {
  service: {
    spawnActor: grpc.MethodDefinition<any, any>;
    stopActor: grpc.MethodDefinition<any, any>;
    sendMessage: grpc.MethodDefinition<any, any>;
    watchActor: grpc.MethodDefinition<any, any>;
  };
}

interface ActorProto {
  actor: {
    ActorService: ActorService;
  };
}

export class GrpcActorServer implements ActorServer {
  private server: grpc.Server;
  private actors: Map<string, Actor>;
  private mailboxes: Map<string, DefaultMailbox>;
  private actorClasses: Map<string, new (context: ActorContext) => Actor>;
  private address: string;
  private system: ActorSystem;

  constructor(address: string) {
    this.address = address;
    this.server = new grpc.Server();
    this.actors = new Map();
    this.mailboxes = new Map();
    this.actorClasses = new Map();
    this.system = new ActorSystem(address);
  }

  async start(port: number): Promise<void> {
    const PROTO_PATH = path.resolve(__dirname, '../protos/actor.proto');
    const packageDefinition = loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as ActorProto;
    this.server.addService(proto.actor.ActorService.service, {
      spawnActor: this.handleSpawnActor.bind(this),
      stopActor: this.handleStopActor.bind(this),
      sendMessage: this.handleSendMessage.bind(this),
      watchActor: this.handleWatchActor.bind(this)
    });

    return new Promise((resolve, reject) => {
      this.server.bindAsync(`${this.address}:${port}`, grpc.ServerCredentials.createInsecure(), (error, port) => {
        if (error) {
          reject(error);
          return;
        }
        this.server.start();
        log.info('gRPC server started', { address: this.address, port });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        log.info('gRPC server stopped');
        resolve();
      });
    });
  }

  registerActor(name: string, actorClass: new (context: ActorContext) => Actor): void {
    this.actorClasses.set(name, actorClass);
    log.info('Actor class registered', { name });
  }

  getAddress(): string {
    return this.address;
  }

  private handleSpawnActor(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void {
    const { className } = call.request;
    const actorClass = this.actorClasses.get(className);

    if (!actorClass) {
      callback(new Error(`Actor class '${className}' not found`));
      return;
    }

    const actorId = { id: `${className}_${Date.now()}`, address: this.address };
    const mailbox = new DefaultMailbox();
    const context = new ActorContext(actorId, this.system);
    const actor = new actorClass(context);

    this.actors.set(actorId.id, actor);
    this.mailboxes.set(actorId.id, mailbox);

    log.info('Actor spawned', { actorId: actorId.id, className });
    callback(null, { id: actorId.id, address: this.address });
  }

  private handleStopActor(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void {
    const { actorId } = call.request;
    const actor = this.actors.get(actorId);
    const mailbox = this.mailboxes.get(actorId);

    if (actor && mailbox) {
      this.actors.delete(actorId);
      this.mailboxes.delete(actorId);
      log.info('Actor stopped', { actorId });
      callback(null, {});
    } else {
      callback(new Error(`Actor ${actorId} not found`));
    }
  }

  private handleSendMessage(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>): void {
    const { actorId, message } = call.request;
    const actor = this.actors.get(actorId);

    if (!actor) {
      callback(new Error(`Actor ${actorId} not found`));
      return;
    }

    try {
      actor.receive(message);
      log.info('Message sent to actor', { actorId, messageType: message.type });
      callback(null, {});
    } catch (error) {
      callback(error as Error);
    }
  }

  private handleWatchActor(call: grpc.ServerWritableStream<any, any>): void {
    const { actorId, watcherId } = call.request;
    const actor = this.actors.get(actorId);

    if (!actor) {
      call.emit('error', new Error(`Actor ${actorId} not found`));
      return;
    }

    const listener = (event: any) => {
      call.write(event);
    };

    this.system.addMessageHandler(async (message: Message) => {
      if (message.sender?.id === actorId) {
        listener(message);
      }
    });

    call.on('cancelled', () => {
      // Clean up message handler when watch is cancelled
      this.system.removeMessageHandler(async (message: Message) => {
        if (message.sender?.id === actorId) {
          listener(message);
        }
      });
    });

    log.info('Actor watch started', { actorId, watcherId });
  }
} 