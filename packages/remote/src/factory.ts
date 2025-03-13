import { RemoteActorFactory, ActorClient, ActorServer } from '@bactor/common';
import { GrpcActorClient } from './client';
import { GrpcActorServer } from './server';

export class GrpcRemoteActorFactory implements RemoteActorFactory {
    createClient(address: string): ActorClient {
        return new GrpcActorClient(address);
    }

    createServer(address: string): ActorServer {
        return new GrpcActorServer(address);
    }
} 