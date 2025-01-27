[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / Actor

# Class: `abstract` Actor

Defined in: core/actor.ts:3

## Constructors

### new Actor()

> **new Actor**(`context`): [`Actor`](Actor.md)

Defined in: core/actor.ts:8

#### Parameters

##### context

`any`

#### Returns

[`Actor`](Actor.md)

## Properties

### behaviorMap

> `protected` **behaviorMap**: `Map`\<`string`, (`message`) => `Promise`\<`void`\>\>

Defined in: core/actor.ts:6

***

### context

> `protected` **context**: `any`

Defined in: core/actor.ts:4

***

### state

> `protected` **state**: `ActorState`

Defined in: core/actor.ts:5

## Methods

### addBehavior()

> `protected` **addBehavior**(`name`, `handler`): `void`

Defined in: core/actor.ts:23

#### Parameters

##### name

`string`

##### handler

(`message`) => `Promise`\<`void`\>

#### Returns

`void`

***

### become()

> `protected` **become**(`behavior`): `void`

Defined in: core/actor.ts:27

#### Parameters

##### behavior

`string`

#### Returns

`void`

***

### behaviors()

> `abstract` `protected` **behaviors**(): `void`

Defined in: core/actor.ts:17

#### Returns

`void`

***

### getState()

> `protected` **getState**(): `any`

Defined in: core/actor.ts:74

#### Returns

`any`

***

### initialize()

> `protected` **initialize**(): `void`

Defined in: core/actor.ts:19

#### Returns

`void`

***

### postRestart()

> **postRestart**(`reason`): `Promise`\<`void`\>

Defined in: core/actor.ts:65

#### Parameters

##### reason

`Error`

#### Returns

`Promise`\<`void`\>

***

### postStop()

> **postStop**(): `Promise`\<`void`\>

Defined in: core/actor.ts:57

#### Returns

`Promise`\<`void`\>

***

### preRestart()

> **preRestart**(`reason`): `Promise`\<`void`\>

Defined in: core/actor.ts:61

#### Parameters

##### reason

`Error`

#### Returns

`Promise`\<`void`\>

***

### preStart()

> **preStart**(): `Promise`\<`void`\>

Defined in: core/actor.ts:53

#### Returns

`Promise`\<`void`\>

***

### receive()

> **receive**(`message`): `Promise`\<`void`\>

Defined in: core/actor.ts:35

#### Parameters

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`Promise`\<`void`\>

***

### send()

> `protected` **send**(`target`, `message`): `Promise`\<`void`\>

Defined in: core/actor.ts:44

#### Parameters

##### target

[`PID`](../interfaces/PID.md)

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`Promise`\<`void`\>

***

### setState()

> `protected` **setState**(`data`): `void`

Defined in: core/actor.ts:70

#### Parameters

##### data

`any`

#### Returns

`void`

***

### spawn()

> `protected` **spawn**(`props`): `Promise`\<[`PID`](../interfaces/PID.md)\>

Defined in: core/actor.ts:48

#### Parameters

##### props

[`Props`](../interfaces/Props.md)

#### Returns

`Promise`\<[`PID`](../interfaces/PID.md)\>
