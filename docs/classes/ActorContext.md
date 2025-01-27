[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / ActorContext

# Class: ActorContext

Defined in: core/context.ts:5

## Implements

- `ActorContext`

## Constructors

### new ActorContext()

> **new ActorContext**(`pid`, `system`, `mailboxType`?, `supervisorStrategy`?): [`ActorContext`](ActorContext.md)

Defined in: core/context.ts:11

#### Parameters

##### pid

[`PID`](../interfaces/PID.md)

##### system

[`ActorSystem`](ActorSystem.md)

##### mailboxType?

() => `IMailbox`

##### supervisorStrategy?

`any`

#### Returns

[`ActorContext`](ActorContext.md)

## Accessors

### self

#### Get Signature

> **get** **self**(): [`PID`](../interfaces/PID.md)

Defined in: core/context.ts:21

##### Returns

[`PID`](../interfaces/PID.md)

## Methods

### getParent()

> **getParent**(): `undefined` \| [`PID`](../interfaces/PID.md)

Defined in: core/context.ts:29

#### Returns

`undefined` \| [`PID`](../interfaces/PID.md)

***

### getPID()

> **getPID**(): [`PID`](../interfaces/PID.md)

Defined in: core/context.ts:25

#### Returns

[`PID`](../interfaces/PID.md)

***

### handleFailure()

> **handleFailure**(`child`, `error`): `Promise`\<`void`\>

Defined in: core/context.ts:64

#### Parameters

##### child

[`PID`](../interfaces/PID.md)

##### error

`Error`

#### Returns

`Promise`\<`void`\>

***

### send()

> **send**(`target`, `message`): `Promise`\<`void`\>

Defined in: core/context.ts:37

#### Parameters

##### target

[`PID`](../interfaces/PID.md)

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`Promise`\<`void`\>

***

### setParent()

> **setParent**(`pid`): `void`

Defined in: core/context.ts:33

#### Parameters

##### pid

[`PID`](../interfaces/PID.md)

#### Returns

`void`

***

### spawn()

> **spawn**(`props`): `Promise`\<[`PID`](../interfaces/PID.md)\>

Defined in: core/context.ts:44

#### Parameters

##### props

[`Props`](../interfaces/Props.md)

#### Returns

`Promise`\<[`PID`](../interfaces/PID.md)\>

***

### stop()

> **stop**(`pid`): `Promise`\<`void`\>

Defined in: core/context.ts:53

#### Parameters

##### pid

[`PID`](../interfaces/PID.md)

#### Returns

`Promise`\<`void`\>

***

### stopAll()

> **stopAll**(): `Promise`\<`void`\>

Defined in: core/context.ts:58

#### Returns

`Promise`\<`void`\>
