/**
 * 工具系统使用示例
 */
import { initializeTools, toolRegistry, Tool } from '../tools';

// 初始化内置工具
initializeTools();

async function main() {
    // 显示所有可用工具
    console.log('=== 可用工具 ===');
    const allTools = toolRegistry.getAllTools();
    allTools.forEach(tool => {
        console.log(`工具: ${tool.name}`);
        console.log(`  描述: ${tool.description}`);
        console.log(`  参数: ${tool.parameters.map(p => p.name).join(', ')}`);
        console.log();
    });

    // 执行搜索工具
    console.log('=== 执行网络搜索工具 ===');
    const searchResult = await toolRegistry.executeTool('web_search', {
        query: 'Bactor Actor模型',
        limit: 3
    });

    console.log('搜索结果:');
    console.log(JSON.stringify(searchResult, null, 2));
    console.log();

    // 执行文本摘要工具
    console.log('=== 执行文本摘要工具 ===');
    const longText = `
    Bactor是一个基于Actor模型的强大框架，设计用于构建分布式、并发的应用程序。
    Actor模型是一种并发计算模型，它将系统分解为独立的计算单元（Actor），每个Actor维护自己的状态，
    并通过消息传递与其他Actor通信。这种方式避免了共享状态和锁的复杂性，使并发程序更易于理解和开发。
    Bactor实现了高效的消息传递、监督策略和路由功能，使得开发者可以更专注于业务逻辑而非底层的并发控制。
    此外，Bactor还支持分布式部署，允许Actor跨网络通信，从而构建可扩展的分布式系统。
  `.trim().replace(/\s+/g, ' ');

    const summaryResult = await toolRegistry.executeTool('text_summarize', {
        text: longText,
        max_length: 100
    });

    console.log('摘要结果:');
    console.log(JSON.stringify(summaryResult, null, 2));
    console.log();

    // 执行代码执行工具
    console.log('=== 执行代码工具 ===');
    const codeResult = await toolRegistry.executeTool('execute_code', {
        code: `
      // 计算斐波那契数列
      function fibonacci(n) {
        if (n <= 1) return n;
        return fibonacci(n-1) + fibonacci(n-2);
      }
      
      // 计算前10个斐波那契数
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(fibonacci(i));
      }
      
      console.log("斐波那契数列:");
      console.log(results);
      
      // 返回结果
      return results;
    `
    });

    console.log('代码执行结果:');
    console.log(JSON.stringify(codeResult, null, 2));
}

// 运行示例
main().catch(err => {
    console.error('示例执行错误:', err);
}); 