// Original file: src/remote/protos/actor.proto

import type { EventType as _actor_EventType, EventType__Output as _actor_EventType__Output } from '../actor/EventType';

export interface WatchEvent {
  'actorId'?: (string);
  'eventType'?: (_actor_EventType);
  'error'?: (string);
}

export interface WatchEvent__Output {
  'actorId': (string);
  'eventType': (_actor_EventType__Output);
  'error': (string);
}
