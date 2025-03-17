#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取agent.md文件
const agentMdPath = path.join(__dirname, 'agent.md');
let content = fs.readFileSync(agentMdPath, 'utf8');

// 已完成的功能列表
const completedFeatures = [
    {
        name: "Qwen模型集成",
        pattern: /支持多种模型提供者（OpenAI, Anthropic等）/g,
        replacement: "支持多种模型提供者（OpenAI, Anthropic, Qwen等）✅"
    },
    {
        name: "Agent创建",
        pattern: /### 2.1 Agent创建/g,
        replacement: "### 2.1 Agent创建 ✅"
    },
    {
        name: "Mastra实例创建",
        pattern: /### 2.2 Mastra实例创建/g,
        replacement: "### 2.2 Mastra实例创建 ✅"
    },
    {
        name: "Generate和Stream API",
        pattern: /### 2.3 Generate和Stream API/g,
        replacement: "### 2.3 Generate和Stream API ✅"
    },
    {
        name: "工具调用",
        pattern: /### 3.1 工具创建/g,
        replacement: "### 3.1 工具创建 ✅"
    },
    {
        name: "多智能体支持",
        pattern: /### 4.1 多Agent注册/g,
        replacement: "### 4.1 多Agent注册 ✅"
    },
    {
        name: "工作流支持",
        pattern: /### 4.3 工作流创建/g,
        replacement: "### 4.3 工作流创建 ✅"
    },
    {
        name: "分布式交互",
        pattern: /### 5.1 智能体交互协议/g,
        replacement: "### 5.1 智能体交互协议 ✅"
    },
    {
        name: "OpenAI模型替换为Qwen",
        pattern: /import { openai } from "@ai-sdk\/openai";/g,
        replacement: 'import { createQwen } from "qwen-ai-provider";'
    },
    {
        name: "代码示例更新",
        pattern: /model: openai\("gpt-4o-mini"\),/g,
        replacement: 'model: qwen("qwen-plus-2024-12-20"),'
    },
    {
        name: "代码示例更新2",
        pattern: /model: openai\("gpt-4o"\),/g,
        replacement: 'model: qwen("qwen-plus-2024-12-20"),'
    }
];

// 更新内容
let updatedContent = content;
for (const feature of completedFeatures) {
    updatedContent = updatedContent.replace(feature.pattern, feature.replacement);
    console.log(`标记功能 "${feature.name}" 为已完成`);
}

// 写入更新后的内容
fs.writeFileSync(agentMdPath, updatedContent, 'utf8');
console.log(`已成功更新 ${agentMdPath} 文件`);

// 添加概述部分的完成标记
console.log('文档更新完成！'); 