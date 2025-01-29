// import { Message, PID } from '../core/types';
// import { createRouter, RouterConfig, RouterType } from '../core/router';
// import { ActorSystem } from '../core/system';
// import { Actor } from '../core/actor';
// import { ActorContext } from '../core/context';
// import { PropsBuilder } from '../core/props';
// import { log } from '../utils/logger';
// import { expect, test } from 'bun:test';

// // Test Actor that tracks received messages
// class TestActor extends Actor {
//     private receivedMessages: Message[] = [];
//     private static instances: Map<string, TestActor> = new Map();

//     constructor(context: ActorContext) {
//         super(context);
//         TestActor.instances.set(this.context.self.id, this);
//     }

//     static getInstance(id: string): TestActor | undefined {
//         return TestActor.instances.get(id);
//     }

//     static clearInstances() {
//         TestActor.instances.clear();
//     }

//     public getId(): string {
//         return this.context.self.id;
//     }

//     protected behaviors(): void {
//         this.addBehavior('default', async (message: Message) => {
//             log.info(`[TestActor ${this.getId()}] Processing message:`, {
//                 messageType: message.type,
//                 content: message.content
//             });

//             this.receivedMessages.push(message);
//             await new Promise(resolve => setTimeout(resolve, 50));

//             log.info(`[TestActor ${this.getId()}] Completed processing message`);
//         });
//     }

//     getReceivedMessages(): Message[] {
//         return this.receivedMessages;
//     }
// }

// // Helper function to create test actors
// async function createTestActors(system: ActorSystem, count: number): Promise<PID[]> {
//     const actors: PID[] = [];
//     for (let i = 0; i < count; i++) {
//         const actor = await system.spawn({
//             producer: (context) => new TestActor(context)
//         });
//         actors.push(actor);
//         log.info(`Created TestActor ${actor.id}`);
//     }
//     return actors;
// }

// // Helper function to wait for messages
// async function waitForMessages(actors: TestActor[], expectedCounts: number[], maxAttempts = 60): Promise<void> {
//     for (let attempt = 0; attempt < maxAttempts; attempt++) {
//         const currentCounts = actors.map(actor => actor.getReceivedMessages().length);

//         log.info('Current message counts:', {
//             expected: expectedCounts,
//             actual: currentCounts,
//             actors: actors.map(a => a.getId())
//         });

//         if (currentCounts.every((count, i) => count === expectedCounts[i])) {
//             return;
//         }

//         await new Promise(resolve => setTimeout(resolve, 50));
//     }

//     const currentCounts = actors.map(actor => actor.getReceivedMessages().length);
//     throw new Error(`Timeout waiting for messages. Expected: ${expectedCounts}, got: ${currentCounts}`);
// }

// async function getTestActors(count: number): Promise<PID[]> {
//     const system = new ActorSystem();
//     const actors: PID[] = [];
//     for (let i = 0; i < count; i++) {
//         const props = PropsBuilder.fromClass(TestActor).build();
//         const pid = await system.spawn(props);
//         actors.push(pid);
//     }
//     return actors;
// }

// test('should handle round-robin routing correctly', async () => {
//     TestActor.clearInstances();
//     const system = new ActorSystem();
//     const routees = await createTestActors(system, 3);

//     const router = createRouter('round-robin', { system, routees });
//     const routerPid = await system.spawn({ producer: () => router });

//     // Send 6 messages
//     for (let i = 0; i < 6; i++) {
//         await system.send(routerPid, {
//             type: 'task',
//             content: `Task ${i + 1}`
//         });
//     }

//     // Each actor should receive 2 messages
//     await waitForMessages(routees.map(pid => TestActor.getInstance(pid.id) as TestActor), [2, 2, 2]);

//     // Verify message distribution
//     const actors = routees.map(pid => {
//         const actor = TestActor.getInstance(pid.id);
//         if (!actor) {
//             throw new Error(`Actor not found for PID ${pid.id}`);
//         }
//         return actor;
//     });
//     actors.forEach(actor => {
//         expect(actor.getReceivedMessages().length).toBe(2);
//     });
// });

// test('should handle random routing with fair distribution', async () => {
//     TestActor.clearInstances();
//     const system = new ActorSystem();
//     const routees = await createTestActors(system, 3);

//     const router = createRouter('random', { system, routees });
//     const routerPid = await system.spawn({ producer: () => router });

//     // Send 30 messages for better statistical distribution
//     for (let i = 0; i < 30; i++) {
//         await system.send(routerPid, {
//             type: 'task',
//             content: `Task ${i + 1}`
//         });
//     }

//     // Wait for all messages to be processed
//     // Allow for some variance in the random distribution
//     await waitForMessages(routees.map(pid => TestActor.getInstance(pid.id) as TestActor), [10, 10, 10]);

//     // Verify fair distribution within acceptable range
//     const totalMessages = routees.reduce((sum, pid) => {
//         const actor = TestActor.getInstance(pid.id);
//         if (!actor) {
//             throw new Error(`Actor not found for PID ${pid.id}`);
//         }
//         return sum + actor.getReceivedMessages().length;
//     }, 0);
//     expect(totalMessages).toBe(30);

//     routees.forEach(pid => {
//         const actor = TestActor.getInstance(pid.id);
//         if (!actor) {
//             throw new Error(`Actor not found for PID ${pid.id}`);
//         }
//         const count = actor.getReceivedMessages().length;
//         // Allow for ±30% variance from the expected mean (10 messages per actor)
//         expect(count).toBeGreaterThan(5); // Min 6 messages
//         expect(count).toBeLessThan(15); // Max 14 messages
//     });
// });

// test('should handle consistent hash routing correctly', async () => {
//     TestActor.clearInstances();
//     const system = new ActorSystem();
//     const routees = await createTestActors(system, 3);

//     const router = createRouter('consistent-hash', {
//         system,
//         routees,
//         routingConfig: {
//             virtualNodeCount: 100,  // 增加虚拟节点数量以获得更好的分布
//             hashFunction: (message: Message) => {
//                 log.info('Hashing message:', { content: message.content });
//                 return message.content as string;
//             }
//         }
//     });
//     const routerPid = await system.spawn({ producer: () => router });

//     // 发送消息，确保相同内容的消息发送到相同的actor
//     const messages = [
//         { type: 'task', content: 'A' },
//         { type: 'task', content: 'A' },
//         { type: 'task', content: 'A' },
//         { type: 'task', content: 'B' },
//         { type: 'task', content: 'B' },
//         { type: 'task', content: 'C' }
//     ];

//     log.info('Starting to send messages for consistent hash test');
//     for (const msg of messages) {
//         await system.send(routerPid, msg);
//         await new Promise(resolve => setTimeout(resolve, 100)); // 添加延迟以确保消息处理
//     }

//     log.info('Waiting for messages to be processed');
//     const actors = routees.map(pid => {
//         const actor = TestActor.getInstance(pid.id);
//         if (!actor) {
//             throw new Error(`Actor not found for PID ${pid.id}`);
//         }
//         return actor;
//     });

//     // 等待所有消息被处理
//     await waitForMessages(actors, [3, 2, 1], 100); // 增加最大尝试次数

//     // 验证一致性路由 - 相同内容的消息应该发送到相同的actor
//     const messagesByContent = new Map<string, string>();

//     actors.forEach(actor => {
//         const messages = actor.getReceivedMessages();
//         log.info(`Actor ${actor.getId()} received messages:`, {
//             count: messages.length,
//             contents: messages.map(m => m.content)
//         });

//         messages.forEach(msg => {
//             const content = msg.content as string;
//             if (!messagesByContent.has(content)) {
//                 messagesByContent.set(content, actor.getId());
//             } else {
//                 expect(messagesByContent.get(content)).toBe(actor.getId());
//             }
//         });
//     });
// });

// test('should handle broadcast routing correctly', async () => {
//     TestActor.clearInstances();
//     const system = new ActorSystem();
//     const routees = await createTestActors(system, 3);

//     const router = createRouter('broadcast', { system, routees });
//     const routerPid = await system.spawn({ producer: () => router });

//     // Send 3 broadcast messages
//     for (let i = 0; i < 3; i++) {
//         await system.send(routerPid, {
//             type: 'broadcast-task',
//             content: `Broadcast ${i + 1}`
//         });
//     }

//     // Each actor should receive all 3 messages
//     await waitForMessages(routees.map(pid => TestActor.getInstance(pid.id) as TestActor), [3, 3, 3]);

//     // Verify all actors received all messages
//     const actors = routees.map(pid => {
//         const actor = TestActor.getInstance(pid.id);
//         if (!actor) {
//             throw new Error(`Actor not found for PID ${pid.id}`);
//         }
//         return actor;
//     });
//     actors.forEach(actor => {
//         const messages = actor.getReceivedMessages();
//         expect(messages.length).toBe(3);
//         expect(messages.map(m => m.content)).toEqual([
//             'Broadcast 1',
//             'Broadcast 2',
//             'Broadcast 3'
//         ]);
//     });
// }); 