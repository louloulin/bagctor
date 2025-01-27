[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / PropsBuilder

# Class: PropsBuilder

Defined in: core/props.ts:5

## Constructors

### new PropsBuilder()

> **new PropsBuilder**(): [`PropsBuilder`](PropsBuilder.md)

#### Returns

[`PropsBuilder`](PropsBuilder.md)

## Methods

### build()

> **build**(): [`Props`](../interfaces/Props.md)

Defined in: core/props.ts:98

#### Returns

[`Props`](../interfaces/Props.md)

***

### withAddress()

> **withAddress**(`address`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:88

#### Parameters

##### address

`string`

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### withContext()

> **withContext**(`context`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:93

#### Parameters

##### context

`any`

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### withDispatcher()

> **withDispatcher**(`dispatcher`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:83

#### Parameters

##### dispatcher

`MessageDispatcher`

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### withMailbox()

> **withMailbox**(`mailboxType`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:73

#### Parameters

##### mailboxType

() => `IMailbox`

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### withSupervisor()

> **withSupervisor**(`strategy`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:78

#### Parameters

##### strategy

`any`

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### fromClass()

> `static` **fromClass**(`actorClass`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:9

#### Parameters

##### actorClass

(`context`) => [`Actor`](Actor.md)

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### fromFunc()

> `static` **fromFunc**(`func`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:56

#### Parameters

##### func

(`context`, `message`) => `void`

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### fromHandler()

> `static` **fromHandler**(`handler`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:23

#### Parameters

##### handler

(`msg`) => `void` \| `Promise`\<`void`\>

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### fromProducer()

> `static` **fromProducer**(`producer`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:16

#### Parameters

##### producer

(`context`) => [`Actor`](Actor.md)

#### Returns

[`PropsBuilder`](PropsBuilder.md)

***

### fromState()

> `static` **fromState**\<`T`\>(`initialState`, `handler`): [`PropsBuilder`](PropsBuilder.md)

Defined in: core/props.ts:37

#### Type Parameters

• **T**

#### Parameters

##### initialState

`T`

##### handler

(`state`, `msg`, `context`) => `T` \| `Promise`\<`T`\>

#### Returns

[`PropsBuilder`](PropsBuilder.md)
