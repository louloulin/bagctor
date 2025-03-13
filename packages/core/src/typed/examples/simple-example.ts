/**
 * 简单的类型安全Actor示例
 * 
 * 这个示例展示了如何使用Bagctor的类型安全Actor系统
 * 创建一个简单的计数器Actor，它可以增加、减少和获取当前计数
 */

import {
    TypedActor,
    MessageMap,
    defineMessage,
    createTypeValidator,
    isNumber,
    RequestResponseProtocol,
    createRequestResponseMap
} from '../index';

// 定义消息类型映射
interface CounterMessages extends MessageMap {
    'increment': { amount: number };
    'decrement': { amount: number };
    'getCount': void;
    'countResult': { count: number };
}

// 定义Actor状态
interface CounterState {
    count: number;
}

// 定义请求-响应协议
const GetCountProtocol = createRequestResponseMap<void, { count: number }>(
    'getCount',
    'countResult'
);

// 简单的计数器Actor实现
class CounterActor {
    private state: CounterState = { count: 0 };

    // 处理增加消息
    handleIncrement(amount: number): void {
        this.state.count += amount;
        console.log(`Counter increased by ${amount}, new value: ${this.state.count}`);
    }

    // 处理减少消息
    handleDecrement(amount: number): void {
        this.state.count -= amount;
        console.log(`Counter decreased by ${amount}, new value: ${this.state.count}`);
    }

    // 获取当前计数
    getCount(): number {
        return this.state.count;
    }
}

// 使用示例
function runExample() {
    // 创建计数器Actor
    const counter = new CounterActor();

    // 发送消息
    counter.handleIncrement(5);
    counter.handleIncrement(3);
    counter.handleDecrement(2);

    // 获取结果
    const count = counter.getCount();
    console.log(`Final count: ${count}`);
}

// 运行示例
runExample(); 