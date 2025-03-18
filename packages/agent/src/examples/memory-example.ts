/**
 * 内存配置示例
 * 
 * 演示如何使用Bagctor的增强型Agent和内存配置功能
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { createMemoryManager } from '../memory';
import { createEnhancedAgent } from '../agent-adapters';
import { ImportanceLevel } from '../memory';

/**
 * 运行内存配置示例
 */
async function runMemoryExample() {
    // 创建标准的Mastra Agent
    const standardAgent = new Agent({
        name: "MemoryBot",
        instructions: "You are an assistant that remembers previous conversations and provides helpful responses.",
        model: openai("gpt-4o"),
    });

    // 创建内存管理器
    const memoryManager = createMemoryManager();

    // 创建增强的Agent，添加内存功能
    const enhancedAgent = createEnhancedAgent(standardAgent, memoryManager);

    console.log("Memory Bot is ready! Let's have a conversation with memory support.\n");

    // 定义会话标识符
    const resourceId = "user_123";
    const threadId = "conversation_456";

    // ----------------- 首次对话 -----------------
    console.log("USER: My name is Alice. I work as a software engineer.");

    // 使用增强的generate方法，启用内存
    const response1 = await enhancedAgent.generate(
        "My name is Alice. I work as a software engineer.",
        {
            resourceId,
            threadId,
            memoryOptions: {
                lastMessages: 5
            }
        }
    );

    console.log(`ASSISTANT: ${response1.text}\n`);

    // 向会话添加一个事实
    await enhancedAgent.addToMemory(
        "Alice likes to work on machine learning projects in her free time.",
        {
            type: "fact",
            importance: ImportanceLevel.Medium,
            resourceId,
            threadId,
            metadata: {
                category: "hobby",
                source: "user profile"
            }
        }
    );

    // ----------------- 第二次对话 -----------------
    console.log("USER: What kind of projects should I focus on next?");

    // 使用stream方法，启用内存并进行语义召回
    console.log("ASSISTANT: ");
    await enhancedAgent.stream(
        "What kind of projects should I focus on next?",
        {
            resourceId,
            threadId,
            memoryOptions: {
                lastMessages: 5,
                semanticRecall: {
                    topK: 3,
                    messageRange: 10
                }
            },
            onToken: (token) => process.stdout.write(token),
            onComplete: () => console.log("\n")
        }
    );

    // ----------------- 第三次对话 -----------------
    console.log("USER: I'm also interested in cybersecurity. Do you remember what I do for work?");

    const response3 = await enhancedAgent.generate(
        "I'm also interested in cybersecurity. Do you remember what I do for work?",
        {
            resourceId,
            threadId,
            memoryOptions: {
                lastMessages: 10,
                semanticRecall: {
                    topK: 5,
                    threshold: 0.7
                }
            }
        }
    );

    console.log(`ASSISTANT: ${response3.text}\n`);

    // 获取当前会话的记忆上下文
    const memoryContext = await enhancedAgent.getContextMemories(
        "current conversation",
        {
            memoryOptions: {
                lastMessages: 10
            },
            resourceId,
            threadId
        }
    );

    console.log("Memory Context:");
    console.log(memoryContext);
}

// 执行示例
if (require.main === module) {
    runMemoryExample()
        .then(() => console.log("Memory example completed"))
        .catch(error => console.error("Error in memory example:", error));
} 