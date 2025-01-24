// @ts-ignore
import { createLibp2p } from 'libp2p';
// @ts-ignore
import { tcp } from '@libp2p/tcp';
// @ts-ignore
import { noise } from '@chainsafe/libp2p-noise';
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
import { Message } from '../../core/types';
import { TransportProvider, Libp2pTransportOptions } from '../transport';
import { log } from '../../utils/logger';

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

            const services: any = {
                identify: identify(),
                pubsub: gossipsub({
                    emitSelf: true,
                    allowPublishToZeroPeers: true,
                    gossipIncoming: true,
                    fallbackToFloodsub: true,
                    floodPublish: true,
                    canRelayMessage: true,
                    directPeers: []
                })
            };

            if (this.dhtEnabled) {
                services.dht = kadDHT({
                    clientMode: false,
                    enabled: true,
                    randomWalk: {
                        enabled: this.dhtRandomWalk
                    },
                    protocolPrefix: '/bactor'
                });
            }

            this.node = await createLibp2p({
                addresses: {
                    listen: [this.localAddress]
                },
                transports: [tcp()],
                streamMuxers: [mplex()],
                connectionEncryption: [noise()],
                services,
                peerDiscovery: [
                    pubsubPeerDiscovery({
                        interval: 1000,
                        topics: [TOPIC]
                    })
                ],
                connectionManager: {
                    minConnections: 25,
                    maxConnections: 100,
                    autoDialInterval: 10000
                },
                connectionGater: {
                    denyDialMultiaddr: () => false
                },
                start: false,
                protocolPrefix: '/bactor',
                protocols: [PROTOCOL],
                transportManager: {
                    faultTolerance: 1
                }
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
            await this.node.start();
            log.info(`libp2p node started with ID: ${this.node.peerId.toString()}`);

            // Subscribe to messages after node is started
            await this.node.services.pubsub.subscribe(TOPIC);
            this.node.services.pubsub.addEventListener('message', this.handleIncomingMessage.bind(this));

            // Wait for services to be fully started
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Connect to bootstrap nodes
            for (const addr of this.bootstrapNodes) {
                try {
                    await this.node.dial(multiaddr(addr));
                    log.debug(`Connected to bootstrap node: ${addr}`);
                } catch (error) {
                    log.warn(`Failed to connect to bootstrap node ${addr}:`, error);
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
            if (!this.node.services.pubsub) {
                throw new Error('Pubsub service not available');
            }

            const messageData = {
                to: address,
                from: this.getLocalAddress(),
                message: JSON.stringify(message)
            };

            await this.node.services.pubsub.publish(
                TOPIC,
                new TextEncoder().encode(JSON.stringify(messageData))
            );

            // Wait a short time to ensure message propagation
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            log.error(`Failed to send message to ${address}:`, error);
            throw error;
        }
    }

    async dial(address: string): Promise<void> {
        try {
            await this.node.dial(multiaddr(address));
            log.debug(`Connected to peer: ${address}`);

            // Wait for connection to be fully established
            await new Promise(resolve => setTimeout(resolve, 500));
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
            const data = JSON.parse(new TextDecoder().decode(event.detail.data));

            // Only process messages intended for us
            if (data.to === this.getLocalAddress() && this.messageHandler) {
                const message = JSON.parse(data.message);
                log.debug(`Received message from ${data.from}:`, message);
                await this.messageHandler(data.from, message);
            }
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