[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / ActorServer

# Class: ActorServer

Defined in: remote/server.ts:44

## Constructors

### new ActorServer()

> **new ActorServer**(`address`): [`ActorServer`](ActorServer.md)

Defined in: remote/server.ts:51

#### Parameters

##### address

`string`

#### Returns

[`ActorServer`](ActorServer.md)

## Methods

### notifyActorRestarted()

> **notifyActorRestarted**(`actorId`): `void`

Defined in: remote/server.ts:266

#### Parameters

##### actorId

`string`

#### Returns

`void`

***

### notifyActorTerminated()

> **notifyActorTerminated**(`actorId`): `void`

Defined in: remote/server.ts:258

#### Parameters

##### actorId

`string`

#### Returns

`void`

***

### registerActor()

> **registerActor**(`name`, `actorClass`): `void`

Defined in: remote/server.ts:61

#### Parameters

##### name

`string`

##### actorClass

(`context`) => `any`

#### Returns

`void`

***

### start()

> **start**(): `Promise`\<`void`\>

Defined in: remote/server.ts:65

#### Returns

`Promise`\<`void`\>

***

### stop()

> **stop**(): `Promise`\<`void`\>

Defined in: remote/server.ts:81

#### Returns

`Promise`\<`void`\>
