import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { kadDHT } from '@libp2p/kad-dht';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
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
                    floodPublish: true
                })
            };

            if (this.dhtEnabled) {
                services.dht = kadDHT({
                    clientMode: false,
                    enabled: true,
                    randomWalk: {
                        enabled: this.dhtRandomWalk
                    }
                });
            }

            this.node = await createLibp2p({
                addresses: {
                    listen: [this.localAddress]
                },
                transports: [tcp()],
                connectionEncryption: [noise()],
                streamMuxers: [mplex()],
                peerDiscovery: [
                    pubsubPeerDiscovery({
                        interval: 1000
                    })
                ],
                services,
                connectionManager: {
                    minConnections: 25,
                    maxConnections: 100,
                    autoDialInterval: 10000
                }
            });

            // Subscribe to messages
            await this.node.services.pubsub.subscribe(TOPIC);
            this.node.services.pubsub.addEventListener('message', this.handleIncomingMessage.bind(this));

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
            // Try direct protocol message first
            const stream = await this.node.dialProtocol(multiaddr(address), PROTOCOL);
            await this.writeToStream(stream, {
                from: this.getLocalAddress(),
                message: JSON.stringify(message)
            });
        } catch (error) {
            log.warn(`Failed to send direct message to ${address}, falling back to pubsub:`, error);

            // Fallback to pubsub
            await this.node.services.pubsub.publish(TOPIC, new TextEncoder().encode(JSON.stringify({
                to: address,
                from: this.getLocalAddress(),
                message: JSON.stringify(message)
            })));
        }
    }

    async dial(address: string): Promise<void> {
        try {
            await this.node.dial(multiaddr(address));
            log.debug(`Connected to peer: ${address}`);
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
                await this.messageHandler(data.from, JSON.parse(data.message));
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