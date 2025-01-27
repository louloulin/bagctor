[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / ThroughputDispatcher

# Class: ThroughputDispatcher

Defined in: core/dispatcher.ts:38

## Implements

- `MessageDispatcher`

## Constructors

### new ThroughputDispatcher()

> **new ThroughputDispatcher**(`throughput`, `batchSize`, `windowSize`): [`ThroughputDispatcher`](ThroughputDispatcher.md)

Defined in: core/dispatcher.ts:44

#### Parameters

##### throughput

`number` = `300`

##### batchSize

`number` = `30`

##### windowSize

`number` = `1000`

#### Returns

[`ThroughputDispatcher`](ThroughputDispatcher.md)

## Methods

### schedule()

> **schedule**(`runner`): `void`

Defined in: core/dispatcher.ts:50

#### Parameters

##### runner

() => `Promise`\<`void`\>

#### Returns

`void`

#### Implementation of

`MessageDispatcher.schedule`
