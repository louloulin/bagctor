/**
 * 记忆系统使用示例
 */
import { MemoryStore } from '../memory/memory_system';

async function main() {
    console.log('=== 记忆系统示例 ===\n');

    // 创建记忆存储实例
    const memory = new MemoryStore({
        shortTermCapacity: 10,
        longTermCapacity: 20,
        accessThreshold: 2 // 访问2次后自动转移到长期记忆
    });

    // 存储短期记忆
    console.log('添加短期记忆...');
    memory.setShortTerm('user_preference', { theme: 'dark', fontSize: 14 });
    memory.setShortTerm('last_query', '如何使用Bactor框架?', { importance: 0.3 });
    memory.setShortTerm('recent_topic', 'Actor模型', {
        importance: 0.8,
        tags: ['topic', 'technical']
    });

    // 存储长期记忆
    console.log('添加长期记忆...');
    memory.setLongTerm('user_profile', {
        name: '张三',
        level: 'advanced',
        interests: ['分布式系统', '人工智能']
    }, { importance: 0.9, tags: ['profile', 'permanent'] });

    // 获取记忆
    console.log('\n获取记忆:');
    console.log('用户偏好:', memory.getShortTerm('user_preference'));
    console.log('最近主题:', memory.getShortTerm('recent_topic'));
    console.log('用户资料:', memory.getLongTerm('user_profile'));

    // 再次访问促进记忆转移
    console.log('\n再次访问最近主题，促进记忆转移:');
    console.log('最近主题(首次):', memory.getShortTerm('recent_topic'));
    console.log('最近主题(再次):', memory.getShortTerm('recent_topic'));

    // 查看记忆是否已转移到长期记忆
    console.log('\n检查记忆是否已转移到长期记忆:');
    const shortTermRecent = memory.getShortTerm('recent_topic');
    const longTermRecent = memory.getLongTerm('recent_topic');
    console.log('短期记忆中的最近主题:', shortTermRecent);
    console.log('长期记忆中的最近主题:', longTermRecent);

    // 使用标签查询记忆
    console.log('\n按标签查询记忆:');
    const technicalTopics = memory.queryLongTerm({
        tags: ['technical'],
        sortBy: 'importance',
        sortOrder: 'desc'
    });
    console.log('技术相关主题:', technicalTopics);

    // 使用重要性查询记忆
    console.log('\n按重要性查询记忆:');
    const importantMemories = memory.queryLongTerm({
        minImportance: 0.7
    });
    console.log('重要记忆:', importantMemories);

    // 删除记忆
    console.log('\n删除记忆:');
    memory.removeLongTerm('user_profile');
    console.log('删除后的用户资料:', memory.getLongTerm('user_profile'));

    // 获取统计信息
    console.log('\n记忆统计:');
    console.log(memory.getStats());

    // 清理
    console.log('\n清理记忆存储:');
    memory.dispose();
    console.log('记忆系统已清理');
}

// 运行示例
main().catch(err => {
    console.error('示例执行错误:', err);
}); 