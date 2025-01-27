import { Libp2pTransportProvider } from '../remote/providers/libp2p';
import { log } from '../utils/logger';
import { Message } from '../core/types';

async function main() {
    try {
        // 创建三个节点，形成一个小型网络
        const providers = await Promise.all([
            new Libp2pTransportProvider({
                localAddress: '/ip4/127.0.0.1/tcp/0'
            }),
            new Libp2pTransportProvider({
                localAddress: '/ip4/127.0.0.1/tcp/0'
            }),
            new Libp2pTransportProvider({
                localAddress: '/ip4/127.0.0.1/tcp/0'
            })
        ]);

        // 初始化所有节点
        log.info('Initializing providers...');
        await Promise.all(
            providers.map(p => p.init({
                localAddress: '/ip4/127.0.0.1/tcp/0'
            }))
        );

        // 启动所有节点
        log.info('Starting providers...');
        await Promise.all(providers.map(p => p.start()));

        // 等待节点完全启动
        await new Promise(resolve => setTimeout(resolve, 5000));
        log.info('Providers started and ready');

        // 获取所有节点的地址
        const addresses = providers.map(p => {
            const addr = p.getListenAddresses()[0];
            const peerId = p.getLocalAddress();
            // 确保地址不包含 peerId，然后添加一次
            const baseAddr = addr.includes('/p2p/') ? addr.split('/p2p/')[0] : addr;
            return `${baseAddr}/p2p/${peerId}`;
        });

        log.info('Provider addresses:', addresses);

        // 建立连接：将所有节点连接成一个网络
        // provider[0] 连接到 provider[1]
        // provider[1] 连接到 provider[2]
        log.info('Connecting providers...');

        try {
            await providers[0].dial(addresses[1]);
            log.info('Provider 0 connected to Provider 1');
            await new Promise(resolve => setTimeout(resolve, 2000));

            await providers[1].dial(addresses[2]);
            log.info('Provider 1 connected to Provider 2');
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            log.error('Failed to establish connections:', error);
            throw error;
        }

        // 等待连接稳定
        await new Promise(resolve => setTimeout(resolve, 5000));
        log.info('All connections stabilized');

        // 设置消息处理器
        providers.forEach((provider, index) => {
            provider.onMessage(async (from, msg) => {
                log.info(`Provider ${index} received message from ${from}:`, msg);
            });
        });

        // Provider 0 发送消息到 Provider 1
        log.info('Provider 0 sending message to Provider 1...');
        const message1: Message = {
            type: 'test',
            payload: 'Hello from Provider 0 to Provider 1!'
        };
        await providers[0].send(providers[1].getLocalAddress(), message1);

        // 等待消息传播
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Provider 1 发送消息到 Provider 2
        log.info('Provider 1 sending message to Provider 2...');
        const message2: Message = {
            type: 'test',
            payload: 'Hello from Provider 1 to Provider 2!'
        };
        await providers[1].send(providers[2].getLocalAddress(), message2);

        // 等待消息传播
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 清理
        log.info('Cleaning up...');
        await Promise.all(providers.map(p => p.stop()));

        log.info('Example completed successfully');
    } catch (error) {
        log.error('Error in example:', error);
        process.exit(1);
    }
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
} 