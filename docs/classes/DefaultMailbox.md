[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / DefaultMailbox

# Class: DefaultMailbox

Defined in: core/mailbox.ts:161

## Implements

- `IMailbox`

## Constructors

### new DefaultMailbox()

> **new DefaultMailbox**(): [`DefaultMailbox`](DefaultMailbox.md)

Defined in: core/mailbox.ts:173

#### Returns

[`DefaultMailbox`](DefaultMailbox.md)

## Methods

### getCurrentMessage()

> **getCurrentMessage**(): `undefined` \| [`Message`](../interfaces/Message.md)

Defined in: core/mailbox.ts:323

#### Returns

`undefined` \| [`Message`](../interfaces/Message.md)

***

### getQueueSizes()

> **getQueueSizes**(): `Promise`\<\{ `high`: `number`; `low`: `number`; `normal`: `number`; `system`: `number`; \}\>

Defined in: core/mailbox.ts:329

#### Returns

`Promise`\<\{ `high`: `number`; `low`: `number`; `normal`: `number`; `system`: `number`; \}\>

***

### hasMessages()

> **hasMessages**(): `Promise`\<`boolean`\>

Defined in: core/mailbox.ts:325

#### Returns

`Promise`\<`boolean`\>

***

### isSuspended()

> **isSuspended**(): `boolean`

Defined in: core/mailbox.ts:322

#### Returns

`boolean`

#### Implementation of

`IMailbox.isSuspended`

***

### postSystemMessage()

> **postSystemMessage**(`message`): `void`

Defined in: core/mailbox.ts:183

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

Defined in: core/mailbox.ts:199

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

Defined in: core/mailbox.ts:178

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

Defined in: core/mailbox.ts:315

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: core/mailbox.ts:305

#### Returns

`void`

#### Implementation of

`IMailbox.start`

***

### suspend()

> **suspend**(): `void`

Defined in: core/mailbox.ts:311

#### Returns

`void`
