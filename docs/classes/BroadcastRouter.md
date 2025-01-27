[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / BroadcastRouter

# Class: BroadcastRouter

Defined in: core/router.ts:132

## Implements

- [`IRouter`](../interfaces/IRouter.md)

## Constructors

### new BroadcastRouter()

> **new BroadcastRouter**(`system`): [`BroadcastRouter`](BroadcastRouter.md)

Defined in: core/router.ts:135

#### Parameters

##### system

[`ActorSystem`](ActorSystem.md)

#### Returns

[`BroadcastRouter`](BroadcastRouter.md)

## Methods

### route()

> **route**(`message`, `routees`): `Promise`\<`void`\>

Defined in: core/router.ts:137

#### Parameters

##### message

[`Message`](../interfaces/Message.md)

##### routees

[`PID`](../interfaces/PID.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`IRouter`](../interfaces/IRouter.md).[`route`](../interfaces/IRouter.md#route)
