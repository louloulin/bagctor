import { ClusterManager } from '../cluster_manager';

export interface LibP2pClusterOptions {
    localAddress: string;
    seedNodes: string[];
    clusterManager: ClusterManager;
}

export interface Libp2pTransportProvider {
    init(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    getLocalAddress(): string;
    getBootstrapNodes(): string[];
} 