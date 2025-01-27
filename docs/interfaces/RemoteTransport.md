[**Bactor API Documentation v0.1.0**](../README.md)

***

[Bactor API Documentation](../globals.md) / RemoteTransport

# Interface: RemoteTransport

Defined in: remote/transport.ts:6

Base interface for transport providers

## Methods

### getLocalAddress()

> **getLocalAddress**(): `string`

Defined in: remote/transport.ts:39

Get the local address for this transport provider

#### Returns

`string`

***

### init()

> **init**(`options`): `Promise`\<`void`\>

Defined in: remote/transport.ts:11

Initialize the transport provider

#### Parameters

##### options

`TransportProviderOptions`

Provider-specific initialization options

#### Returns

`Promise`\<`void`\>

***

### onMessage()

> **onMessage**(`handler`): `void`

Defined in: remote/transport.ts:34

Register a message handler for incoming messages

#### Parameters

##### handler

(`from`, `message`) => `Promise`\<`void`\>

Message handler function

#### Returns

`void`

***

### send()

> **send**(`address`, `message`): `Promise`\<`void`\>

Defined in: remote/transport.ts:28

Send a message to a remote actor

#### Parameters

##### address

`string`

Remote actor address

##### message

[`Message`](Message.md)

Message to send

#### Returns

`Promise`\<`void`\>

***

### start()

> **start**(): `Promise`\<`void`\>

Defined in: remote/transport.ts:16

Start the transport provider

#### Returns

`Promise`\<`void`\>

***

### stop()

> **stop**(): `Promise`\<`void`\>

Defined in: remote/transport.ts:21

Stop the transport provider

#### Returns

`Promise`\<`void`\>
