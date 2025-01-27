[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / LoggerConfig

# Interface: LoggerConfig

Defined in: utils/logger.ts:5

## Properties

### context?

> `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: utils/logger.ts:10

***

### customLevels?

> `optional` **customLevels**: `Record`\<`string`, `number`\>

Defined in: utils/logger.ts:17

***

### enabled?

> `optional` **enabled**: `boolean`

Defined in: utils/logger.ts:7

***

### formatters?

> `optional` **formatters**: `object`

Defined in: utils/logger.ts:12

#### bindings()?

> `optional` **bindings**: (`bindings`) => `Record`\<`string`, `unknown`\>

##### Parameters

###### bindings

`Bindings`

##### Returns

`Record`\<`string`, `unknown`\>

#### level()?

> `optional` **level**: (`label`, `number`) => `Record`\<`string`, `unknown`\>

##### Parameters

###### label

`string`

###### number

`number`

##### Returns

`Record`\<`string`, `unknown`\>

#### log()?

> `optional` **log**: (`object`) => `Record`\<`string`, `unknown`\>

##### Parameters

###### object

`Record`\<`string`, `unknown`\>

##### Returns

`Record`\<`string`, `unknown`\>

***

### level?

> `optional` **level**: `string`

Defined in: utils/logger.ts:6

***

### prettyPrint?

> `optional` **prettyPrint**: `boolean`

Defined in: utils/logger.ts:8

***

### redact?

> `optional` **redact**: `string`[]

Defined in: utils/logger.ts:18

***

### traceId?

> `optional` **traceId**: `string`

Defined in: utils/logger.ts:9

***

### transport?

> `optional` **transport**: `TransportSingleOptions` \| `TransportMultiOptions` \| `DestinationStream`

Defined in: utils/logger.ts:11
