[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / ThreadPoolDispatcher

# Class: ThreadPoolDispatcher

Defined in: core/dispatcher.ts:13

## Implements

- `MessageDispatcher`

## Constructors

### new ThreadPoolDispatcher()

> **new ThreadPoolDispatcher**(`threadCount`): [`ThreadPoolDispatcher`](ThreadPoolDispatcher.md)

Defined in: core/dispatcher.ts:17

#### Parameters

##### threadCount

`number` = `...`

#### Returns

[`ThreadPoolDispatcher`](ThreadPoolDispatcher.md)

## Methods

### schedule()

> **schedule**(`runner`): `void`

Defined in: core/dispatcher.ts:25

#### Parameters

##### runner

() => `Promise`\<`void`\>

#### Returns

`void`

#### Implementation of

`MessageDispatcher.schedule`
