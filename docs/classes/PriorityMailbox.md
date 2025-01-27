[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / PriorityMailbox

# Class: PriorityMailbox

Defined in: core/mailbox.ts:339

## Implements

- `IMailbox`

## Constructors

### new PriorityMailbox()

> **new PriorityMailbox**(): [`PriorityMailbox`](PriorityMailbox.md)

Defined in: core/mailbox.ts:353

#### Returns

[`PriorityMailbox`](PriorityMailbox.md)

## Methods

### getCurrentMessage()

> **getCurrentMessage**(): `undefined` \| [`Message`](../interfaces/Message.md)

Defined in: core/mailbox.ts:517

#### Returns

`undefined` \| [`Message`](../interfaces/Message.md)

***

### getQueueSizes()

> **getQueueSizes**(): `Promise`\<\{ `high`: `number`; `low`: `number`; `normal`: `number`; `system`: `number`; \}\>

Defined in: core/mailbox.ts:526

#### Returns

`Promise`\<\{ `high`: `number`; `low`: `number`; `normal`: `number`; `system`: `number`; \}\>

***

### hasMessages()

> **hasMessages**(): `Promise`\<`boolean`\>

Defined in: core/mailbox.ts:519

#### Returns

`Promise`\<`boolean`\>

***

### isSuspended()

> **isSuspended**(): `boolean`

Defined in: core/mailbox.ts:516

#### Returns

`boolean`

#### Implementation of

`IMailbox.isSuspended`

***

### postSystemMessage()

> **postSystemMessage**(`message`): `void`

Defined in: core/mailbox.ts:365

#### Parameters

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`void`

#### Implementation of

`IMailbox.postSystemMessage`

***

### postUserMessage()

> **postUserMessage**(`message`): `void`

Defined in: core/mailbox.ts:383

#### Parameters

##### message

[`Message`](../interfaces/Message.md)

#### Returns

`void`

#### Implementation of

`IMailbox.postUserMessage`

***

### registerHandlers()

> **registerHandlers**(`invoker`, `dispatcher`): `void`

Defined in: core/mailbox.ts:360

#### Parameters

##### invoker

`MessageInvoker`

##### dispatcher

`MessageDispatcher`

#### Returns

`void`

#### Implementation of

`IMailbox.registerHandlers`

***

### resume()

> **resume**(): `void`

Defined in: core/mailbox.ts:507

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: core/mailbox.ts:496

#### Returns

`void`

#### Implementation of

`IMailbox.start`

***

### suspend()

> **suspend**(): `void`

Defined in: core/mailbox.ts:503

#### Returns

`void`
