import type { PID } from './types';

export interface ActorClient {
    connect(address: string): Promise<void>;
    disconnect(): Promise<void>;
    spawn(actorClass: any, props?: any): Promise<PID>;
    send(pid: PID, message: any): Promise<void>;
    spawnActor(className: string): Promise<PID>;
    stopActor(actorId: string): Promise<void>;
    sendMessage(actorId: string, message: any): Promise<void>;
    watchActor(actorId: string, watcherId: string): void;
}

export interface ActorServer {
    start(port: number): Promise<void>;
    stop(): Promise<void>;
    getAddress(): string;
    registerActor(name: string, actorClass: any): void;
}

export interface RemoteActorFactory {
    createClient(address: string): ActorClient;
    createServer(address: string): ActorServer;
} 