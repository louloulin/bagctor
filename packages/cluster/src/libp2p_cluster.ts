import { ClusterManager } from './cluster_manager';
import { LibP2pClusterTransport } from './transport/libp2p_cluster_transport';
import {
    ClusterConfig,
    LoadBalancingConfig,
    PartitionConfig,
    BackpressureConfig,
    NodeInfo,
    NodeLoad,
    ClusterState,
    ClusterMetrics,
    ClusterEventType,
    ClusterEvent,
    LibP2pClusterOptions,
    LibP2pClusterSystemConfig
} from './types';
import { log } from '@bactor/core';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * 基于LibP2P的集群系统，整合ClusterManager和LibP2pClusterTransport
 */
export class LibP2pClusterSystem extends EventEmitter {
    private clusterManager: ClusterManager;
    private transport: LibP2pClusterTransport;
    private nodeId: string;
    private isStarted: boolean = false;

    /**
     * 创建LibP2P集群系统
     * @param config 集群系统配置
     */
    constructor(private config: LibP2pClusterSystemConfig) {
        super();
        this.nodeId = config.nodeId || uuidv4();

        // 检查privateKey是否存在
        if (!config.privateKey) {
            log.warn('No privateKey provided in LibP2pClusterSystem config. Transport will generate one.', {
                nodeId: this.nodeId
            });
        } else {
            log.info('PrivateKey provided in LibP2pClusterSystem config', {
                nodeId: this.nodeId,
                hasPrivateKey: true,
                peerIdType: typeof config.privateKey,
                peerIdKeys: config.privateKey ? Object.keys(config.privateKey) : []
            });
        }

        log.info('Creating LibP2pClusterSystem', {
            nodeId: this.nodeId,
            hasPrivateKey: !!config.privateKey,
            localAddress: config.localAddress
        });

        // 创建集群管理器
        this.clusterManager = new ClusterManager({
            ...config.clusterConfig,
            nodeId: this.nodeId
        });

        // 将事件从集群管理器转发到此类
        this.clusterManager.on('clusterEvent', (event: ClusterEvent) => {
            this.emit('clusterEvent', event);
        });

        // 创建传输层，确保privateKey正确传递
        const transportConfig: LibP2pClusterOptions = {
            nodeId: this.nodeId,
            clusterManager: this.clusterManager,
            localAddress: config.localAddress,
            bootstrapList: config.clusterConfig.bootstrapList,
            privateKey: config.privateKey, // 传递privateKey
            seedNodes: config.seedNodes || []
        };

        log.info('Creating LibP2pClusterTransport with config', {
            nodeId: this.nodeId,
            hasPrivateKey: !!transportConfig.privateKey,
            peerIdType: transportConfig.privateKey ? typeof transportConfig.privateKey : 'undefined',
            peerIdKeys: transportConfig.privateKey ? Object.keys(transportConfig.privateKey) : [],
            localAddress: transportConfig.localAddress,
            hasSeedNodes: transportConfig.seedNodes && transportConfig.seedNodes.length > 0
        });

        this.transport = new LibP2pClusterTransport(transportConfig);

        // 设置传输层到集群管理器
        this.clusterManager.setTransport(this.transport);
    }

    /**
     * 启动集群系统
     */
    async start(): Promise<void> {
        if (this.isStarted) return;

        try {
            log.info('Starting LibP2pClusterSystem', { nodeId: this.nodeId });

            // 先启动传输层
            await this.transport.start();

            // 然后启动集群管理器
            this.clusterManager.start();

            this.isStarted = true;
            log.info('LibP2pClusterSystem started successfully');

            // 加入集群
            await this.transport.joinCluster();
        } catch (error) {
            log.error('Failed to start LibP2pClusterSystem', { error });
            await this.stop().catch(e => log.error('Failed to stop after start failure', { error: e }));
            throw error;
        }
    }

    /**
     * 停止集群系统
     */
    async stop(): Promise<void> {
        if (!this.isStarted) return;

        try {
            log.info('Stopping LibP2pClusterSystem', { nodeId: this.nodeId });

            // 先离开集群
            await this.transport.leaveCluster();

            // 停止集群管理器
            this.clusterManager.stop();

            // 最后停止传输层
            await this.transport.stop();

            this.isStarted = false;
            log.info('LibP2pClusterSystem stopped successfully');
        } catch (error) {
            log.error('Failed to stop LibP2pClusterSystem', { error });
            throw error;
        }
    }

    /**
     * 获取当前集群状态
     */
    getClusterState(): ClusterState {
        return this.clusterManager.getState();
    }

    /**
     * 获取集群指标
     */
    getClusterMetrics(): ClusterMetrics {
        return this.clusterManager.getMetrics();
    }

    /**
     * 获取节点信息
     * @param nodeId 节点ID
     */
    getNodeInfo(nodeId: string): NodeInfo | undefined {
        return this.clusterManager.getNodeInfo(nodeId);
    }

    /**
     * 获取所有节点
     */
    getAllNodes(): NodeInfo[] {
        return this.clusterManager.getAllNodes();
    }

    /**
     * 获取活跃节点
     */
    getActiveNodes(): NodeInfo[] {
        return this.clusterManager.getActiveNodes();
    }

    /**
     * 注册集群事件监听器
     * @param eventType 事件类型
     * @param listener 监听器函数
     */
    onClusterEvent(eventType: ClusterEventType, listener: (event: ClusterEvent) => void): void {
        this.on('clusterEvent', (event: ClusterEvent) => {
            if (event.type === eventType) {
                listener(event);
            }
        });
    }

    /**
     * 手动触发集群状态同步
     */
    async syncClusterState(): Promise<void> {
        if (!this.isStarted) {
            throw new Error('Cannot sync cluster state: system not started');
        }

        await this.transport.requestStateSync();
    }
} 