import { describe, test, expect } from 'bun:test';
import {
    createWorkflowGraph,
    optimizeGraphLayout,
    exportGraphAsDOT,
    exportGraphAsMermaid,
    analyzeGraph
} from '../workflow-graph';
import { WorkflowConfig } from '../types';

describe('Workflow Graph Tests', () => {
    test('should create a graph from workflow config', () => {
        const config: WorkflowConfig = {
            name: 'test-workflow',
            steps: [
                {
                    agent: 'researchAgent',
                    input: 'Collect information about workflow graphs',
                    output: 'research'
                },
                {
                    agent: 'writingAgent',
                    input: (context) => `Write an article based on: ${context.research}`,
                    output: 'article'
                },
                {
                    agent: 'editingAgent',
                    input: (context) => `Edit this article: ${context.article}`,
                    output: 'finalArticle'
                }
            ]
        };

        const graph = createWorkflowGraph(config);

        // 验证基本结构
        expect(graph).toBeDefined();
        expect(graph.name).toBe('test-workflow');
        expect(graph.nodes.length).toBe(5); // 3个步骤 + 开始结束节点
        expect(graph.edges.length).toBeGreaterThan(0);

        // 验证依赖关系
        const writingNode = graph.nodes.find(n => n.id === 'writingAgent');
        expect(writingNode).toBeDefined();
        expect(writingNode?.dependencies).toContain('researchAgent');

        const editingNode = graph.nodes.find(n => n.id === 'editingAgent');
        expect(editingNode).toBeDefined();
        expect(editingNode?.dependencies).toContain('writingAgent');
    });

    test('should optimize graph layout', () => {
        const config: WorkflowConfig = {
            name: 'layout-test',
            steps: [
                { agent: 'step1', input: 'Step 1', output: 'result1' },
                { agent: 'step2', input: (context) => `Step 2 using ${context.result1}`, output: 'result2' },
                { agent: 'step3', input: (context) => `Step 3 using ${context.result2}`, output: 'result3' }
            ]
        };

        const graph = createWorkflowGraph(config);
        const optimizedGraph = optimizeGraphLayout(graph);

        // 验证布局信息
        expect(optimizedGraph.nodes[0].data.position).toBeDefined();

        // 验证层级正确性
        const step1Node = optimizedGraph.nodes.find(n => n.id === 'step1');
        const step2Node = optimizedGraph.nodes.find(n => n.id === 'step2');
        const step3Node = optimizedGraph.nodes.find(n => n.id === 'step3');

        if (step1Node?.data.position && step2Node?.data.position) {
            expect(step1Node.data.position.x).toBeLessThan(step2Node.data.position.x);
        }

        if (step2Node?.data.position && step3Node?.data.position) {
            expect(step2Node.data.position.x).toBeLessThan(step3Node.data.position.x);
        }
    });

    test('should export graph as DOT format', () => {
        const config: WorkflowConfig = {
            name: 'export-test',
            steps: [
                { agent: 'step1', input: 'Step 1', output: 'result1' },
                { agent: 'step2', input: 'Step 2', output: 'result2' }
            ]
        };

        const graph = createWorkflowGraph(config);
        const dotString = exportGraphAsDOT(graph);

        expect(dotString).toContain('digraph "export-test"');
        expect(dotString).toContain('"step1"');
        expect(dotString).toContain('"step2"');
        expect(dotString).toContain('->');
    });

    test('should export graph as Mermaid format', () => {
        const config: WorkflowConfig = {
            name: 'mermaid-test',
            steps: [
                { agent: 'step1', input: 'Step 1', output: 'result1' },
                { agent: 'step2', input: 'Step 2', output: 'result2' }
            ]
        };

        const graph = createWorkflowGraph(config);
        const mermaidString = exportGraphAsMermaid(graph);

        expect(mermaidString).toContain('graph LR');
        expect(mermaidString).toContain('step1');
        expect(mermaidString).toContain('step2');
        expect(mermaidString).toContain('-->');
    });

    test('should analyze graph and provide suggestions', () => {
        // 创建一个有瓶颈节点的工作流
        const config: WorkflowConfig = {
            name: 'analysis-test',
            steps: [
                { agent: 'step1', input: 'Step 1', output: 'result1' },
                { agent: 'step2', input: 'Step 2', output: 'result2' },
                { agent: 'bottleneck', input: (context) => `Using ${context.result1} and ${context.result2}`, output: 'combined' },
                { agent: 'step4', input: (context) => `Step 4 using ${context.combined}`, output: 'result4' },
                { agent: 'step5', input: (context) => `Step 5 using ${context.combined}`, output: 'result5' },
            ]
        };

        const graph = createWorkflowGraph(config);
        const suggestions = analyzeGraph(graph);

        expect(suggestions).toBeDefined();
        expect(suggestions.length).toBeGreaterThan(0);
    });
}); 