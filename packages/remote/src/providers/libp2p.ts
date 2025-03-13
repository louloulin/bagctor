// @ts-ignore
import { createLibp2p } from 'libp2p';
// @ts-ignore
import { tcp } from '@libp2p/tcp';
// @ts-ignore
import { plaintext } from '@libp2p/plaintext';
// @ts-ignore
import { mplex } from '@libp2p/mplex';
// @ts-ignore
import { kadDHT } from '@libp2p/kad-dht';
// @ts-ignore
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
// @ts-ignore
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
// @ts-ignore
import { identify } from '@libp2p/identify';
// @ts-ignore
import { multiaddr } from '@multiformats/multiaddr';
import { Message } from '@bactor/common';
import { TransportProvider, Libp2pTransportOptions } from '../transport';
import { log } from '@bactor/common';

const PROTOCOL = '/bactor/1.0.0';
const TOPIC = 'bactor-messages';

/**
 * libp2p transport provider implementation
 */
export class Libp2pTransportProvider implements TransportProvider {
    private node: any;
    private messageHandler?: (from: string, message: Message) => Promise<void>;
    private localAddress: string;
    private bootstrapNodes: string[];
    private dhtEnabled: boolean;
    private dhtRandomWalk: boolean;

    constructor(options: Libp2pTransportOptions) {
        this.localAddress = options.localAddress;
        this.bootstrapNodes = options.bootstrapNodes || [];
        this.dhtEnabled = options.dht?.enabled || false;
        this.dhtRandomWalk = options.dht?.randomWalk || false;
    }

    async init(options: Libp2pTransportOptions): Promise<void> {
        try {
            log.debug('Initializing libp2p transport provider');
            log.debug('Options:', options);

            const services: any = {
                identify: identify(),
                pubsub: gossipsub({
                    emitSelf: true,
                    allowPublishToZeroTopicPeers: true,
                    fallbackToFloodsub: true,
                    floodPublish: true,
                    directPeers: []
                })
            };

            if (this.dhtEnabled) {
                log.debug('Initializing DHT with randomWalk:', this.dhtRandomWalk);
                services.dht = kadDHT({
                    clientMode: false,
                    protocol: '/bactor/kad/1.0.0',
                    validators: {},
                    selectors: {}
                });
            }

            log.debug('Creating libp2p node with config:', {
                addresses: this.localAddress,
                dhtEnabled: this.dhtEnabled,
                services: Object.keys(services)
            });

            this.node = await createLibp2p({
                addresses: {
                    listen: [this.localAddress]
                },
                transports: [tcp()],
                streamMuxers: [mplex()],
                connectionEncrypters: [plaintext()],
                services,
                connectionManager: {
                    maxConnections: 50
                },
                start: false
            });

            // Handle protocol messages
            await this.node.handle(PROTOCOL, this.handleProtocolMessage.bind(this));

            log.debug('libp2p transport provider initialized');
        } catch (error) {
            log.error('Failed to initialize libp2p transport provider:', error);
            throw error;
        }
    }

    async start(): Promise<void> {
        try {
            log.debug('Starting libp2p node...');
            await this.node.start();
            const peerId = this.node.peerId.toString();
            const addrs = this.getListenAddresses();
            log.info(`libp2p node started with ID: ${peerId}`);
            log.debug('Listening on addresses:', addrs);

            // Subscribe to messages after node is started
            log.debug('Subscribing to pubsub topic:', TOPIC);
            await this.node.services.pubsub.subscribe(TOPIC);
            this.node.services.pubsub.addEventListener('message', this.handleIncomingMessage.bind(this));

            // Wait for services to be fully started
            await new Promise(resolve => setTimeout(resolve, 1000));
            log.debug('All services started');

            // Connect to bootstrap nodes
            if (this.bootstrapNodes.length > 0) {
                log.debug('Connecting to bootstrap nodes:', this.bootstrapNodes);
                for (const addr of this.bootstrapNodes) {
                    try {
                        await this.node.dial(multiaddr(addr));
                        log.debug(`Connected to bootstrap node: ${addr}`);
                    } catch (error) {
                        log.warn(`Failed to connect to bootstrap node ${addr}:`, error);
                    }
                }
            }
        } catch (error) {
            log.error('Failed to start libp2p node:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            await this.node.stop();
            log.info('libp2p node stopped');
        } catch (error) {
            log.error('Failed to stop libp2p node:', error);
            throw error;
        }
    }

    async send(address: string, message: Message): Promise<void> {
        try {
            if (!this.node?.services?.pubsub) {
                throw new Error('Pubsub service not available');
            }

            if (!address) {
                throw new Error('Target address is required');
            }

            if (!message || typeof message !== 'object') {
                throw new Error('Invalid message format');
            }

            const messageData = {
                to: address,
                from: this.getLocalAddress(),
                message: JSON.stringify(message)
            };

            log.debug(`Publishing message to ${address}:`, messageData);

            await this.node.services.pubsub.publish(
                TOPIC,
                new TextEncoder().encode(JSON.stringify(messageData))
            );

            log.debug('Message published successfully');

            // Wait a short time to ensure message propagation
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            log.error(`Failed to send message to ${address}:`, error);
            throw error;
        }
    }

    async dial(address: string): Promise<void> {
        try {
            const ma = multiaddr(address);
            log.debug(`Attempting to dial peer: ${address}`);
            log.debug('Multiaddr components:', ma.toString());

            // 获取 peerId
            const peerId = ma.getPeerId();
            if (!peerId) {
                throw new Error('No peer ID in multiaddr');
            }

            // 检查是否已连接
            const peers = await this.node.peerStore.all();
            const isConnected = peers.some((p: any) => p.id.toString() === peerId);
            if (isConnected) {
                log.debug(`Already connected to peer: ${peerId}`);
                return;
            }

            // Try to connect with retries
            let retries = 3;
            let lastError = null;
            while (retries > 0) {
                try {
                    log.debug(`Dial attempt ${4 - retries} to ${address}`);
                    await this.node.dial(ma);
                    log.debug(`Successfully connected to peer: ${address}`);

                    // Wait for connection to be fully established
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Verify connection
                    const connectedPeers = await this.node.peerStore.all();
                    if (connectedPeers.some((p: any) => p.id.toString() === peerId)) {
                        log.debug('Connection verified with peer');
                        return;
                    }
                    throw new Error('Peer not in connected peers list after dial');
                } catch (error) {
                    lastError = error;
                    retries--;
                    if (retries === 0) {
                        break;
                    }
                    log.warn(`Failed to connect to peer ${address}, retrying... (${retries} attempts left):`, error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (lastError) {
                log.error(`All connection attempts failed to peer ${address}:`, lastError);
                throw lastError;
            }
        } catch (error) {
            log.error(`Failed to connect to peer ${address}:`, error);
            throw error;
        }
    }

    onMessage(handler: (from: string, message: Message) => Promise<void>): void {
        this.messageHandler = handler;
    }

    getLocalAddress(): string {
        return this.node.peerId.toString();
    }

    getListenAddresses(): string[] {
        return this.node.getMultiaddrs().map((addr: any) => addr.toString());
    }

    private async handleIncomingMessage(event: any) {
        try {
            if (!event?.detail?.data) {
                log.warn('Received invalid pubsub message event');
                return;
            }

            const rawData = new TextDecoder().decode(event.detail.data);
            log.debug('Received raw pubsub message:', rawData);

            let data;
            try {
                data = JSON.parse(rawData);
            } catch (error) {
                log.warn('Failed to parse pubsub message:', error);
                return;
            }

            log.debug('Parsed message data:', data);

            // 验证消息格式
            if (!data || typeof data !== 'object') {
                log.warn('Invalid message format: not an object');
                return;
            }

            if (!data.to || !data.from || !data.message) {
                log.warn('Invalid message format: missing required fields', {
                    hasTo: !!data.to,
                    hasFrom: !!data.from,
                    hasMessage: !!data.message
                });
                return;
            }

            // 验证目标地址
            const localAddress = this.getLocalAddress();
            if (data.to !== localAddress) {
                log.debug(`Message not for us (${localAddress}), ignoring`);
                return;
            }

            if (!this.messageHandler) {
                log.warn('No message handler registered');
                return;
            }

            let message;
            try {
                message = JSON.parse(data.message);
            } catch (error) {
                log.warn('Failed to parse message content:', error);
                return;
            }

            log.debug(`Processing message from ${data.from}:`, message);
            await this.messageHandler(data.from, message);
            log.debug('Message processed successfully');
        } catch (error) {
            log.error('Error handling incoming pubsub message:', error);
        }
    }

    private async handleProtocolMessage({ stream }: any) {
        try {
            const data = await this.readFromStream(stream);
            if (this.messageHandler) {
                await this.messageHandler(data.from, JSON.parse(data.message));
            }
        } catch (error) {
            log.error('Error handling protocol message:', error);
        } finally {
            await stream.close();
        }
    }

    private async writeToStream(stream: any, data: any): Promise<void> {
        const writer = stream.sink;
        await writer.write(new TextEncoder().encode(JSON.stringify(data)));
        await writer.close();
    }

    private async readFromStream(stream: any): Promise<any> {
        const reader = stream.source;
        let result = '';
        for await (const chunk of reader) {
            result += new TextDecoder().decode(chunk);
        }
        return JSON.parse(result);
    }
} 