import { TransportProviderRegistry } from '../transport';
import { GrpcTransportProvider } from './grpc';
import { Libp2pTransportProvider } from './libp2p';

// Register transport providers
TransportProviderRegistry.register('grpc', GrpcTransportProvider);
TransportProviderRegistry.register('libp2p', Libp2pTransportProvider); 