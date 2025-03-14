import { PID } from '@core/types';
import { log } from '@utils/logger';
import { ActorState, MessageTrace } from './debugger';

export interface VisualizerConfig {
    refreshInterval: number;  // 刷新间隔（毫秒）
    maxHistoryLength: number; // 最大历史记录长度
    layout: string;
}

export interface VisualNode {
    id: string;
    type: 'actor' | 'message';
    label: string;
    state?: any;
    metrics?: {
        messageCount: number;
        processingTime: number;
        errorCount: number;
    };
}

export interface VisualEdge {
    source: string;
    target: string;
    type: string;
    metrics?: {
        messageCount: number;
        latency: number;
    };
}

export interface VisualGraph {
    nodes: VisualNode[];
    edges: VisualEdge[];
    timestamp: number;
}

export class ActorVisualizer {
    private config: VisualizerConfig;
    private history: VisualGraph[] = [];
    private currentGraph: VisualGraph;
    private messageStats: Map<string, { count: number, latency: number }> = new Map();
    private isRunning: boolean = false;

    constructor(config: VisualizerConfig) {
        this.config = config;
        this.currentGraph = this.createEmptyGraph();
    }

    start(): void {
        this.isRunning = true;
        this.startVisualizationLoop();
        log.info('Actor visualizer started');
    }

    stop(): void {
        this.isRunning = false;
        log.info('Actor visualizer stopped');
    }

    updateActorStates(states: ActorState[]): void {
        // 更新actor节点
        states.forEach(state => {
            const node: VisualNode = {
                id: state.pid.id,
                type: 'actor',
                label: `Actor: ${state.pid.id}`,
                state: state.state,
                metrics: {
                    messageCount: 0,
                    processingTime: 0,
                    errorCount: 0
                }
            };

            this.updateNode(node);
        });

        // 更新actor之间的关系
        states.forEach(state => {
            state.children.forEach(child => {
                const edge: VisualEdge = {
                    source: state.pid.id,
                    target: child.id,
                    type: 'parent-child',
                    metrics: {
                        messageCount: 0,
                        latency: 0
                    }
                };

                this.updateEdge(edge);
            });
        });
    }

    addMessageTrace(trace: MessageTrace): void {
        // 更新消息统计
        const edgeKey = `${trace.source.id}-${trace.target.id}`;
        const stats = this.messageStats.get(edgeKey) || { count: 0, latency: 0 };
        stats.count++;
        stats.latency = (stats.latency * (stats.count - 1) + (Date.now() - trace.timestamp)) / stats.count;
        this.messageStats.set(edgeKey, stats);

        // 更新消息边
        const edge: VisualEdge = {
            source: trace.source.id,
            target: trace.target.id,
            type: trace.type,
            metrics: {
                messageCount: stats.count,
                latency: stats.latency
            }
        };

        this.updateEdge(edge);
    }

    private createEmptyGraph(): VisualGraph {
        return {
            nodes: [],
            edges: [],
            timestamp: Date.now()
        };
    }

    private updateNode(node: VisualNode): void {
        const index = this.currentGraph.nodes.findIndex(n => n.id === node.id);
        if (index === -1) {
            this.currentGraph.nodes.push(node);
        } else {
            this.currentGraph.nodes[index] = {
                ...this.currentGraph.nodes[index],
                ...node
            };
        }
    }

    private updateEdge(edge: VisualEdge): void {
        const index = this.currentGraph.edges.findIndex(e =>
            e.source === edge.source && e.target === edge.target);
        if (index === -1) {
            this.currentGraph.edges.push(edge);
        } else {
            this.currentGraph.edges[index] = {
                ...this.currentGraph.edges[index],
                ...edge
            };
        }
    }

    private async startVisualizationLoop(): Promise<void> {
        while (this.isRunning) {
            this.updateVisualization();
            await new Promise(resolve => setTimeout(resolve, this.config.refreshInterval));
        }
    }

    private updateVisualization(): void {
        // 保存当前图的快照
        this.history.push({ ...this.currentGraph });
        if (this.history.length > this.config.maxHistoryLength) {
            this.history.shift();
        }

        // 在这里可以添加具体的可视化逻辑
        this.renderGraph();
    }

    private renderGraph(): void {
        // 这里应该实现具体的图形渲染逻辑
        // 可以使用D3.js或其他可视化库
        log.debug('Graph updated:', {
            nodes: this.currentGraph.nodes.length,
            edges: this.currentGraph.edges.length,
            timestamp: this.currentGraph.timestamp
        });
    }

    // 可视化API
    getCurrentGraph(): VisualGraph {
        return this.currentGraph;
    }

    getHistory(): VisualGraph[] {
        return this.history;
    }

    getMessageStats(): Map<string, { count: number, latency: number }> {
        return this.messageStats;
    }

    clearHistory(): void {
        this.history = [];
        log.info('Visualization history cleared');
    }
} 