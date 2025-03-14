import { ActorSystem } from '../core/system';
import { Actor } from '../core/actor';
import { PID, Message } from '../core/types';
import { v4 as uuid } from 'uuid';

// 扩展消息类型，添加测试所需属性
export interface ExtendedMessage extends Message {
    error?: string;
    payload?: any;
    responseId?: string;
    workerScript?: string;
    taskId?: string;
    taskType?: string;
    result?: any;
    startTime?: number;
}

/**
 * 创建一个Actor系统用于测试
 */
export function createSystem(): ActorSystem {
    const system = new ActorSystem();
    return system;
}

/**
 * 获取Actor引用
 */
export function getActorRef(system: ActorSystem, pid: PID): Actor | undefined {
    return system['actors'].get(pid.id);
}

/**
 * ActorRef类型定义 - 用于测试
 */
export interface ActorRef {
    pid: PID;
    actor?: Actor;
}

/**
 * 发送请求并等待响应
 * 这是一个测试辅助方法，用于在测试中模拟请求-响应模式
 */
export async function ask(system: ActorSystem, target: PID, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const responseId = uuid();

        // 设置响应处理器
        const responseHandler = async (response: ExtendedMessage): Promise<void> => {
            if (response.error) {
                reject(new Error(response.error));
            } else {
                resolve(response.payload || response);
            }
            await system.removeMessageHandler(responseHandler);
        };

        // 添加消息处理器
        system.addMessageHandler(responseHandler);

        // 发送带有响应ID的消息
        system.send(target, {
            ...message,
            responseId,
            sender: { id: 'test-sender' }
        }).catch(reject);

        // 设置超时
        setTimeout(async () => {
            await system.removeMessageHandler(responseHandler);
            reject(new Error('Request timed out'));
        }, 5000);
    });
}

// 扩展ActorSystem原型并声明类型
declare module '../core/system' {
    interface ActorSystem {
        ask(target: PID, message: any): Promise<any>;
    }
}

// 添加ask方法到ActorSystem原型
ActorSystem.prototype.ask = function (target: PID, message: any): Promise<any> {
    return ask(this, target, message);
}; 