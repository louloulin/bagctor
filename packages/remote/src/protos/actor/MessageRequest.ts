// Original file: src/remote/protos/actor.proto


export interface MessageRequest {
  'targetId'?: (string);
  'type'?: (string);
  'payload'?: (Buffer | Uint8Array | string);
  'senderId'?: (string);
}

export interface MessageRequest__Output {
  'targetId': (string);
  'type': (string);
  'payload': (Buffer);
  'senderId': (string);
}
