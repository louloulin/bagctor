[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / ActorClient

# Class: ActorClient

Defined in: remote/client.ts:11

## Constructors

### new ActorClient()

> **new ActorClient**(`address`): [`ActorClient`](ActorClient.md)

Defined in: remote/client.ts:15

#### Parameters

##### address

`string`

#### Returns

[`ActorClient`](ActorClient.md)

## Methods

### close()

> **close**(): `void`

Defined in: remote/client.ts:116

#### Returns

`void`

***

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: remote/client.ts:22

#### Returns

`Promise`\<`void`\>

***

### onActorEvent()

> **onActorEvent**(`actorId`, `callback`): `void`

Defined in: remote/client.ts:109

#### Parameters

##### actorId

`string`

##### callback

(`event`) => `void`

#### Returns

`void`

***

### sendMessage()

> **sendMessage**(`actorId`, `message`): `Promise`\<`void`\>

Defined in: remote/client.ts:49

#### Parameters

##### actorId

`string`

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`Promise`\<`void`\>

***

### spawnActor()

> **spawnActor**(`className`): `Promise`\<[`PID`](../interfaces/PID.md)\>

Defined in: remote/client.ts:34

#### Parameters

##### className

`string`

#### Returns

`Promise`\<[`PID`](../interfaces/PID.md)\>

***

### stopActor()

> **stopActor**(`actorId`): `Promise`\<`void`\>

Defined in: remote/client.ts:73

#### Parameters

##### actorId

`string`

#### Returns

`Promise`\<`void`\>

***

### watchActor()

> **watchActor**(`actorId`, `watcherId`): `void`

Defined in: remote/client.ts:85

#### Parameters

##### actorId

`string`

##### watcherId

`string`

#### Returns

`void`
