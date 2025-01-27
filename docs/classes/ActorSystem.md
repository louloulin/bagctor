[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / ActorSystem

# Class: ActorSystem

Defined in: core/system.ts:8

## Extended by

- [`RemoteActorSystem`](RemoteActorSystem.md)

## Constructors

### new ActorSystem()

> **new ActorSystem**(`address`?): [`ActorSystem`](ActorSystem.md)

Defined in: core/system.ts:17

#### Parameters

##### address?

`string`

#### Returns

[`ActorSystem`](ActorSystem.md)

## Properties

### address?

> `protected` `optional` **address**: `string`

Defined in: core/system.ts:17

## Methods

### addMessageHandler()

> **addMessageHandler**(`handler`): `void`

Defined in: core/system.ts:210

#### Parameters

##### handler

(`message`) => `Promise`\<`void`\>

#### Returns

`void`

***

### broadcast()

> **broadcast**(`message`): `Promise`\<`void`\>

Defined in: core/system.ts:220

#### Parameters

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`Promise`\<`void`\>

***

### getActor()

> **getActor**(`actorId`): `undefined` \| [`Actor`](Actor.md)

Defined in: core/system.ts:182

#### Parameters

##### actorId

`string`

#### Returns

`undefined` \| [`Actor`](Actor.md)

***

### getActorClass()

> **getActorClass**(`className`): `undefined` \| (`context`) => [`Actor`](Actor.md)

Defined in: core/system.ts:186

#### Parameters

##### className

`string`

#### Returns

`undefined` \| (`context`) => [`Actor`](Actor.md)

***

### removeMessageHandler()

> **removeMessageHandler**(`handler`): `void`

Defined in: core/system.ts:215

#### Parameters

##### handler

(`message`) => `Promise`\<`void`\>

#### Returns

`void`

***

### restart()

> **restart**(`pid`, `reason`): `Promise`\<`void`\>

Defined in: core/system.ts:156

#### Parameters

##### pid

[`PID`](../interfaces/PID.md)

##### reason

`Error`

#### Returns

`Promise`\<`void`\>

***

### send()

> **send**(`pid`, `message`): `Promise`\<`void`\>

Defined in: core/system.ts:129

#### Parameters

##### pid

[`PID`](../interfaces/PID.md)

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`Promise`\<`void`\>

***

### spawn()

> **spawn**(`props`): `Promise`\<[`PID`](../interfaces/PID.md)\>

Defined in: core/system.ts:74

#### Parameters

##### props

[`Props`](../interfaces/Props.md)

#### Returns

`Promise`\<[`PID`](../interfaces/PID.md)\>

***

### start()

> **start**(): `Promise`\<`void`\>

Defined in: core/system.ts:23

#### Returns

`Promise`\<`void`\>

***

### stop()

> **stop**(`pid`?): `Promise`\<`void`\>

Defined in: core/system.ts:33

#### Parameters

##### pid?

[`PID`](../interfaces/PID.md)

#### Returns

`Promise`\<`void`\>

***

### watchActor()

> **watchActor**(`pid`, `watcherId`): `void`

Defined in: core/system.ts:200

#### Parameters

##### pid

[`PID`](../interfaces/PID.md)

##### watcherId

`string`

#### Returns

`void`
