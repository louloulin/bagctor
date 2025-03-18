/**
 * 基于工具的智能体协作示例
 * 展示如何使用智能体作为工具、创建工具链和协作模型
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Bagctor } from '../bagctor';
import { createQwen } from 'qwen-ai-provider';
import { createAgentTool, AgentToolGroup, ToolChain } from '../agent-tools';

// 创建模拟的Qwen提供者
// 在实际环境中，应该使用真实的API密钥
function mockQwen(model: string) {
    return () => ({
        async generate(prompt: string) {
            console.log(`[${model}] 收到提示: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);

            // 根据不同模型返回不同的模拟响应
            if (prompt.includes('翻译')) {
                return {
                    text: `[翻译结果]: ${prompt.split('\n').pop()}`.replace(/翻译成(中文|英文)[:：]/, '')
                };
            } else if (prompt.includes('总结')) {
                return {
                    text: `[总结]: 这是一个关于${prompt.includes('技术') ? '技术' : '内容'}的摘要。${prompt.includes('简短') ? '内容简明扼要。' : '包含了主要观点和细节。'}`
                };
            } else if (prompt.includes('代码') || prompt.includes('编程')) {
                return {
                    text: `[代码示例]:\n\`\`\`python\ndef example_function():\n    print("这是一个示例函数")\n    return True\n\`\`\``
                };
            } else {
                return {
                    text: `这是来自${model}的回复。我已处理了您的请求: "${prompt.substring(0, 30)}..."`
                };
            }
        }
    });
}

// 创建一个Bagctor实例
const bagctor = new Bagctor();

// 创建各种专业智能体
const translatorAgent = new Agent({
    name: 'translator',
    instructions: '你是一个专业翻译，可以在中英文之间进行高质量翻译。保持原文的语气和风格。',
    model: mockQwen('qwen-translator')() as any,
});

const writerAgent = new Agent({
    name: 'writer',
    instructions: '你是一个专业文案撰写者，能够创作高质量的内容。注重表达的流畅性和吸引力。',
    model: mockQwen('qwen-writer')() as any,
});

const techAgent = new Agent({
    name: 'tech',
    instructions: '你是一个技术专家，精通编程和计算机科学。提供清晰、准确的技术解释和代码示例。',
    model: mockQwen('qwen-tech')() as any,
});

const editorAgent = new Agent({
    name: 'editor',
    instructions: '你是一个内容编辑，专长于改进和完善文章。注重语法、结构和整体质量。',
    model: mockQwen('qwen-editor')() as any,
});

// 注册智能体到Bagctor
// 在测试示例中，直接访问内部属性
const bagctorAny = bagctor as any;
bagctorAny.agentsMap.set('translator', translatorAgent);
bagctorAny.agentsMap.set('writer', writerAgent);
bagctorAny.agentsMap.set('tech', techAgent);
bagctorAny.agentsMap.set('editor', editorAgent);

/**
 * 示例1: 将智能体包装为工具
 */
async function example1_agentAsTool() {
    console.log('\n===== 示例1: 将智能体包装为工具 =====');

    // 创建基于翻译智能体的工具
    const translationTool = bagctor.createAgentTool({
        id: 'translate',
        description: '将文本在中英文之间翻译',
        agent: 'translator',
        template: '请将以下文本翻译成{{input.targetLanguage}}:\n{{input.text}}'
    });

    // 使用翻译工具
    console.log('使用翻译工具:');

    const translationResult = await translationTool.handler({
        text: 'Hello world, this is a test for translation.',
        targetLanguage: '中文'
    });

    console.log('翻译结果:', translationResult);

    // 创建基于技术智能体的工具
    const codeExampleTool = bagctor.createAgentTool({
        id: 'code-example',
        description: '生成指定编程语言的代码示例',
        agent: 'tech',
        template: '请为以下功能提供{{input.language}}代码示例:\n{{input.functionality}}'
    });

    // 使用代码示例工具
    console.log('\n使用代码示例工具:');

    const codeResult = await codeExampleTool.handler({
        functionality: '实现一个简单的网络请求函数',
        language: 'Python'
    });

    console.log('代码示例:', codeResult);
}

/**
 * 示例2: 工具链 - 创建发布流程
 */
async function example2_toolChain() {
    console.log('\n===== 示例2: 工具链 - 内容创作流程 =====');

    // 创建内容写作工具
    const writingTool = createAgentTool({
        id: 'write-content',
        description: '创作内容',
        agent: writerAgent,
        template: '请创作一篇关于{{input.topic}}的{{input.contentType}}，长度大约{{input.wordCount}}字。'
    });

    // 创建内容编辑工具
    const editingTool = createAgentTool({
        id: 'edit-content',
        description: '编辑和完善内容',
        agent: editorAgent,
        template: '请编辑以下内容，提高其质量和可读性：\n\n{{input.content}}'
    });

    // 创建翻译工具
    const translatingTool = createAgentTool({
        id: 'translate-content',
        description: '翻译内容',
        agent: translatorAgent,
        template: '请将以下{{input.contentType}}翻译成{{input.targetLanguage}}：\n\n{{input.content}}'
    });

    // 创建工具链
    const contentProductionChain = bagctor.createToolChain('content-production')
        .add(writingTool, {
            id: 'writing',
            input: (input) => ({
                topic: input.topic,
                contentType: input.contentType || '文章',
                wordCount: input.wordCount || 500
            })
        })
        .add(editingTool, {
            id: 'editing',
            input: (input, results) => ({
                content: results?.writing || '无内容'
            })
        })
        .add(translatingTool, {
            id: 'translation',
            input: (input, results) => ({
                content: results?.editing || results?.writing || '无内容',
                contentType: input.contentType || '文章',
                targetLanguage: input.translateTo || '英文'
            })
        })
        .build();

    // 执行工具链
    console.log('开始执行内容创作工具链:');

    const chainResult = await bagctor.executeToolChain(contentProductionChain, {
        topic: '人工智能在日常生活中的应用',
        contentType: '博客文章',
        wordCount: 300,
        translateTo: '英文'
    });

    console.log('\n创作流程结果:');
    console.log('- 原始内容:', chainResult.writing ? '已创建' : '失败');
    console.log('- 编辑内容:', chainResult.editing ? '已完成' : '失败');
    console.log('- 翻译结果:', chainResult.translation ? '已完成' : '失败');

    if (chainResult.translation) {
        console.log('\n最终翻译结果示例:', chainResult.translation.substr(0, 150) + '...');
    }
}

/**
 * 示例3: 协作者智能体
 */
async function example3_coordinatorAgent() {
    console.log('\n===== 示例3: 协作者智能体 =====');

    // 创建一个协作者智能体，使用其他智能体作为工具
    const contentCoordinator = bagctor.createCoordinatorAgent({
        name: 'content-coordinator',
        instructions: `你是一个内容协调者，负责管理多个专家来创建高质量的内容。
你有以下工具可用：
- translator-tool: 使用翻译专家翻译内容
- writer-tool: 使用文案专家创作内容
- tech-tool: 使用技术专家创建技术内容
- editor-tool: 使用编辑专家完善内容

当需要创建内容时，请按照以下流程：
1. 使用writer-tool创建初始内容
2. 如果需要技术内容，使用tech-tool补充技术细节
3. 使用editor-tool完善和编辑内容
4. 如果需要其他语言版本，使用translator-tool翻译内容

请根据用户需求灵活使用这些工具，确保最终内容高质量。`,
        model: mockQwen('qwen-coordinator')(),
        agentTools: ['translator', 'writer', 'tech', 'editor']
    });

    // 使用协作者智能体
    console.log('向协作者智能体发送任务:');

    const coordinatorResult = await contentCoordinator.generate(
        '我需要一篇关于人工智能和机器学习的博客文章，包含一些简单的代码示例，并翻译成英文。'
    );

    console.log('\n协作者智能体结果:');
    console.log(coordinatorResult.text.substring(0, 150) + '...');
}

/**
 * 示例4: 智能体工具集团队
 */
async function example4_agentToolGroup() {
    console.log('\n===== 示例4: 智能体工具集团队 =====');

    // 创建智能体工具组
    const contentTeam = new AgentToolGroup();

    // 添加智能体
    contentTeam.addAgent('writer', writerAgent);
    contentTeam.addAgent('tech', techAgent);
    contentTeam.addAgent('editor', editorAgent);

    // 创建专门的工具
    contentTeam.createTool({
        id: 'write-blog',
        description: '写一篇博客文章',
        agent: 'writer',
        template: '请写一篇标题为《{{input.title}}》的博客文章，主题是{{input.topic}}，长度大约{{input.wordCount}}字。'
    });

    contentTeam.createTool({
        id: 'add-technical-content',
        description: '添加技术内容',
        agent: 'tech',
        template: '请在以下内容的基础上，增加关于{{input.technology}}的技术细节和示例代码：\n\n{{input.content}}'
    });

    contentTeam.createTool({
        id: 'polish-content',
        description: '润色内容',
        agent: 'editor',
        template: '请润色和完善以下内容，提高其可读性和专业性：\n\n{{input.content}}'
    });

    // 创建并执行工作流
    console.log('执行内容团队工作流:');

    // 第一步：写博客
    console.log('步骤1: 写博客');
    const blogResult = await contentTeam.executeTool('write-blog', {
        title: '机器学习入门指南',
        topic: '机器学习基础知识',
        wordCount: 500
    });

    // 第二步：添加技术内容
    console.log('步骤2: 添加技术内容');
    const techResult = await contentTeam.executeTool('add-technical-content', {
        content: blogResult,
        technology: 'Python中的scikit-learn库'
    });

    // 第三步：润色内容
    console.log('步骤3: 润色内容');
    const finalResult = await contentTeam.executeTool('polish-content', {
        content: techResult
    });

    console.log('\n内容团队工作流结果:');
    console.log(finalResult.substring(0, 150) + '...');
}

// 主函数
async function main() {
    try {
        // 运行所有示例
        await example1_agentAsTool();
        await example2_toolChain();
        await example3_coordinatorAgent();
        await example4_agentToolGroup();

        console.log('\n===== 所有示例执行完成 =====');
    } catch (error) {
        console.error('示例执行过程中出错:', error);
    }
}

// 执行主函数
if (require.main === module) {
    main();
}

// 导出供其他示例使用
export {
    bagctor,
    translatorAgent,
    writerAgent,
    techAgent,
    editorAgent
}; 