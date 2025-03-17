import { Agent } from '@mastra/core/agent';
import { createQwen } from 'qwen-ai-provider';
import express from 'express';
import { Request, Response } from 'express';
import cors from 'cors';
import { z } from 'zod';

// 工具定义
const cookingTool = {
    name: 'cooking-tool',
    description: '查找食谱和烹饪建议的工具',
    parameters: {
        type: 'object',
        properties: {
            ingredients: {
                type: 'array',
                items: { type: 'string' },
                description: '可用的食材列表'
            },
            cuisine: {
                type: 'string',
                description: '想要烹饪的菜系',
                enum: ['中餐', '西餐', '日料', '意餐', '任意']
            },
            dietary: {
                type: 'array',
                items: { type: 'string' },
                description: '饮食限制，如素食、无乳制品等'
            }
        },
        required: ['ingredients']
    },
    handler: async ({ ingredients, cuisine, dietary }: {
        ingredients: string[],
        cuisine?: string,
        dietary?: string[]
    }) => {
        console.log(`🔍 查找${cuisine || ''}食谱，包含: ${ingredients.join(', ')}`);

        // 模拟API调用延迟
        await new Promise(resolve => setTimeout(resolve, 500));

        // 返回模拟食谱数据
        return {
            recipes: [
                {
                    name: `${cuisine || '家常'}${ingredients[0]}料理`,
                    ingredients: ingredients,
                    steps: [
                        '准备所有食材并清洗干净',
                        `将${ingredients[0]}切成适当大小`,
                        '热锅，加入少量油',
                        `放入${ingredients[0]}翻炒至变色`,
                        `加入${ingredients[1] || '调味料'}继续翻炒`,
                        '加入适量水，盖上锅盖焖煮5分钟',
                        '调入盐和其他调味料调味',
                        '装盘，撒上葱花点缀',
                    ]
                }
            ],
            suggestions: `您可以用${ingredients[0]}作为主料制作多种菜品，比如${cuisine || '家常'}风味的烹饪方式最为简单易做。`
        };
    }
};

// 创建营养分析工具
const nutritionTool = {
    name: 'nutrition-tool',
    description: '分析食谱的营养成分',
    parameters: {
        type: 'object',
        properties: {
            recipe: {
                type: 'string',
                description: '需要分析的食谱名称'
            },
            ingredients: {
                type: 'array',
                items: { type: 'string' },
                description: '食谱中的食材'
            }
        },
        required: ['ingredients']
    },
    handler: async ({ recipe, ingredients }: {
        recipe: string,
        ingredients: string[]
    }) => {
        console.log(`📊 分析食谱 "${recipe}" 的营养成分`);

        // 模拟API调用延迟
        await new Promise(resolve => setTimeout(resolve, 700));

        // 返回模拟营养数据
        return {
            calories: Math.floor(Math.random() * 400) + 200,
            protein: Math.floor(Math.random() * 20) + 10,
            carbs: Math.floor(Math.random() * 30) + 20,
            fat: Math.floor(Math.random() * 15) + 5,
            vitamins: ['维生素A', '维生素C', '维生素B群'],
            healthIndex: Math.floor(Math.random() * 5) + 3,
            suggestions: `这道菜的营养均衡性较好，特别是${ingredients[0]}富含蛋白质。建议搭配一些绿叶蔬菜以增加膳食纤维的摄入。`
        };
    }
};

// 创建Qwen实例
const qwen = createQwen({
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'sk-bc977c4e31e542f1a34159cb42478198',
});

// 创建使用Qwen模型的厨师智能体
const chefAgent = new Agent({
    name: 'Chef Agent',
    instructions: `
    你是Michel，一位经验丰富的家庭厨师。
    你擅长帮助人们利用已有的食材烹饪美味的菜肴。
    
    优先了解用户拥有的食材和厨具，然后建议可行的食谱。
    清晰解释烹饪步骤，并在需要时提供替代方案。
    保持友好和鼓励的语气。
    
    你必须使用提供的工具：
    1. cooking-tool：根据用户提供的食材查找食谱
    2. nutrition-tool：分析食谱的营养成分
    
    回答应当包括：
    - 基于用户食材的食谱建议
    - 烹饪方法的详细步骤
    - 营养价值分析
    - 相关烹饪技巧和建议
  `,
    model: qwen('qwen-plus-2024-12-20'),
    tools: {
        cookingTool,
        nutritionTool
    },
});

// 创建一个简单的web服务器
const app = express();
const PORT = 3000;

// 允许跨域请求
app.use(cors());

// 解析JSON请求体
app.use(express.json());

// 提供静态文件
app.use(express.static('public'));

// 创建public目录及HTML文件
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// 创建HTML文件
const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chef Michel - 智能烹饪助手</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
      color: #333;
    }
    header {
      text-align: center;
      margin-bottom: 30px;
    }
    h1 {
      color: #d35400;
    }
    .chef-avatar {
      font-size: 50px;
      margin-bottom: 10px;
    }
    .chat-container {
      background-color: white;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 20px;
      height: 400px;
      overflow-y: auto;
      margin-bottom: 20px;
    }
    .message {
      margin-bottom: 15px;
      padding: 10px 15px;
      border-radius: 18px;
      max-width: 80%;
      position: relative;
    }
    .user-message {
      background-color: #e8f4fd;
      align-self: flex-end;
      margin-left: auto;
    }
    .assistant-message {
      background-color: #f0f0f0;
      align-self: flex-start;
    }
    .input-area {
      display: flex;
      gap: 10px;
    }
    #user-input {
      flex-grow: 1;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 20px;
      font-size: 16px;
    }
    button {
      background-color: #d35400;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 20px;
      cursor: pointer;
      font-weight: bold;
      transition: background-color 0.2s;
    }
    button:hover {
      background-color: #e67e22;
    }
    .loading {
      display: none;
      text-align: center;
      margin: 10px 0;
    }
    .loading-dots span {
      animation: loading 1.4s infinite;
      display: inline-block;
      margin: 0 2px;
    }
    .loading-dots span:nth-child(2) {
      animation-delay: 0.2s;
    }
    .loading-dots span:nth-child(3) {
      animation-delay: 0.4s;
    }
    @keyframes loading {
      0%, 80%, 100% { transform: scale(0); } 
      40% { transform: scale(1.0); }
    }
    .recipe-card {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 15px;
      margin: 15px 0;
      background-color: #fffaf0;
    }
    .recipe-title {
      color: #d35400;
      font-weight: bold;
      margin-top: 0;
    }
    .ingredients-list, .steps-list {
      padding-left: 20px;
    }
    .nutrition-section {
      background-color: #f9f9f9;
      border-radius: 8px;
      padding: 10px;
      margin-top: 10px;
    }
    pre {
      white-space: pre-wrap;
      font-family: inherit;
    }
  </style>
</head>
<body>
  <header>
    <div class="chef-avatar">👨‍🍳</div>
    <h1>Chef Michel</h1>
    <p>您的智能烹饪助手</p>
  </header>
  
  <div class="chat-container" id="chat-container">
    <div class="message assistant-message">
      <p>您好！我是Chef Michel，您的智能烹饪助手。请告诉我您有哪些食材，我会给您提供烹饪建议。</p>
    </div>
  </div>
  
  <div class="loading" id="loading">
    <div class="loading-dots">
      <span>●</span><span>●</span><span>●</span>
    </div>
    <p>Chef Michel正在思考...</p>
  </div>
  
  <div class="input-area">
    <input type="text" id="user-input" placeholder="输入您有的食材，例如：鸡胸肉，西兰花，大蒜">
    <button id="send-btn">发送</button>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const chatContainer = document.getElementById('chat-container');
      const userInput = document.getElementById('user-input');
      const sendButton = document.getElementById('send-btn');
      const loading = document.getElementById('loading');
      
      // 发送消息
      async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;
        
        // 显示用户消息
        addMessage(message, 'user');
        userInput.value = '';
        
        // 显示加载动画
        loading.style.display = 'block';
        
        try {
          // 发送请求到服务器
          const response = await fetch('/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              message: \`我有这些食材：\${message}。我可以做什么料理？请提供详细的烹饪步骤和营养分析。\` 
            })
          });
          
          const data = await response.json();
          
          // 显示助手回复
          addMessage(data.text, 'assistant');
        } catch (error) {
          console.error('发生错误:', error);
          addMessage('抱歉，发生了错误，请重试。', 'assistant');
        } finally {
          // 隐藏加载动画
          loading.style.display = 'none';
        }
      }
      
      // 添加消息到聊天界面
      function addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = \`message \${sender}-message\`;
        
        const messagePara = document.createElement('pre');
        messagePara.textContent = text;
        messageDiv.appendChild(messagePara);
        
        chatContainer.appendChild(messageDiv);
        
        // 滚动到底部
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      
      // 点击发送按钮发送消息
      sendButton.addEventListener('click', sendMessage);
      
      // 按Enter键发送消息
      userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          sendMessage();
        }
      });
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);

// 定义接口
app.post('/generate', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: '消息不能为空' });
        }

        console.log(`收到用户请求: ${message}`);

        // 调用Agent生成回复
        const response = await chefAgent.generate([{
            role: 'user' as const,
            content: message
        }]);

        console.log('生成回复成功');

        // 返回结果
        res.json({ text: response.text });
    } catch (error) {
        console.error('生成回复时出错:', error);
        res.status(500).json({ error: '生成回复时发生错误' });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🍳 Chef Michel Web服务已启动，访问 http://localhost:${PORT}`);
}); 