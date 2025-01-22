// Original file: src/remote/protos/actor.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { MessageRequest as _actor_MessageRequest, MessageRequest__Output as _actor_MessageRequest__Output } from '../actor/MessageRequest';
import type { MessageResponse as _actor_MessageResponse, MessageResponse__Output as _actor_MessageResponse__Output } from '../actor/MessageResponse';
import type { SpawnRequest as _actor_SpawnRequest, SpawnRequest__Output as _actor_SpawnRequest__Output } from '../actor/SpawnRequest';
import type { SpawnResponse as _actor_SpawnResponse, SpawnResponse__Output as _actor_SpawnResponse__Output } from '../actor/SpawnResponse';
import type { StopRequest as _actor_StopRequest, StopRequest__Output as _actor_StopRequest__Output } from '../actor/StopRequest';
import type { StopResponse as _actor_StopResponse, StopResponse__Output as _actor_StopResponse__Output } from '../actor/StopResponse';
import type { WatchEvent as _actor_WatchEvent, WatchEvent__Output as _actor_WatchEvent__Output } from '../actor/WatchEvent';
import type { WatchRequest as _actor_WatchRequest, WatchRequest__Output as _actor_WatchRequest__Output } from '../actor/WatchRequest';

export interface ActorServiceClient extends grpc.Client {
  SendMessage(argument: _actor_MessageRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_MessageResponse__Output>): grpc.ClientUnaryCall;
  SendMessage(argument: _actor_MessageRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_actor_MessageResponse__Output>): grpc.ClientUnaryCall;
  SendMessage(argument: _actor_MessageRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_MessageResponse__Output>): grpc.ClientUnaryCall;
  SendMessage(argument: _actor_MessageRequest, callback: grpc.requestCallback<_actor_MessageResponse__Output>): grpc.ClientUnaryCall;
  sendMessage(argument: _actor_MessageRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_MessageResponse__Output>): grpc.ClientUnaryCall;
  sendMessage(argument: _actor_MessageRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_actor_MessageResponse__Output>): grpc.ClientUnaryCall;
  sendMessage(argument: _actor_MessageRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_MessageResponse__Output>): grpc.ClientUnaryCall;
  sendMessage(argument: _actor_MessageRequest, callback: grpc.requestCallback<_actor_MessageResponse__Output>): grpc.ClientUnaryCall;
  
  SpawnActor(argument: _actor_SpawnRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_SpawnResponse__Output>): grpc.ClientUnaryCall;
  SpawnActor(argument: _actor_SpawnRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_actor_SpawnResponse__Output>): grpc.ClientUnaryCall;
  SpawnActor(argument: _actor_SpawnRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_SpawnResponse__Output>): grpc.ClientUnaryCall;
  SpawnActor(argument: _actor_SpawnRequest, callback: grpc.requestCallback<_actor_SpawnResponse__Output>): grpc.ClientUnaryCall;
  spawnActor(argument: _actor_SpawnRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_SpawnResponse__Output>): grpc.ClientUnaryCall;
  spawnActor(argument: _actor_SpawnRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_actor_SpawnResponse__Output>): grpc.ClientUnaryCall;
  spawnActor(argument: _actor_SpawnRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_SpawnResponse__Output>): grpc.ClientUnaryCall;
  spawnActor(argument: _actor_SpawnRequest, callback: grpc.requestCallback<_actor_SpawnResponse__Output>): grpc.ClientUnaryCall;
  
  StopActor(argument: _actor_StopRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_StopResponse__Output>): grpc.ClientUnaryCall;
  StopActor(argument: _actor_StopRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_actor_StopResponse__Output>): grpc.ClientUnaryCall;
  StopActor(argument: _actor_StopRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_StopResponse__Output>): grpc.ClientUnaryCall;
  StopActor(argument: _actor_StopRequest, callback: grpc.requestCallback<_actor_StopResponse__Output>): grpc.ClientUnaryCall;
  stopActor(argument: _actor_StopRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_StopResponse__Output>): grpc.ClientUnaryCall;
  stopActor(argument: _actor_StopRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_actor_StopResponse__Output>): grpc.ClientUnaryCall;
  stopActor(argument: _actor_StopRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_actor_StopResponse__Output>): grpc.ClientUnaryCall;
  stopActor(argument: _actor_StopRequest, callback: grpc.requestCallback<_actor_StopResponse__Output>): grpc.ClientUnaryCall;
  
  WatchActor(argument: _actor_WatchRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_actor_WatchEvent__Output>;
  WatchActor(argument: _actor_WatchRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_actor_WatchEvent__Output>;
  watchActor(argument: _actor_WatchRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_actor_WatchEvent__Output>;
  watchActor(argument: _actor_WatchRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_actor_WatchEvent__Output>;
  
}

export interface ActorServiceHandlers extends grpc.UntypedServiceImplementation {
  SendMessage: grpc.handleUnaryCall<_actor_MessageRequest__Output, _actor_MessageResponse>;
  
  SpawnActor: grpc.handleUnaryCall<_actor_SpawnRequest__Output, _actor_SpawnResponse>;
  
  StopActor: grpc.handleUnaryCall<_actor_StopRequest__Output, _actor_StopResponse>;
  
  WatchActor: grpc.handleServerStreamingCall<_actor_WatchRequest__Output, _actor_WatchEvent>;
  
}

export interface ActorServiceDefinition extends grpc.ServiceDefinition {
  SendMessage: MethodDefinition<_actor_MessageRequest, _actor_MessageResponse, _actor_MessageRequest__Output, _actor_MessageResponse__Output>
  SpawnActor: MethodDefinition<_actor_SpawnRequest, _actor_SpawnResponse, _actor_SpawnRequest__Output, _actor_SpawnResponse__Output>
  StopActor: MethodDefinition<_actor_StopRequest, _actor_StopResponse, _actor_StopRequest__Output, _actor_StopResponse__Output>
  WatchActor: MethodDefinition<_actor_WatchRequest, _actor_WatchEvent, _actor_WatchRequest__Output, _actor_WatchEvent__Output>
}
