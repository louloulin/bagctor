import { ActorSystem, Message, PID, log } from '@bactor/core';
import { createPluginActorFromClass } from '../adapters/plugin_adapter';
import { CalculatorPlugin } from './calculator-simplified/src';
import { ActorContext } from '@bactor/core';

/**
 * 新设计的插件系统验证示例
 * 
 * 本示例展示了如何:
 * 1. 创建Actor系统
 * 2. 加载插件
 * 3. 向插件发送消息
 * 4. 处理插件的响应
 */
async function runPluginDemo() {
    log.info('==== 启动插件验证示例 ====');

    try {
        // 创建Actor系统
        const system = new ActorSystem();
        log.info('创建了Actor系统');

        // 启动Actor系统
        await system.start();

        // 计算器插件配置
        const calculatorConfig = {
            precision: 2,
            maxOperands: 5
        };

        // 创建一个ActorContext作为根上下文
        const rootContext = new ActorContext(
            { id: 'root' },  // PID
            system           // Actor系统
        );

        // 加载计算器插件
        log.info('正在加载计算器插件...');
        const calculatorActor = await createPluginActorFromClass(
            rootContext,
            CalculatorPlugin,
            calculatorConfig
        );

        // 获取计算器PID
        const calculatorPid = (calculatorActor as any).context.getPID();
        log.info(`计算器插件已加载，PID: ${calculatorPid.id}`);

        // 创建结果处理Actor
        const resultHandler = await system.spawn({
            producer: (context: ActorContext) => {
                return {
                    behaviors: () => {
                        return {
                            'calculator.result': async (message: Message) => {
                                const result = message.payload;
                                if (result.success) {
                                    log.info('✅ 计算结果:', result);
                                } else {
                                    log.error('❌ 计算错误:', result.error);
                                }
                            }
                        };
                    }
                };
            }
        });
        log.info(`创建了结果处理器，PID: ${resultHandler.id}`);

        // 执行几个测试计算
        await testCalculations(system, calculatorPid, resultHandler);

        // 等待所有消息处理完成
        await new Promise(resolve => setTimeout(resolve, 1000));
        log.info('==== 插件验证示例完成 ====');

        // 关闭Actor系统
        await system.stop();
    } catch (error) {
        log.error('插件示例运行失败:', error);
    }
}

/**
 * 执行一系列计算操作测试插件功能
 */
async function testCalculations(system: ActorSystem, calculatorPid: PID, sender: PID) {
    // 测试加法
    log.info('测试加法操作...');
    await system.send(calculatorPid, {
        type: 'calculator.calculate',
        payload: {
            operation: 'add',
            operands: [1, 2, 3, 4, 5]
        },
        sender
    });

    // 测试减法
    log.info('测试减法操作...');
    await system.send(calculatorPid, {
        type: 'calculator.calculate',
        payload: {
            operation: 'subtract',
            operands: [100, 20, 5]
        },
        sender
    });

    // 测试乘法
    log.info('测试乘法操作...');
    await system.send(calculatorPid, {
        type: 'calculator.calculate',
        payload: {
            operation: 'multiply',
            operands: [2, 3, 4]
        },
        sender
    });

    // 测试除法
    log.info('测试除法操作...');
    await system.send(calculatorPid, {
        type: 'calculator.calculate',
        payload: {
            operation: 'divide',
            operands: [100, 2, 5]
        },
        sender
    });

    // 测试错误情况 - 除零
    log.info('测试错误情况: 除零...');
    await system.send(calculatorPid, {
        type: 'calculator.calculate',
        payload: {
            operation: 'divide',
            operands: [10, 0]
        },
        sender
    });

    // 测试错误情况 - 操作数过多
    log.info('测试错误情况: 操作数过多...');
    await system.send(calculatorPid, {
        type: 'calculator.calculate',
        payload: {
            operation: 'add',
            operands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        },
        sender
    });

    // 测试错误情况 - 无效操作
    log.info('测试错误情况: 无效操作...');
    await system.send(calculatorPid, {
        type: 'calculator.calculate',
        payload: {
            operation: 'power',
            operands: [2, 3]
        } as any,
        sender
    });
}

// 运行示例
if (require.main === module) {
    runPluginDemo().catch(console.error);
}

export { runPluginDemo }; 