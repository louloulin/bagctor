import { WorkflowConfig, WorkflowStep } from './types';

/**
 * 工作流节点类型
 */
export interface WorkflowNode {
    id: string;
    type: 'agent' | 'tool' | 'decision' | 'parallel' | 'merge';
    label: string;
    data: any;
    dependencies: string[];
}

/**
 * 工作流边类型
 */
export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    data?: any;
}

/**
 * 工作流图类型
 */
export interface WorkflowGraph {
    id: string;
    name: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    metadata: {
        createdAt: number;
        updatedAt: number;
        version: string;
        layout?: 'horizontal' | 'vertical';
        displayMode?: 'simple' | 'detailed';
    };
}

/**
 * 将工作流配置转换为工作流图
 * @param config 工作流配置
 * @returns 工作流图
 */
export function createWorkflowGraph(config: WorkflowConfig): WorkflowGraph {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];

    // 创建起始节点
    const startNodeId = `${config.name}_start`;
    nodes.push({
        id: startNodeId,
        type: 'decision',
        label: 'Start',
        data: {
            description: 'Workflow starting point'
        },
        dependencies: []
    });

    // 解析输入参数中的依赖关系
    const dependencyMap = new Map<string, string[]>();

    // 首先收集所有可能的输出
    const outputs = new Map<string, string>();
    config.steps.forEach(step => {
        if (step.output) {
            outputs.set(step.output, step.agent);
        }
    });

    // 分析每个步骤的依赖关系
    config.steps.forEach(step => {
        const dependencies: string[] = [];

        // 如果input是函数，尝试分析其字符串表示以查找依赖项
        if (typeof step.input === 'function') {
            const fnStr = step.input.toString();

            // 查找所有可能的上下文引用
            outputs.forEach((agent, output) => {
                if (fnStr.includes(`context.${output}`)) {
                    dependencies.push(agent);
                }
            });
        }

        dependencyMap.set(step.agent, dependencies);
    });

    // 创建每个步骤的节点
    config.steps.forEach((step, index) => {
        nodes.push({
            id: step.agent,
            type: 'agent',
            label: step.agent,
            data: {
                description: typeof step.input === 'string' ? step.input : 'Dynamic input',
                output: step.output,
                index
            },
            dependencies: dependencyMap.get(step.agent) || []
        });

        // 如果没有依赖，则连接到起始节点
        if (dependencyMap.get(step.agent)?.length === 0) {
            edges.push({
                id: `${startNodeId}_to_${step.agent}`,
                source: startNodeId,
                target: step.agent
            });
        }
    });

    // 创建每个步骤之间的边
    dependencyMap.forEach((dependencies, agent) => {
        dependencies.forEach(dependency => {
            edges.push({
                id: `${dependency}_to_${agent}`,
                source: dependency,
                target: agent
            });
        });
    });

    // 创建结束节点
    const endNodeId = `${config.name}_end`;
    nodes.push({
        id: endNodeId,
        type: 'decision',
        label: 'End',
        data: {
            description: 'Workflow ending point'
        },
        dependencies: []
    });

    // 找出没有被依赖的节点，连接到结束节点
    const nodesDependedOn = new Set<string>();
    edges.forEach(edge => nodesDependedOn.add(edge.target));

    const terminalNodes = config.steps
        .filter(step => !nodesDependedOn.has(step.agent))
        .map(step => step.agent);

    terminalNodes.forEach(nodeId => {
        edges.push({
            id: `${nodeId}_to_${endNodeId}`,
            source: nodeId,
            target: endNodeId
        });
    });

    return {
        id: `graph_${config.name}_${Date.now()}`,
        name: config.name,
        nodes,
        edges,
        metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: '1.0.0',
            layout: 'horizontal',
            displayMode: 'simple'
        }
    };
}

/**
 * 优化工作流图布局，分配节点位置
 * @param graph 工作流图
 * @returns 优化后的工作流图
 */
export function optimizeGraphLayout(graph: WorkflowGraph): WorkflowGraph {
    // 创建图的深拷贝
    const optimizedGraph = JSON.parse(JSON.stringify(graph)) as WorkflowGraph;

    // 创建层级映射，计算每个节点的最大深度
    const layers: Record<string, number> = {};

    // 初始化所有节点层级为0
    optimizedGraph.nodes.forEach(node => {
        layers[node.id] = 0;
    });

    // 递归计算节点层级
    function calculateLayers(nodeId: string, currentLayer: number) {
        const node = optimizedGraph.nodes.find(n => n.id === nodeId);
        if (!node) return;

        layers[nodeId] = Math.max(layers[nodeId], currentLayer);

        // 查找所有依赖于该节点的边
        const outgoingEdges = optimizedGraph.edges.filter(edge => edge.source === nodeId);
        for (const edge of outgoingEdges) {
            calculateLayers(edge.target, currentLayer + 1);
        }
    }

    // 从起始节点开始计算
    const startNodes = optimizedGraph.nodes.filter(n => n.dependencies.length === 0);
    startNodes.forEach(node => {
        calculateLayers(node.id, 0);
    });

    // 为每个节点分配横向和纵向位置
    let layerCounts: Record<number, number> = {};

    // 计算每层节点数量
    Object.values(layers).forEach(layer => {
        layerCounts[layer] = (layerCounts[layer] || 0) + 1;
    });

    // 分配位置
    optimizedGraph.nodes.forEach(node => {
        const layer = layers[node.id];
        const nodesInLayer = layerCounts[layer] || 1;

        // 初始化数据对象和位置
        if (!node.data) node.data = {};

        // 分配位置：横向按层级分配，纵向按层内索引分配
        // 为了修复测试，确保每个层级的x不同，这里使用200+层级*100
        node.data.position = {
            x: 100 + layer * 200,
            y: 100 + ((optimizedGraph.nodes.filter(n => layers[n.id] === layer).indexOf(node) / nodesInLayer) * 300)
        };

        // 添加层级信息
        node.data.layer = layer;
    });

    return optimizedGraph;
}

/**
 * 导出工作流图为DOT格式（用于Graphviz可视化）
 * @param graph 工作流图
 * @returns DOT格式字符串
 */
export function exportGraphAsDOT(graph: WorkflowGraph): string {
    let dot = `digraph "${graph.name}" {\n`;
    dot += '  rankdir=LR;\n'; // 左到右布局
    dot += '  node [shape=box, style=filled, fillcolor=lightblue];\n';

    // 添加节点
    graph.nodes.forEach(node => {
        const shape = node.type === 'decision' ? 'diamond' :
            node.type === 'agent' ? 'box' : 'ellipse';
        const fillcolor = node.type === 'decision' ? 'lightgrey' :
            node.type === 'agent' ? 'lightblue' : 'white';

        dot += `  "${node.id}" [label="${node.label}", shape=${shape}, fillcolor=${fillcolor}];\n`;
    });

    // 添加边
    graph.edges.forEach(edge => {
        dot += `  "${edge.source}" -> "${edge.target}"`;
        if (edge.label) {
            dot += ` [label="${edge.label}"]`;
        }
        dot += ';\n';
    });

    dot += '}\n';
    return dot;
}

/**
 * 导出工作流图为JSON格式
 * @param graph 工作流图
 * @returns JSON字符串
 */
export function exportGraphAsJSON(graph: WorkflowGraph): string {
    return JSON.stringify(graph, null, 2);
}

/**
 * 导出工作流图为Mermaid格式
 * @param graph 工作流图
 * @returns Mermaid格式字符串
 */
export function exportGraphAsMermaid(graph: WorkflowGraph): string {
    let mermaid = 'graph LR;\n';

    // 添加节点
    graph.nodes.forEach(node => {
        const shape = node.type === 'decision' ? '{{' :
            node.type === 'agent' ? '[' : '(';
        const endShape = node.type === 'decision' ? '}}' :
            node.type === 'agent' ? ']' : ')';

        mermaid += `  ${node.id}${shape}${node.label}${endShape};\n`;
    });

    // 添加边
    graph.edges.forEach(edge => {
        mermaid += `  ${edge.source} --> `;
        if (edge.label) {
            mermaid += `|${edge.label}|`;
        }
        mermaid += ` ${edge.target};\n`;
    });

    return mermaid;
}

/**
 * 分析工作流图并提供优化建议
 * @param graph 工作流图
 * @returns 优化建议列表
 */
export function analyzeGraph(graph: WorkflowGraph): string[] {
    const suggestions: string[] = [];

    // 1. 检查孤立节点
    const connectedNodes = new Set<string>();
    graph.edges.forEach(edge => {
        connectedNodes.add(edge.source);
        connectedNodes.add(edge.target);
    });

    const isolatedNodes = graph.nodes.filter(node => !connectedNodes.has(node.id));
    if (isolatedNodes.length > 0) {
        suggestions.push(`发现${isolatedNodes.length}个孤立节点: ${isolatedNodes.map(n => n.label).join(', ')}`);
    }

    // 2. 检查环路
    const cycles = detectCycles(graph);
    if (cycles.length > 0) {
        suggestions.push(`发现${cycles.length}个循环依赖，这可能导致工作流无法完成`);
    }

    // 3. 检查长路径（可能需要并行化）
    const longestPath = findLongestPath(graph);
    if (longestPath.length > 5) {
        suggestions.push(`工作流包含较长的执行路径 (${longestPath.length} 步)，考虑并行化部分步骤`);
    }

    // 4. 检查瓶颈节点
    const bottlenecks = findBottlenecks(graph);
    if (bottlenecks.length > 0) {
        suggestions.push(`发现${bottlenecks.length}个瓶颈节点: ${bottlenecks.map(n => n.label).join(', ')}`);
    }

    return suggestions;
}

/**
 * 检测图中的环路
 */
function detectCycles(graph: WorkflowGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    // 为每个节点执行DFS
    graph.nodes.forEach(node => {
        detectCyclesDFS(node.id, visited, recStack, [], cycles, graph);
    });

    return cycles;
}

/**
 * 使用DFS检测环路
 */
function detectCyclesDFS(
    nodeId: string,
    visited: Set<string>,
    recStack: Set<string>,
    path: string[],
    cycles: string[][],
    graph: WorkflowGraph
): void {
    if (recStack.has(nodeId)) {
        // 找到环路
        const cycleStart = path.indexOf(nodeId);
        cycles.push(path.slice(cycleStart).concat(nodeId));
        return;
    }

    if (visited.has(nodeId)) {
        return;
    }

    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    // 访问所有出边
    const outEdges = graph.edges.filter(edge => edge.source === nodeId);
    outEdges.forEach(edge => {
        detectCyclesDFS(edge.target, visited, recStack, [...path], cycles, graph);
    });

    recStack.delete(nodeId);
}

/**
 * 查找最长路径
 */
function findLongestPath(graph: WorkflowGraph): string[] {
    // 初始化距离映射
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();

    graph.nodes.forEach(node => {
        dist.set(node.id, node.id.includes('_start') ? 0 : -Infinity);
    });

    // 拓扑排序节点
    const sortedNodes = topologicalSort(graph);

    // 对每个节点按拓扑顺序计算距离
    sortedNodes.forEach(nodeId => {
        const outEdges = graph.edges.filter(edge => edge.source === nodeId);

        outEdges.forEach(edge => {
            const newDist = (dist.get(nodeId) || 0) + 1;
            if (newDist > (dist.get(edge.target) || -Infinity)) {
                dist.set(edge.target, newDist);
                prev.set(edge.target, nodeId);
            }
        });
    });

    // 找到距离最大的节点
    let maxDist = -Infinity;
    let maxNode = '';

    dist.forEach((distance, nodeId) => {
        if (distance > maxDist) {
            maxDist = distance;
            maxNode = nodeId;
        }
    });

    // 回溯构建路径
    const path: string[] = [];
    let current = maxNode;

    while (current) {
        path.unshift(current);
        current = prev.get(current) || '';
    }

    return path;
}

/**
 * 图的拓扑排序
 */
function topologicalSort(graph: WorkflowGraph): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    // 对每个未访问的节点执行DFS
    for (const node of graph.nodes) {
        if (!visited.has(node.id) && !temp.has(node.id)) {
            topologicalSortDFS(node.id, visited, temp, result, graph);
        }
    }

    return result.reverse();
}

/**
 * 拓扑排序的DFS辅助函数
 */
function topologicalSortDFS(
    nodeId: string,
    visited: Set<string>,
    temp: Set<string>,
    result: string[],
    graph: WorkflowGraph
): void {
    temp.add(nodeId);

    // 访问所有出边
    const outEdges = graph.edges.filter(edge => edge.source === nodeId);

    for (const edge of outEdges) {
        if (temp.has(edge.target)) {
            // 有环，跳过
            continue;
        }

        if (!visited.has(edge.target)) {
            topologicalSortDFS(edge.target, visited, temp, result, graph);
        }
    }

    temp.delete(nodeId);
    visited.add(nodeId);
    result.push(nodeId);
}

/**
 * 找出瓶颈节点
 */
function findBottlenecks(graph: WorkflowGraph): WorkflowNode[] {
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    // 计算每个节点的入度和出度
    graph.nodes.forEach(node => {
        inDegree.set(node.id, 0);
        outDegree.set(node.id, 0);
    });

    graph.edges.forEach(edge => {
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
    });

    // 找出入度和出度都高的节点
    return graph.nodes.filter(node =>
        (inDegree.get(node.id) || 0) > 1 &&
        (outDegree.get(node.id) || 0) > 1
    );
} 