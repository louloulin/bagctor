import { v4 as uuidv4 } from 'uuid';
import { Message, PID, Props } from './types';
import { Actor } from './actor';
import { ActorContext } from './context';
import { ActorClient } from '../remote/client';
import { ActorServer } from '../remote/server';

export class ActorSystem {
  private actors: Map<string, Actor> = new Map();
  private contexts: Map<string, ActorContext> = new Map();
  private deadLetters: Message[] = [];
  private remoteClients: Map<string, ActorClient> = new Map();
  private server?: ActorServer;
  private actorClasses: Map<string, new (context: ActorContext) => Actor> = new Map();

  constructor(protected address?: string) {
    if (address) {
      this.server = new ActorServer(address);
    }
  }

  async start(): Promise<void> {
    if (this.server) {
      // Register all known actor classes with the server
      for (const [name, actorClass] of this.actorClasses) {
        this.server.registerActor(name, actorClass);
      }
      await this.server.start();
    }
  }

  async stop(pid?: PID): Promise<void> {
    if (pid) {
      // Stop specific actor
      if (pid.address && pid.address !== this.address) {
        const client = await this.getOrCreateClient(pid.address);
        await client.stopActor(pid.id);
        return;
      }

      // Local actor stopping
      const actor = this.actors.get(pid.id);
      const context = this.contexts.get(pid.id);
      
      if (actor && context) {
        try {
          await context.stopAll(); // Stop all children first
          await actor.postStop();
        } finally {
          this.actors.delete(pid.id);
          this.contexts.delete(pid.id);
        }
      }
    } else {
      // Stop entire system
      // Stop all remote clients
      for (const client of this.remoteClients.values()) {
        client.close();
      }
      this.remoteClients.clear();

      // Stop server if running
      if (this.server) {
        await this.server.stop();
      }

      // Stop all local actors
      const pids = Array.from(this.actors.keys()).map(id => ({ id }));
      await Promise.all(pids.map(pid => this.stop(pid)));
    }
  }
  
  async spawn(props: Props): Promise<PID> {
    // Handle remote actor spawning
    if (props.address) {
      const client = await this.getOrCreateClient(props.address);
      const className = props.actorClass ? props.actorClass.name : 'FunctionalActor';
      return await client.spawnActor(className);
    }

    // Local actor spawning
    const pid: PID = { 
      id: uuidv4(),
      address: this.address 
    };
    
    const context = new ActorContext(pid, this, props.mailboxType, props.supervisorStrategy);
    
    let actor: Actor;
    if (props.actorClass) {
      // Class-based actor
      actor = new props.actorClass(context);
      // Register for remote spawning
      const className = props.actorClass.name;
      if (!this.actorClasses.has(className)) {
        this.actorClasses.set(className, props.actorClass);
      }
    } else if (props.producer) {
      // Function-based actor
      actor = props.producer();
      if (actor instanceof Actor) {
        // Set context if actor extends Actor
        Object.defineProperty(actor, 'context', {
          value: context,
          writable: false,
          enumerable: true
        });
      }
    } else {
      throw new Error('Props must have either actorClass or producer defined');
    }
    
    this.actors.set(pid.id, actor);
    this.contexts.set(pid.id, context);
    
    try {
      await actor.preStart();
    } catch (error) {
      await this.handlePreStartError(pid, error as Error);
      throw error;
    }
    
    return pid;
  }

  async send(pid: PID, message: Message): Promise<void> {
    // Handle remote message sending
    if (pid.address && pid.address !== this.address) {
      const client = await this.getOrCreateClient(pid.address);
      await client.sendMessage(pid.id, {
        ...message,
        sender: message.sender ? {
          ...message.sender,
          address: this.address
        } : undefined
      });
      return;
    }

    // Local message sending
    const actor = this.actors.get(pid.id);
    if (actor) {
      try {
        await actor.receive(message);
      } catch (error) {
        await this.handleActorError(pid, error as Error);
      }
    } else {
      this.deadLetters.push(message);
    }
  }

  async restart(pid: PID, reason: Error): Promise<void> {
    const actor = this.actors.get(pid.id);
    if (actor) {
      try {
        await actor.preRestart(reason);
        await actor.postRestart(reason);
      } catch (error) {
        await this.handleActorError(pid, error as Error);
      }
    }
  }

  private async handlePreStartError(pid: PID, error: Error): Promise<void> {
    const context = this.contexts.get(pid.id);
    if (context) {
      await context.handleFailure(pid, error);
    }
  }

  private async handleActorError(pid: PID, error: Error): Promise<void> {
    const context = this.contexts.get(pid.id);
    if (context) {
      await context.handleFailure(pid, error);
    }
  }

  getActor(actorId: string): Actor | undefined {
    return this.actors.get(actorId);
  }

  getActorClass(className: string): (new (context: ActorContext) => Actor) | undefined {
    return this.actorClasses.get(className);
  }

  private async getOrCreateClient(address: string): Promise<ActorClient> {
    let client = this.remoteClients.get(address);
    if (!client) {
      client = new ActorClient(address);
      await client.connect();
      this.remoteClients.set(address, client);
    }
    return client;
  }

  watchActor(pid: PID, watcherId: string): void {
    if (pid.address && pid.address !== this.address) {
      const client = this.remoteClients.get(pid.address);
      if (client) {
        client.watchActor(pid.id, watcherId);
      }
    }
  }
} 