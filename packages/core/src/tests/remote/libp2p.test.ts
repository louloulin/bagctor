import { describe, test, expect } from 'bun:test';
import { Libp2pTransportProvider } from '../../remote/providers/libp2p';
import { Message } from '../../core/types';

describe('Libp2p Transport Provider', () => {
    test('should initialize and start/stop correctly', async () => {
        const provider = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/0'
        });

        await provider.init({
            localAddress: '/ip4/127.0.0.1/tcp/0'
        });
        await provider.start();

        expect(provider.getLocalAddress()).toBeTruthy();
        expect(provider.getListenAddresses().length).toBeGreaterThan(0);

        await provider.stop();
    });

    test('should connect two nodes and exchange messages', async () => {
        // Create two providers with fixed ports for testing
        const provider1 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/40001'
        });
        const provider2 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/40002'
        });

        // Initialize and start both providers
        await Promise.all([
            provider1.init({ localAddress: '/ip4/127.0.0.1/tcp/40001' }),
            provider2.init({ localAddress: '/ip4/127.0.0.1/tcp/40002' })
        ]);

        await Promise.all([
            provider1.start(),
            provider2.start()
        ]);

        // Wait for providers to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Set up message handlers
        const messages1: Message[] = [];
        const messages2: Message[] = [];

        provider1.onMessage(async (from, message) => {
            messages1.push(message);
        });

        provider2.onMessage(async (from, message) => {
            messages2.push(message);
        });

        // Connect the nodes using multiaddr format
        const peerId2 = provider2.getLocalAddress();
        await provider1.dial(`/ip4/127.0.0.1/tcp/40002/p2p/${peerId2}`);

        // Wait for connection to be established
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Exchange messages
        const message1: Message = {
            type: 'test',
            payload: { data: 'hello from 1' }
        };

        const message2: Message = {
            type: 'test',
            payload: { data: 'hello from 2' }
        };

        await Promise.all([
            provider1.send(provider2.getLocalAddress(), message1),
            provider2.send(provider1.getLocalAddress(), message2)
        ]);

        // Wait for message propagation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify messages were received
        expect(messages2).toContainEqual(message1);
        expect(messages1).toContainEqual(message2);

        // Clean up
        await Promise.all([
            provider1.stop(),
            provider2.stop()
        ]);
    });

    test('should handle DHT peer discovery', async () => {
        // Create three providers with fixed ports for testing
        const provider1 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/40003',
            dht: {
                enabled: true,
                randomWalk: true
            }
        });

        const provider2 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/40004',
            dht: {
                enabled: true,
                randomWalk: true
            }
        });

        const provider3 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/40005',
            dht: {
                enabled: true,
                randomWalk: true
            }
        });

        // Initialize and start all providers
        await Promise.all([
            provider1.init({
                localAddress: '/ip4/127.0.0.1/tcp/40003',
                dht: { enabled: true, randomWalk: true }
            }),
            provider2.init({
                localAddress: '/ip4/127.0.0.1/tcp/40004',
                dht: { enabled: true, randomWalk: true }
            }),
            provider3.init({
                localAddress: '/ip4/127.0.0.1/tcp/40005',
                dht: { enabled: true, randomWalk: true }
            })
        ]);

        await Promise.all([
            provider1.start(),
            provider2.start(),
            provider3.start()
        ]);

        // Wait for DHT to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Connect provider1 to provider2 and provider2 to provider3 using multiaddr format
        const peerId2 = provider2.getLocalAddress();
        const peerId3 = provider3.getLocalAddress();

        await Promise.all([
            provider1.dial(`/ip4/127.0.0.1/tcp/40004/p2p/${peerId2}`),
            provider2.dial(`/ip4/127.0.0.1/tcp/40005/p2p/${peerId3}`)
        ]);

        // Wait for connections to be established
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Set up message handlers
        const messages: Message[] = [];
        provider3.onMessage(async (from, message) => {
            messages.push(message);
        });

        // Send message from provider1 to provider3 through provider2
        const testMessage: Message = {
            type: 'test',
            payload: { data: 'hello via dht' }
        };

        await provider1.send(provider3.getLocalAddress(), testMessage);

        // Wait for DHT discovery and message delivery
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify message was received
        expect(messages).toContainEqual(testMessage);

        // Clean up
        await Promise.all([
            provider1.stop(),
            provider2.stop(),
            provider3.stop()
        ]);
    });
}); 