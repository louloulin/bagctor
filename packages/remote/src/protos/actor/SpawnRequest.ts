// Original file: src/remote/protos/actor.proto


export interface SpawnRequest {
  'actorClass'?: (string);
  'initPayload'?: (Buffer | Uint8Array | string);
  'parentId'?: (string);
  'mailboxType'?: (string);
}

export interface SpawnRequest__Output {
  'actorClass': (string);
  'initPayload': (Buffer);
  'parentId': (string);
  'mailboxType': (string);
}
