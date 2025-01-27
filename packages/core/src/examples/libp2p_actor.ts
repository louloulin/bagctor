import { Actor } from '../core/actor';
import { Message, PID } from '../core/types';
import { ActorSystem } from '../core/system';
import { PropsBuilder } from '../core/props';
import { DefaultMailbox } from '../core/mailbox';
import { Libp2pTransportProvider } from '../remote/providers/libp2p';
import { log } from '../utils/logger';
import { ActorContext } from '../core/context';

// 定义消息类型
type PingMessage = Message & {
    type: 'ping';
    payload: { count: number };
};

type PongMessage = Message & {
    type: 'pong';
    payload: { count: number };
};

// Ping Actor
class PingActor extends Actor {
    private remote?: PID;
    private count: number = 0;

    constructor(context: ActorContext) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            if (message.type === 'setRemote') {
                log.info('Ping actor setting remote:', message.payload);
                this.remote = message.payload;
                return;
            }

            if (message.type === 'pong' && this.remote) {
                const count = (message as PongMessage).payload.count;
                log.info(`Ping actor received pong ${count}`);

                if (count < 3) {
                    const ping: PingMessage = {
                        type: 'ping',
                        payload: { count: count + 1 }
                    };
                    await this.context.send(this.remote, ping);
                } else {
                    log.info('Ping-pong completed');
                    this.context.stop(this.context.self);
                }
            }
        });
    }
}

// Pong Actor
class PongActor extends Actor {
    private remote?: PID;

    constructor(context: ActorContext) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            if (message.type === 'setRemote') {
                log.info('Pong actor setting remote:', message.payload);
                this.remote = message.payload;
                return;
            }

            if (message.type === 'ping' && this.remote) {
                const count = (message as PingMessage).payload.count;
                log.info(`Pong actor received ping ${count}`);

                const pong: PongMessage = {
                    type: 'pong',
                    payload: { count }
                };
                await this.context.send(this.remote, pong);
            }
        });
    }
}

async function main() {
    const system = new ActorSystem();

    try {
        // 创建两个 libp2p 节点作为传输层
        const provider1 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/0'
        });

        const provider2 = new Libp2pTransportProvider({
            localAddress: '/ip4/127.0.0.1/tcp/0'
        });

        // 初始化和启动节点
        log.info('Initializing providers...');
        await Promise.all([
            provider1.init({ localAddress: '/ip4/127.0.0.1/tcp/0' }),
            provider2.init({ localAddress: '/ip4/127.0.0.1/tcp/0' })
        ]);

        log.info('Starting providers...');
        await Promise.all([
            provider1.start(),
            provider2.start()
        ]);

        // 等待节点完全启动
        await new Promise(resolve => setTimeout(resolve, 5000));
        log.info('Providers started and ready');

        // 获取节点地址
        const addr2 = provider2.getListenAddresses()[0];
        const peerId2 = provider2.getLocalAddress();

        // 确保地址不包含 peerId，然后添加一次
        const baseAddr = addr2.includes('/p2p/') ? addr2.split('/p2p/')[0] : addr2;
        const fullAddr = `${baseAddr}/p2p/${peerId2}`;

        log.info('Provider 1 attempting to connect to:', fullAddr);

        try {
            await provider1.dial(fullAddr);
            log.info('Connection established successfully');
        } catch (error) {
            log.error('Failed to establish connection:', error);
            throw error;
        }

        // 等待连接稳定
        await new Promise(resolve => setTimeout(resolve, 5000));
        log.info('Connection stabilized');

        // 设置消息处理器
        let receivedMessages: Message[] = [];
        provider1.onMessage(async (from, msg) => {
            log.info('Provider 1 received message:', msg);
            receivedMessages.push(msg);
        });

        provider2.onMessage(async (from, msg) => {
            log.info('Provider 2 received message:', msg);
            receivedMessages.push(msg);
        });

        // 创建 ping 和 pong actors
        const pingActor = await system.spawn(
            PropsBuilder.fromClass(PingActor)
                .withMailbox(DefaultMailbox)
                .build()
        );

        const pongActor = await system.spawn(
            PropsBuilder.fromClass(PongActor)
                .withMailbox(DefaultMailbox)
                .build()
        );

        // 设置远程引用
        log.info('Setting up remote references between actors');
        await system.send(pingActor, { type: 'setRemote', payload: pongActor });
        await system.send(pongActor, { type: 'setRemote', payload: pingActor });

        // 开始 ping-pong
        const initialPing: PingMessage = {
            type: 'ping',
            payload: { count: 1 }
        };

        log.info('Starting ping-pong...');
        await system.send(pongActor, initialPing);

        // 等待 ping-pong 完成
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 清理
        log.info('Cleaning up...');
        await Promise.all([
            provider1.stop(),
            provider2.stop()
        ]);
        await system.stop();

        log.info('Example completed successfully');
    } catch (error) {
        log.error('Error in example:', error);
        await system.stop();
        process.exit(1);
    }
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
} 