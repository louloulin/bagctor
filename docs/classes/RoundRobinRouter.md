[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / RoundRobinRouter

# Class: RoundRobinRouter

Defined in: core/router.ts:156

## Implements

- [`IRouter`](../interfaces/IRouter.md)

## Constructors

### new RoundRobinRouter()

> **new RoundRobinRouter**(`system`): [`RoundRobinRouter`](RoundRobinRouter.md)

Defined in: core/router.ts:160

#### Parameters

##### system

[`ActorSystem`](ActorSystem.md)

#### Returns

[`RoundRobinRouter`](RoundRobinRouter.md)

## Methods

### route()

> **route**(`message`, `routees`): `Promise`\<`void`\>

Defined in: core/router.ts:162

#### Parameters

##### message

[`Message`](../interfaces/Message.md)

##### routees

[`PID`](../interfaces/PID.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IRouter`](../interfaces/IRouter.md).[`route`](../interfaces/IRouter.md#route)
