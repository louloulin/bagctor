[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / RandomRouter

# Class: RandomRouter

Defined in: core/router.ts:181

## Implements

- [`IRouter`](../interfaces/IRouter.md)

## Constructors

### new RandomRouter()

> **new RandomRouter**(`system`): [`RandomRouter`](RandomRouter.md)

Defined in: core/router.ts:184

#### Parameters

##### system

[`ActorSystem`](ActorSystem.md)

#### Returns

[`RandomRouter`](RandomRouter.md)

## Methods

### route()

> **route**(`message`, `routees`): `Promise`\<`void`\>

Defined in: core/router.ts:188

#### Parameters

##### message

[`Message`](../interfaces/Message.md)

##### routees

[`PID`](../interfaces/PID.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IRouter`](../interfaces/IRouter.md).[`route`](../interfaces/IRouter.md#route)
