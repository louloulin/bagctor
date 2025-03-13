// Original file: src/remote/protos/actor.proto

export const EventType = {
  STARTED: 'STARTED',
  STOPPED: 'STOPPED',
  RESTARTED: 'RESTARTED',
  FAILED: 'FAILED',
} as const;

export type EventType =
  | 'STARTED'
  | 0
  | 'STOPPED'
  | 1
  | 'RESTARTED'
  | 2
  | 'FAILED'
  | 3

export type EventType__Output = typeof EventType[keyof typeof EventType]
