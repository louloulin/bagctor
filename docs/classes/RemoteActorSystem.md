[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / RemoteActorSystem

# Class: RemoteActorSystem

Defined in: remote/remote\_actor\_system.ts:5

## Extends

- [`ActorSystem`](ActorSystem.md)

## Constructors

### new RemoteActorSystem()

> **new RemoteActorSystem**(`address`?): [`RemoteActorSystem`](RemoteActorSystem.md)

Defined in: remote/remote\_actor\_system.ts:8

#### Parameters

##### address?

`string`

#### Returns

[`RemoteActorSystem`](RemoteActorSystem.md)

#### Overrides

[`ActorSystem`](ActorSystem.md).[`constructor`](ActorSystem.md#constructors)

## Properties

### address?

> `protected` `optional` **address**: `string`

Defined in: core/system.ts:17

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`address`](ActorSystem.md#address-1)

***

### remotes

> `protected` **remotes**: `Map`\<`string`, [`RemoteTransport`](../interfaces/RemoteTransport.md)\>

Defined in: remote/remote\_actor\_system.ts:6

## Methods

### addMessageHandler()

> **addMessageHandler**(`handler`): `void`

Defined in: core/system.ts:210

#### Parameters

##### handler

(`message`) => `Promise`\<`void`\>

#### Returns

`void`

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`addMessageHandler`](ActorSystem.md#addmessagehandler)

***

### broadcast()

> **broadcast**(`message`): `Promise`\<`void`\>

Defined in: core/system.ts:220

#### Parameters

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`broadcast`](ActorSystem.md#broadcast)

***

### getActor()

> **getActor**(`actorId`): `undefined` \| [`Actor`](Actor.md)

Defined in: core/system.ts:182

#### Parameters

##### actorId

`string`

#### Returns

`undefined` \| [`Actor`](Actor.md)

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`getActor`](ActorSystem.md#getactor)

***

### getActorClass()

> **getActorClass**(`className`): `undefined` \| (`context`) => [`Actor`](Actor.md)

Defined in: core/system.ts:186

#### Parameters

##### className

`string`

#### Returns

`undefined` \| (`context`) => [`Actor`](Actor.md)

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`getActorClass`](ActorSystem.md#getactorclass)

***

### registerRemote()

> **registerRemote**(`address`, `transport`): `void`

Defined in: remote/remote\_actor\_system.ts:23

#### Parameters

##### address

`string`

##### transport

[`RemoteTransport`](../interfaces/RemoteTransport.md)

#### Returns

`void`

***

### removeMessageHandler()

> **removeMessageHandler**(`handler`): `void`

Defined in: core/system.ts:215

#### Parameters

##### handler

(`message`) => `Promise`\<`void`\>

#### Returns

`void`

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`removeMessageHandler`](ActorSystem.md#removemessagehandler)

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

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`restart`](ActorSystem.md#restart)

***

### send()

> **send**(`pid`, `message`): `Promise`\<`void`\>

Defined in: remote/remote\_actor\_system.ts:12

#### Parameters

##### pid

[`PID`](../interfaces/PID.md)

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`ActorSystem`](ActorSystem.md).[`send`](ActorSystem.md#send)

***

### spawn()

> **spawn**(`props`): `Promise`\<[`PID`](../interfaces/PID.md)\>

Defined in: core/system.ts:74

#### Parameters

##### props

[`Props`](../interfaces/Props.md)

#### Returns

`Promise`\<[`PID`](../interfaces/PID.md)\>

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`spawn`](ActorSystem.md#spawn)

***

### start()

> **start**(): `Promise`\<`void`\>

Defined in: core/system.ts:23

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`start`](ActorSystem.md#start)

***

### stop()

> **stop**(`pid`?): `Promise`\<`void`\>

Defined in: core/system.ts:33

#### Parameters

##### pid?

[`PID`](../interfaces/PID.md)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`stop`](ActorSystem.md#stop)

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

#### Inherited from

[`ActorSystem`](ActorSystem.md).[`watchActor`](ActorSystem.md#watchactor)
