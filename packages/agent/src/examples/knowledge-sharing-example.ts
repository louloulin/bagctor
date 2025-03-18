/**
 * 智能体知识共享与同步示例
 * 展示如何配置和使用智能体之间的知识共享功能
 */

import { Bagctor } from '../bagctor';
import { Agent } from '@mastra/core/agent';
import { ImportanceLevel, KnowledgeFlowType, SyncDirection } from '../knowledge-sharing';

// 创建模拟的智能体
function createMockAgent(name: string): Agent {
    return {
        name,
        generate: async (prompt: string) => {
            console.log(`[${name}] 收到提示: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`);
            return { text: `[${name}的回复] 基于您的请求"${prompt.substring(0, 30)}..."，我的回答是...` };
        }
    } as unknown as Agent;
}

/**
 * 示例1: 基本知识同步
 */
async function example1_basicKnowledgeSync() {
    console.log('\n===== 示例1: 基本知识同步 =====');

    // 创建Bagctor实例
    const bagctor = new Bagctor();

    // 创建两个智能体
    const expertAgent = createMockAgent('专家');
    const studentAgent = createMockAgent('学生');

    // 注册智能体
    (bagctor as any).agentsMap.set('expert', expertAgent);
    (bagctor as any).agentsMap.set('student', studentAgent);

    // 初始化知识共享
    const sharingManager = bagctor.initKnowledgeSharing();

    console.log('获取智能体知识库...');
    // 获取知识库
    const expertKB = sharingManager.getKnowledgeBase('expert');
    const studentKB = sharingManager.getKnowledgeBase('student');

    // 向专家知识库添加知识
    console.log('向专家添加知识...');
    await expertKB?.addEntity({
        type: 'fact',
        content: '机器学习是人工智能的一个子领域，专注于开发能够从数据中学习的算法',
        importance: ImportanceLevel.High,
        confidence: 0.95,
        tags: ['AI', '机器学习', '基础概念']
    });

    await expertKB?.addEntity({
        type: 'procedure',
        content: '训练神经网络的步骤: 1.准备数据 2.设计网络结构 3.选择损失函数 4.优化参数 5.评估模型',
        importance: ImportanceLevel.Medium,
        confidence: 0.9,
        tags: ['AI', '神经网络', '训练流程']
    });

    // 向学生知识库添加一些基础知识
    console.log('向学生添加基础知识...');
    await studentKB?.addEntity({
        type: 'fact',
        content: '人工智能是计算机科学的一个分支',
        importance: ImportanceLevel.Medium,
        confidence: 0.8,
        tags: ['AI', '基础概念']
    });

    // 设置单向同步 - 从专家到学生
    console.log('配置从专家到学生的知识同步...');
    bagctor.setupKnowledgeSync('expert', 'student', {
        direction: SyncDirection.OneWay,
        minImportance: ImportanceLevel.Medium,
        autoSync: false // 手动控制同步
    });

    // 执行同步
    console.log('执行同步...');
    const syncCount = await bagctor.syncKnowledgeNow('expert', 'student');

    console.log(`同步了 ${syncCount} 条知识`);

    // 查看学生知识库内容
    const studentKnowledge = studentKB?.queryEntities() || [];
    console.log('\n学生现在的知识:');
    studentKnowledge.forEach((entity, index) => {
        console.log(`${index + 1}. [${entity.type}] ${entity.content.substring(0, 50)}... (可信度: ${entity.confidence})`);
    });

    // 生成知识摘要
    console.log('\n学生知识摘要:');
    const summary = await studentKB?.getKnowledgeSummary();
    console.log(summary);
}

/**
 * 示例2: 知识流配置
 */
async function example2_knowledgeFlow() {
    console.log('\n===== 示例2: 知识流配置 =====');

    // 创建Bagctor实例
    const bagctor = new Bagctor();

    // 创建多个专业智能体
    const researchAgent = createMockAgent('研究员');
    const engineerAgent = createMockAgent('工程师');
    const writerAgent = createMockAgent('文案');
    const managerAgent = createMockAgent('项目经理');

    // 注册智能体
    (bagctor as any).agentsMap.set('researcher', researchAgent);
    (bagctor as any).agentsMap.set('engineer', engineerAgent);
    (bagctor as any).agentsMap.set('writer', writerAgent);
    (bagctor as any).agentsMap.set('manager', managerAgent);

    // 获取知识共享管理器
    const sharingManager = bagctor.initKnowledgeSharing();

    // 向各智能体添加知识
    console.log('向各智能体添加专业知识...');

    // 研究员知识
    await sharingManager.getKnowledgeBase('researcher')?.addEntity({
        type: 'fact',
        content: '最新研究表明，transformer架构在长序列处理方面存在二次方复杂度问题',
        importance: ImportanceLevel.High,
        confidence: 0.9,
        tags: ['research', 'transformer', 'challenge']
    });

    // 工程师知识
    await sharingManager.getKnowledgeBase('engineer')?.addEntity({
        type: 'procedure',
        content: '优化transformer注意力机制的方法: 1.稀疏注意力 2.局部注意力 3.层次注意力',
        importance: ImportanceLevel.High,
        confidence: 0.85,
        tags: ['engineering', 'optimization', 'transformer']
    });

    // 文案知识
    await sharingManager.getKnowledgeBase('writer')?.addEntity({
        type: 'fact',
        content: '技术文档应该兼顾准确性和可读性，并包含适当的示例',
        importance: ImportanceLevel.Medium,
        confidence: 0.95,
        tags: ['documentation', 'writing']
    });

    // 配置星型知识流 - 所有信息汇集到项目经理
    console.log('配置星型知识流，项目经理为中心节点...');
    bagctor.setupKnowledgeFlow({
        type: KnowledgeFlowType.Star,
        participants: ['researcher', 'engineer', 'writer', 'manager'],
        centralAgent: 'manager',
        minImportance: ImportanceLevel.Medium
    });

    // 获取项目经理的知识库
    const managerKB = sharingManager.getKnowledgeBase('manager');

    // 同步前查看项目经理知识
    console.log('\n同步前，项目经理的知识:');
    let managerKnowledge = managerKB?.queryEntities() || [];
    console.log(`项目经理拥有 ${managerKnowledge.length} 条知识`);

    // 手动触发所有同步
    console.log('\n触发所有同步...');
    await bagctor.syncKnowledgeNow('researcher', 'manager');
    await bagctor.syncKnowledgeNow('engineer', 'manager');
    await bagctor.syncKnowledgeNow('writer', 'manager');

    // 同步后查看项目经理知识
    console.log('\n同步后，项目经理的知识:');
    managerKnowledge = managerKB?.queryEntities() || [];
    console.log(`项目经理现在拥有 ${managerKnowledge.length} 条知识`);

    managerKnowledge.forEach((entity, index) => {
        console.log(`${index + 1}. [${entity.type}] ${entity.content.substring(0, 50)}... (来源: ${entity.createdBy})`);
    });

    // 生成同步报告
    console.log('\n知识同步报告:');
    const report = await bagctor.getKnowledgeSyncReport();
    console.log(`- 智能体数量: ${report.agentCount}`);
    console.log(`- 知识库数量: ${report.knowledgeBaseCount}`);
    console.log(`- 同步配置数量: ${report.syncPairsCount}`);
}

/**
 * 示例3: 不同同步模式
 */
async function example3_syncModes() {
    console.log('\n===== 示例3: 不同同步模式 =====');

    // 创建Bagctor实例
    const bagctor = new Bagctor();

    // 创建团队智能体
    const teamLeadAgent = createMockAgent('团队领导');
    const memberAAgent = createMockAgent('成员A');
    const memberBAgent = createMockAgent('成员B');
    const memberCAgent = createMockAgent('成员C');

    // 注册智能体
    (bagctor as any).agentsMap.set('lead', teamLeadAgent);
    (bagctor as any).agentsMap.set('memberA', memberAAgent);
    (bagctor as any).agentsMap.set('memberB', memberBAgent);
    (bagctor as any).agentsMap.set('memberC', memberCAgent);

    // 获取知识共享管理器
    const sharingManager = bagctor.initKnowledgeSharing();

    // 向各智能体添加知识
    console.log('向各智能体添加知识...');

    // 团队领导的知识
    await sharingManager.getKnowledgeBase('lead')?.addEntity({
        type: 'fact',
        content: '项目截止日期是下个月15日',
        importance: ImportanceLevel.Critical,
        confidence: 1.0,
        tags: ['project', 'deadline']
    });

    // 成员A的知识
    await sharingManager.getKnowledgeBase('memberA')?.addEntity({
        type: 'fact',
        content: '前端开发已完成75%',
        importance: ImportanceLevel.High,
        confidence: 0.9,
        tags: ['frontend', 'progress']
    });

    // 成员B的知识
    await sharingManager.getKnowledgeBase('memberB')?.addEntity({
        type: 'fact',
        content: '后端API开发遇到性能瓶颈',
        importance: ImportanceLevel.High,
        confidence: 0.8,
        tags: ['backend', 'issue']
    });

    // 成员C的知识
    await sharingManager.getKnowledgeBase('memberC')?.addEntity({
        type: 'fact',
        content: '测试用例覆盖率达到90%',
        importance: ImportanceLevel.Medium,
        confidence: 0.95,
        tags: ['testing', 'coverage']
    });

    console.log('\n示例3.1: 链式同步');
    // 配置链式知识流: 领导 -> 成员A -> 成员B -> 成员C
    bagctor.setupKnowledgeFlow({
        type: KnowledgeFlowType.Chain,
        participants: ['lead', 'memberA', 'memberB', 'memberC'],
        minImportance: ImportanceLevel.High // 只同步重要信息
    });

    // 手动触发同步链
    await bagctor.syncKnowledgeNow('lead', 'memberA');
    await bagctor.syncKnowledgeNow('memberA', 'memberB');
    await bagctor.syncKnowledgeNow('memberB', 'memberC');

    // 查看各成员获得的知识
    console.log('\n链式同步后，各成员的截止日期知识状态:');
    const membersKB = [
        sharingManager.getKnowledgeBase('memberA'),
        sharingManager.getKnowledgeBase('memberB'),
        sharingManager.getKnowledgeBase('memberC')
    ];

    membersKB.forEach((kb, index) => {
        const memberName = ['成员A', '成员B', '成员C'][index];
        const hasDeadlineKnowledge = kb?.queryEntities()
            .some(entity => entity.content.includes('截止日期'));

        console.log(`${memberName} ${hasDeadlineKnowledge ? '已知道' : '未知道'}项目截止日期`);
    });

    // 清理同步配置
    console.log('\n清理同步配置...');
    (bagctor as any).knowledgeSharingManager = undefined;

    console.log('\n示例3.2: 广播同步');
    // 重新初始化
    const newSharingManager = bagctor.initKnowledgeSharing();

    // 配置广播知识流: 领导向所有成员广播
    bagctor.setupKnowledgeFlow({
        type: KnowledgeFlowType.Broadcast,
        participants: ['lead', 'memberA', 'memberB', 'memberC']
    });

    // 添加一条新知识
    await newSharingManager.getKnowledgeBase('lead')?.addEntity({
        type: 'fact',
        content: '明天上午10点有全体会议',
        importance: ImportanceLevel.High,
        confidence: 1.0,
        tags: ['meeting', 'announcement']
    });

    // 手动触发领导的广播
    await bagctor.syncKnowledgeNow('lead', 'memberA');
    await bagctor.syncKnowledgeNow('lead', 'memberB');
    await bagctor.syncKnowledgeNow('lead', 'memberC');

    // 查看各成员获得的知识
    console.log('\n广播同步后，各成员的会议通知状态:');
    ['memberA', 'memberB', 'memberC'].forEach(memberId => {
        const kb = newSharingManager.getKnowledgeBase(memberId);
        const hasMeetingKnowledge = kb?.queryEntities()
            .some(entity => entity.content.includes('会议'));

        console.log(`${memberId} ${hasMeetingKnowledge ? '已收到' : '未收到'}会议通知`);
    });
}

/**
 * 示例4: 共享记忆上下文
 */
async function example4_sharedMemoryContext() {
    console.log('\n===== 示例4: 共享记忆上下文 =====');

    // 创建Bagctor实例
    const bagctor = new Bagctor();

    // 创建多个智能体
    const productManager = createMockAgent('产品经理');
    const developer = createMockAgent('开发人员');
    const designer = createMockAgent('设计师');

    // 注册智能体
    (bagctor as any).agentsMap.set('pm', productManager);
    (bagctor as any).agentsMap.set('dev', developer);
    (bagctor as any).agentsMap.set('designer', designer);

    // 初始化记忆管理器（使用enableMemorySystem方法而不是直接赋值）
    console.log('初始化记忆管理器...');

    // 创建一个模拟的存储适配器
    const mockStorage = {
        addItem: async (item: any) => {
            console.log(`添加记忆: ${item.content} (来源: ${item.source})`);
            return 'memory_id_' + Math.random().toString(36).substring(2);
        },
        getItem: async (id: string) => null,
        updateItem: async (id: string, updates: any) => true,
        deleteItem: async (id: string) => true,
        queryItems: async (options?: any) => [],
        clear: async () => { }
    };

    // 使用正确的API初始化记忆系统
    bagctor.enableMemorySystem({
        cacheSize: 100,
        customStorage: mockStorage
    });

    // 初始化知识共享
    const sharingManager = bagctor.initKnowledgeSharing();

    // 向各智能体添加知识
    console.log('向各智能体添加知识...');

    // 产品经理的知识
    const pmKB = sharingManager.getKnowledgeBase('pm');
    await pmKB?.addEntity({
        type: 'fact',
        content: '用户反馈显示需要简化登录流程',
        importance: ImportanceLevel.High,
        confidence: 0.9,
        tags: ['product', 'user feedback', 'login']
    });

    // 开发人员的知识
    const devKB = sharingManager.getKnowledgeBase('dev');
    await devKB?.addEntity({
        type: 'procedure',
        content: '当前登录流程包含5个步骤，可以优化合并为3个步骤',
        importance: ImportanceLevel.Medium,
        confidence: 0.8,
        tags: ['development', 'optimization', 'login']
    });

    // 设计师的知识
    const designerKB = sharingManager.getKnowledgeBase('designer');
    await designerKB?.addEntity({
        type: 'fact',
        content: '简化表单设计可以提高转化率约15%',
        importance: ImportanceLevel.Medium,
        confidence: 0.85,
        tags: ['design', 'conversion', 'forms']
    });

    // 创建共享上下文
    console.log('\n创建"登录优化"共享上下文...');

    // 使用shareKnowledgeToContext方法共享相关知识到上下文
    console.log('\n共享与"登录"相关的知识到上下文:');
    try {
        await bagctor.shareKnowledgeToContext('pm', 'login-improvement', 'login');
        await bagctor.shareKnowledgeToContext('dev', 'login-improvement', 'login');
        await bagctor.shareKnowledgeToContext('designer', 'login-improvement', 'forms');

        console.log('知识已成功共享到上下文');
    } catch (error) {
        // 这里可能会失败，因为我们使用的是模拟内存管理器
        console.log('注意: 在真实环境中，这里会将各智能体的知识共享到一个上下文中');
        console.log('共享上下文功能依赖于完整的内存管理器实现');
    }

    console.log('\n在真实实现中，共享上下文将允许:');
    console.log('1. 多个智能体访问同一个记忆/知识空间');
    console.log('2. 智能体可以在上下文中添加和检索记忆');
    console.log('3. 生成上下文摘要，供所有参与智能体使用');
}

// 主函数
async function main() {
    try {
        await example1_basicKnowledgeSync();
        await example2_knowledgeFlow();
        await example3_syncModes();
        await example4_sharedMemoryContext();

        console.log('\n===== 所有示例完成 =====');
    } catch (error) {
        console.error('执行示例时出错:', error);
    }
}

// 执行主函数
if (require.main === module) {
    main();
}

// 导出供其他模块使用
export {
    example1_basicKnowledgeSync,
    example2_knowledgeFlow,
    example3_syncModes,
    example4_sharedMemoryContext
};