import { log } from '@bactor/core';
import { BagctorPlugin, PluginBase, PluginContext, PluginMetadata } from '../../../../../src';

/**
 * 静态加载插件示例 - 问候服务
 * 
 * 此插件演示如何通过依赖方式静态加载
 */
export interface GreetingPluginConfig {
    debug?: boolean;
    timeout?: number;
    mode?: string;
    customGreeting?: string;
}

export class GreetingPlugin extends PluginBase<GreetingPluginConfig> {
    // 定义插件元数据
    metadata: PluginMetadata = {
        id: 'greeting-plugin',
        name: 'Greeting Service Plugin',
        version: '1.0.0',
        description: 'A simple greeting service plugin',
        author: 'BActor Team',
        capabilities: ['greeting.sayHello', 'greeting.sayGoodbye']
    };

    // 可用的问候语
    private greetings = [
        '你好',
        '您好',
        '早上好',
        '下午好',
        '晚上好',
        '嗨'
    ];

    // 初始化时的额外操作
    protected async onInitialize(): Promise<void> {
        log.info('问候插件已初始化', {
            config: this.config
        });

        if (this.config.customGreeting) {
            this.greetings.push(this.config.customGreeting);
        }
    }

    // 自动映射到greeting.sayHello能力
    async handleSayHello(payload: { name: string }): Promise<{ message: string }> {
        log.info('处理sayHello请求', payload);

        const { name } = payload;
        const greeting = this.getRandomGreeting();
        const message = `${greeting}，${name}！欢迎使用BActor。`;

        if (this.config.debug) {
            log.debug('生成的问候语', { greeting, message });
        }

        return { message };
    }

    // 自动映射到greeting.sayGoodbye能力
    async handleSayGoodbye(payload: { name: string }): Promise<{ message: string }> {
        log.info('处理sayGoodbye请求', payload);

        const { name } = payload;
        const message = `再见，${name}！期待下次再见。`;

        return { message };
    }

    // 获取随机问候语
    private getRandomGreeting(): string {
        const index = Math.floor(Math.random() * this.greetings.length);
        return this.greetings[index];
    }

    // 清理资源
    protected async onCleanup(): Promise<void> {
        log.info('问候插件正在清理资源');
    }
}

// 导出插件实例工厂函数
export function createPlugin(config?: GreetingPluginConfig): BagctorPlugin<GreetingPluginConfig> {
    return new GreetingPlugin();
}

// 默认导出插件类，用于静态加载
export default GreetingPlugin; 