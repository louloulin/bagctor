import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Message } from '@bactor/common';
import { TransportProvider, GrpcTransportOptions } from '../transport';
import { log } from '@bactor/common';
import { join } from 'path';

/**
 * gRPC transport provider implementation
 */
export class GrpcTransportProvider implements TransportProvider {
    private server: grpc.Server;
    private clients: Map<string, any> = new Map();
    private messageHandler?: (from: string, message: Message) => Promise<void>;
    private localAddress: string;
    private protoPath: string;
    private serviceName: string;
    private protoDescriptor: any;
    private serviceDefinition: any;

    constructor(options: GrpcTransportOptions) {
        this.localAddress = options.localAddress;
        this.protoPath = options.protoPath || join(__dirname, '../protos/actor.proto');
        this.serviceName = options.serviceName || 'ActorService';
        this.server = new grpc.Server();
    }

    async init(options: GrpcTransportOptions): Promise<void> {
        try {
            log.debug('Initializing gRPC transport provider');

            // Load protobuf
            const packageDefinition = await protoLoader.load(this.protoPath, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });

            this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
            this.serviceDefinition = this.protoDescriptor[this.serviceName].service;

            // Add service implementation
            this.server.addService(this.serviceDefinition, {
                sendMessage: this.handleIncomingMessage.bind(this)
            });

            log.debug('gRPC transport provider initialized');
        } catch (error) {
            log.error('Failed to initialize gRPC transport provider:', error);
            throw error;
        }
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.bindAsync(
                this.localAddress,
                grpc.ServerCredentials.createInsecure(),
                (error, port) => {
                    if (error) {
                        log.error('Failed to start gRPC server:', error);
                        reject(error);
                        return;
                    }
                    this.server.start();
                    log.info(`gRPC server started on ${this.localAddress}`);
                    resolve();
                }
            );
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            this.server.tryShutdown(() => {
                this.clients.clear();
                log.info('gRPC server stopped');
                resolve();
            });
        });
    }

    async send(address: string, message: Message): Promise<void> {
        try {
            let client = this.clients.get(address);
            if (!client) {
                const ServiceClient = this.protoDescriptor[this.serviceName];
                client = new ServiceClient(
                    address,
                    grpc.credentials.createInsecure()
                );
                this.clients.set(address, client);
            }

            return new Promise((resolve, reject) => {
                client.sendMessage({
                    from: this.localAddress,
                    message: JSON.stringify(message)
                }, (error: any) => {
                    if (error) {
                        log.error(`Failed to send message to ${address}:`, error);
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        } catch (error) {
            log.error(`Failed to send message to ${address}:`, error);
            throw error;
        }
    }

    onMessage(handler: (from: string, message: Message) => Promise<void>): void {
        this.messageHandler = handler;
    }

    getLocalAddress(): string {
        return this.localAddress;
    }

    private async handleIncomingMessage(call: any, callback: any) {
        try {
            if (this.messageHandler) {
                const { from, message } = call.request;
                await this.messageHandler(from, JSON.parse(message));
            }
            callback(null, {});
        } catch (error) {
            log.error('Error handling incoming message:', error);
            callback(error);
        }
    }
} 