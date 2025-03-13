import { Message } from '@bactor/common';

/**
 * Base interface for transport providers
 */
export interface TransportProvider {
  /**
   * Initialize the transport provider
   * @param options Provider-specific initialization options
   */
  init(options: TransportProviderOptions): Promise<void>;

  /**
   * Start the transport provider
   */
  start(): Promise<void>;

  /**
   * Stop the transport provider
   */
  stop(): Promise<void>;

  /**
   * Send a message to a remote actor
   * @param address Remote actor address
   * @param message Message to send
   */
  send(address: string, message: Message): Promise<void>;

  /**
   * Register a message handler for incoming messages
   * @param handler Message handler function
   */
  onMessage(handler: (from: string, message: Message) => Promise<void>): void;

  /**
   * Get the local address for this transport provider
   */
  getLocalAddress(): string;
}

/**
 * Base options for transport providers
 */
export interface TransportProviderOptions {
  /**
   * Local address to bind to
   */
  localAddress: string;
}

/**
 * gRPC transport provider options
 */
export interface GrpcTransportOptions extends TransportProviderOptions {
  /**
   * Path to proto file
   */
  protoPath: string;

  /**
   * Service name in proto file
   */
  serviceName: string;
}

/**
 * libp2p transport provider options
 */
export interface Libp2pTransportOptions extends TransportProviderOptions {
  /**
   * Bootstrap nodes to connect to
   */
  bootstrapNodes?: string[];

  /**
   * DHT configuration
   */
  dht?: {
    enabled: boolean;
    randomWalk: boolean;
  };
}

/**
 * Factory function type for creating transport providers
 */
export type TransportProviderFactory = (options: TransportProviderOptions) => TransportProvider;

/**
 * Registry for transport providers
 */
export class TransportProviderRegistry {
  private static providers = new Map<string, new (options: any) => TransportProvider>();

  /**
   * Register a transport provider
   * @param name Provider name
   * @param provider Provider constructor function
   */
  static register<T extends TransportProviderOptions>(
    name: string,
    provider: new (options: T) => TransportProvider
  ) {
    this.providers.set(name, provider);
  }

  /**
   * Get a transport provider constructor
   * @param name Provider name
   */
  static get<T extends TransportProviderOptions>(name: string): new (options: T) => TransportProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Transport provider '${name}' not found`);
    }
    return provider as new (options: T) => TransportProvider;
  }
}

export interface Transport {
  connect(address: string): Promise<void>;
  disconnect(): Promise<void>;
  send(message: Message): Promise<void>;
  receive(): AsyncIterator<Message>;
} 