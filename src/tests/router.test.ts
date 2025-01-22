// import { expect, test, mock } from "bun:test";
// import { ActorSystem } from "../core/system";
// import { createRouter, RouterType } from "../core/router";
// import { Actor } from "../core/actor";
// import { Message, PID, ActorContext } from "../core/types";

// class TestActor extends Actor {
//   public receivedMessages: Message[] = [];

//   constructor(context: ActorContext) {
//     super(context);
//     this.initialize();
//   }

//   protected initializeBehaviors(): void {
//     this.addBehavior('default', async (message: Message) => {
//       console.log(`[TestActor ${this.context.self.id}] Received message:`, message);
//       if (message.type === 'get-messages') {
//         if (message.sender) {
//           console.log(`[TestActor ${this.context.self.id}] Sending messages to:`, message.sender.id);
//           try {
//             await this.context.system.send(message.sender, { 
//               type: 'messages', 
//               payload: [...this.receivedMessages] // Send a copy of the messages
//             });
//             console.log(`[TestActor ${this.context.self.id}] Successfully sent ${this.receivedMessages.length} messages`);
//           } catch (error) {
//             console.error(`[TestActor ${this.context.self.id}] Error sending messages:`, error);
//           }
//         }
//       } else {
//         console.log(`[TestActor ${this.context.self.id}] Adding message to received messages`);
//         this.receivedMessages.push({ ...message }); // Store a copy of the message
//       }
//     });
//   }
// }

// class TempActor extends Actor {
//   private resolve: ((messages: Message[]) => void) | undefined;
//   private timeout: ReturnType<typeof setTimeout> | undefined;
//   private tempId: string;
//   private messages: Message[] | undefined;

//   constructor(context: ActorContext, resolve: (messages: Message[]) => void) {
//     super(context);
//     this.resolve = resolve;
//     this.tempId = Math.random().toString(36).substring(7);
//     this.initialize();
//   }

//   protected initializeBehaviors(): void {
//     this.addBehavior('default', async (message: Message) => {
//       if (this.resolve && message.type === 'messages') {
//         if (this.timeout) {
//           clearTimeout(this.timeout);
//           this.timeout = undefined;
//         }
//         this.messages = message.payload;
//         this.resolve(message.payload);
//         this.resolve = undefined;
//         await this.context.system.stop(this.context.self);
//       }
//     });
//   }

//   setTimeout(timeout: ReturnType<typeof setTimeout>): void {
//     this.timeout = timeout;
//   }

//   handleTimeout(): void {
//     if (this.timeout) {
//       clearTimeout(this.timeout);
//       this.timeout = undefined;
//     }
//     if (this.resolve) {
//       console.log(`[TempActor ${this.tempId}] Timeout occurred, resolving with empty array`);
//       if (this.messages) {
//         this.resolve(this.messages);
//       } else {
//         this.resolve([]);
//       }
//       this.resolve = undefined;
//     }
//     if (this.context?.system && this.context?.self) {
//       this.context.system.stop(this.context.self).catch((error: Error) => {
//         console.error(`[TempActor ${this.tempId}] Error stopping actor:`, error);
//       });
//     }
//   }
// }

// async function createTestActors(system: ActorSystem, count: number): Promise<PID[]> {
//   const actors: PID[] = [];
//   for (let i = 0; i < count; i++) {
//     const pid = await system.spawn({
//       producer: (context: ActorContext) => new TestActor(context)
//     });
//     console.log(`[Test] Created test actor ${i + 1}:`, pid.id);
//     actors.push(pid);
//   }
//   return actors;
// }

// async function getReceivedMessages(system: ActorSystem, pid: PID): Promise<Message[]> {
//   console.log(`[Test] Getting messages from actor:`, pid.id);
//   return new Promise((resolve) => {
//     system.spawn({
//       producer: async (context: ActorContext) => {
//         const actor = new TempActor(context, resolve);
//         actor.setTimeout(setTimeout(() => {
//           actor.handleTimeout();
//         }, 10000));
//         console.log(`[Test] Created temp actor:`, context.self.id);
//         console.log(`[Test] Sending get-messages to:`, pid.id);
//         await context.send(pid, { type: 'get-messages', sender: context.self });
//         return actor;
//       }
//     });
//   });
// }

// test("RoundRobin router should distribute messages evenly", async () => {
//   const system = new ActorSystem();
//   const routees = await createTestActors(system, 3);
  
//   const router = createRouter('round-robin', { system, routees });
//   const routerPid = await system.spawn({
//     producer: (context: ActorContext) => router
//   });

//   // Send test messages
//   for (let i = 0; i < 6; i++) {
//     await system.send(routerPid, { type: 'test', index: i });
//   }

//   // Wait for message processing
//   await new Promise(resolve => setTimeout(resolve, 5000));

//   // Verify message distribution
//   for (const routee of routees) {
//     const messages = await getReceivedMessages(system, routee);
//     console.log(`[Test] Routee ${routee.id} received ${messages.length} messages:`, messages);
//     expect(messages.length).toBe(2); // Each routee should receive 2 messages
//   }
// }, 15000);

// test("Random router should distribute messages across all routees", async () => {
//   const system = new ActorSystem();
//   const routees = await createTestActors(system, 3);
  
//   const router = createRouter('random', { system, routees });
//   const routerPid = await system.spawn({ producer: () => router });

//   // Send test messages
//   for (let i = 0; i < 30; i++) {
//     await system.send(routerPid, { type: 'test', index: i });
//   }

//   // Wait for message processing
//   await new Promise(resolve => setTimeout(resolve, 5000));

//   // Verify all routees received messages
//   let totalMessages = 0;
//   for (const routee of routees) {
//     const messages = await getReceivedMessages(system, routee);
//     console.log(`[Test] Routee ${routee.id} received ${messages.length} messages:`, messages);
//     expect(messages.length).toBeGreaterThan(0); // Each routee should receive some messages
//     totalMessages += messages.length;
//   }
//   expect(totalMessages).toBe(30);
// }, 15000);

// test("Broadcast router should send messages to all routees", async () => {
//   const system = new ActorSystem();
//   const routees = await createTestActors(system, 3);
  
//   const router = createRouter('broadcast', { system, routees });
//   const routerPid = await system.spawn({ producer: () => router });

//   // Send test messages
//   const messageCount = 5;
//   for (let i = 0; i < messageCount; i++) {
//     await system.send(routerPid, { type: 'test', index: i });
//   }

//   // Wait for message processing
//   await new Promise(resolve => setTimeout(resolve, 5000));

//   // Verify all routees received all messages
//   for (const routee of routees) {
//     const messages = await getReceivedMessages(system, routee);
//     console.log(`[Test] Routee ${routee.id} received ${messages.length} messages:`, messages);
//     expect(messages.length).toBe(messageCount);
//     expect(messages.map(m => m.index)).toEqual([0, 1, 2, 3, 4]);
//   }
// }, 15000);

// test("ConsistentHash router should route similar messages to same routee", async () => {
//   const system = new ActorSystem();
//   const routees = await createTestActors(system, 3);
  
//   const router = createRouter('consistent-hash', { system, routees });
//   const routerPid = await system.spawn({ producer: () => router });

//   // Send messages with same content multiple times
//   const testMessage = { type: 'test', content: 'same_content' };
//   for (let i = 0; i < 5; i++) {
//     await system.send(routerPid, testMessage);
//   }

//   // Wait for message processing
//   await new Promise(resolve => setTimeout(resolve, 5000));

//   // Verify messages with same content went to same routee
//   let receivingRoutee: PID | undefined;
//   for (const routee of routees) {
//     const messages = await getReceivedMessages(system, routee);
//     console.log(`[Test] Routee ${routee.id} received ${messages.length} messages:`, messages);
//     if (messages.length > 0) {
//       if (!receivingRoutee) {
//         receivingRoutee = routee;
//         expect(messages.length).toBe(5); // Should receive all messages
//       } else {
//         expect(messages.length).toBe(0); // Other routees should receive no messages
//       }
//     }
//   }
// }, 15000);

// test("Router should handle routee management messages", async () => {
//   const system = new ActorSystem();
//   const initialRoutees = await createTestActors(system, 2);
  
//   const router = createRouter('round-robin', { system, routees: initialRoutees });
//   const routerPid = await system.spawn({ producer: () => router });

//   // Add a new routee
//   const newRoutee = await system.spawn({
//     producer: (context: ActorContext) => new TestActor(context)
//   });
//   await system.send(routerPid, { type: 'router.add-routee', routee: newRoutee });

//   // Wait for routee to be added
//   await new Promise(resolve => setTimeout(resolve, 2000));

//   // Send test messages
//   for (let i = 0; i < 3; i++) {
//     await system.send(routerPid, { type: 'test', index: i });
//   }

//   // Wait for message processing
//   await new Promise(resolve => setTimeout(resolve, 5000));

//   // Verify message distribution includes new routee
//   const messages = await getReceivedMessages(system, newRoutee);
//   console.log(`[Test] New routee ${newRoutee.id} received ${messages.length} messages:`, messages);
//   expect(messages.length).toBe(1); // New routee should receive one message
// }, 15000); 