/**
 * 简单的无锁队列测试
 */
import { LockFreeQueue } from '../core/concurrent/lock-free-queue';

// 创建队列
const queue = new LockFreeQueue<number>();

// 测试队列操作
console.log("=== 无锁队列简单测试 ===");
console.log("初始状态:", {
    isEmpty: queue.isEmpty(),
    size: queue.size(),
    capacity: queue.capacity()
});

// 添加元素
console.log("\n入队操作:");
console.log("入队 1:", queue.enqueue(1));
console.log("入队 2:", queue.enqueue(2));
console.log("入队 3:", queue.enqueue(3));
console.log("入队后状态:", {
    isEmpty: queue.isEmpty(),
    size: queue.size()
});

// 获取元素
console.log("\n出队操作:");
console.log("出队:", queue.dequeue());
console.log("出队:", queue.dequeue());
console.log("出队后状态:", {
    isEmpty: queue.isEmpty(),
    size: queue.size()
});

console.log("\n查看队首元素:", queue.peek());
console.log("再次出队:", queue.dequeue());
console.log("队列为空后出队:", queue.dequeue());

// 性能测试
console.log("\n=== 简单性能测试 ===");
const count = 100000;
const startTime = Date.now();

// 批量入队
for (let i = 0; i < count; i++) {
    queue.enqueue(i);
}

// 批量出队
let sum = 0;
while (!queue.isEmpty()) {
    sum += queue.dequeue() || 0;
}

const endTime = Date.now();
console.log(`处理 ${count} 个元素用时: ${endTime - startTime}ms`);
console.log(`平均每秒处理: ${Math.floor(count / ((endTime - startTime) / 1000))} 操作`);

// 测试队列统计
console.log("\n=== 队列统计信息 ===");
console.log(JSON.stringify(queue.getStats(), null, 2));

console.log("\n测试完成"); 