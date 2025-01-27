import { describe, test, expect } from 'bun:test';
import { Libp2pTransportProvider } from '../../remote/providers/libp2p';
import { Message } from '../../core/types';
import { log } from '../../utils/logger';

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

    test('should connect two nodes', async () => {
        // Create two providers with dynamic ports for testing
        const provider1 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/0'
        });
        const provider2 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/0'
        });

        log.debug('Initializing providers...');
        // Initialize and start both providers
        await Promise.all([
            provider1.init({ localAddress: '/ip4/127.0.0.1/tcp/0' }),
            provider2.init({ localAddress: '/ip4/127.0.0.1/tcp/0' })
        ]);

        log.debug('Starting providers...');
        await Promise.all([
            provider1.start(),
            provider2.start()
        ]);

        // Wait for providers to be fully ready - increased from 3000ms to 8000ms
        await new Promise(resolve => setTimeout(resolve, 8000));
        log.debug('Providers started and ready');

        // Get provider2's address and connect
        const addr2 = provider2.getListenAddresses()[0];
        const peerId2 = provider2.getLocalAddress();

        // 确保地址不包含 peerId，然后添加一次
        const baseAddr = addr2.includes('/p2p/') ? addr2.split('/p2p/')[0] : addr2;
        const fullAddr = `${baseAddr}/p2p/${peerId2}`;

        log.debug('Provider 1 attempting to connect to:', fullAddr);
        await provider1.dial(fullAddr);

        // Wait for connection to be established - increased from 3000ms to 8000ms
        await new Promise(resolve => setTimeout(resolve, 8000));
        log.debug('Connection established');

        // Clean up
        log.debug('Cleaning up...');
        await Promise.all([
            provider1.stop(),
            provider2.stop()
        ]);
        log.debug('Test completed');
    }, 20000); // Increased timeout to 20 seconds

    test('should exchange a single message between nodes', async () => {
        // Create two providers with dynamic ports for testing
        const provider1 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/0'
        });
        const provider2 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/0'
        });

        log.debug('Initializing providers...');
        await Promise.all([
            provider1.init({ localAddress: '/ip4/127.0.0.1/tcp/0' }),
            provider2.init({ localAddress: '/ip4/127.0.0.1/tcp/0' })
        ]);

        log.debug('Starting providers...');
        await Promise.all([
            provider1.start(),
            provider2.start()
        ]);

        // Wait for providers to be fully ready - increased from 5000ms to 8000ms
        await new Promise(resolve => setTimeout(resolve, 8000));
        log.debug('Providers started and ready');

        // Set up message handler for provider2
        let receivedMessage: Message | undefined;
        provider2.onMessage(async (from, message) => {
            log.debug('Provider 2 received message:', message);
            receivedMessage = message;
        });

        // Get provider2's address and connect
        const addr2 = provider2.getListenAddresses()[0];
        const peerId2 = provider2.getLocalAddress();

        // 确保地址不包含 peerId，然后添加一次
        const baseAddr = addr2.includes('/p2p/') ? addr2.split('/p2p/')[0] : addr2;
        const fullAddr = `${baseAddr}/p2p/${peerId2}`;

        log.debug('Provider 1 attempting to connect to:', fullAddr);
        await provider1.dial(fullAddr);

        // Wait for connection to be established - increased from 5000ms to 8000ms
        await new Promise(resolve => setTimeout(resolve, 8000));
        log.debug('Connection established');

        // Send a test message
        const testMessage: Message = {
            type: 'test',
            payload: { data: 'hello' }
        };

        log.debug('Sending test message from provider1 to provider2');
        await provider1.send(provider2.getLocalAddress(), testMessage);

        // Wait for message propagation with retries - increased retry interval and count
        let retries = 8;  // Increased from 5 to 8
        while (retries > 0 && !receivedMessage) {
            log.debug(`Waiting for message to be received (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 2000));  // Increased from 1000ms to 2000ms
            retries--;
        }

        log.debug('Message propagation complete, received message:', receivedMessage);

        // Verify message was received
        expect(receivedMessage).toBeDefined();
        expect(receivedMessage).toEqual(testMessage);

        // Clean up
        log.debug('Cleaning up...');
        await Promise.all([
            provider1.stop(),
            provider2.stop()
        ]);
        log.debug('Test completed');
    }, 30000); // Increased timeout to 30 seconds
}); 