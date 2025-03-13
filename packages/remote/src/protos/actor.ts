import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { ActorServiceClient as _actor_ActorServiceClient, ActorServiceDefinition as _actor_ActorServiceDefinition } from './actor/ActorService';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  actor: {
    ActorService: SubtypeConstructor<typeof grpc.Client, _actor_ActorServiceClient> & { service: _actor_ActorServiceDefinition }
    EventType: EnumTypeDefinition
    MessageRequest: MessageTypeDefinition
    MessageResponse: MessageTypeDefinition
    SpawnRequest: MessageTypeDefinition
    SpawnResponse: MessageTypeDefinition
    StopRequest: MessageTypeDefinition
    StopResponse: MessageTypeDefinition
    WatchEvent: MessageTypeDefinition
    WatchRequest: MessageTypeDefinition
  }
}

