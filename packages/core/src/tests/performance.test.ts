import { expect, test } from "bun:test";
import { ActorSystem } from "../core/system";
import { Actor } from "../core/actor";
import { Message, PID } from "../core/types";
import { DefaultMailbox, PriorityMailbox } from "../core/mailbox";

class BenchmarkActor extends Actor {
  private messageCount: number = 0;
  private expectedMessages: number;
  protected onComplete: () => void;
  private startTime: number = 0;

  constructor(context: any) {
    super(context);
    // Default to 1000 messages if not specified in context
    this.expectedMessages = context?.expectedMessages || 1000;
    this.onComplete = context?.onComplete || (() => {});
  }

  protected initializeBehaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'start') {
        this.startTime = performance.now();
        return;
      }

      this.messageCount++;
      if (this.messageCount === this.expectedMessages) {
        const endTime = performance.now();
        const duration = endTime - this.startTime;
        const throughput = (this.expectedMessages / duration) * 1000;
        console.log(`Processed ${this.expectedMessages} messages in ${duration.toFixed(2)}ms`);
        console.log(`Throughput: ${throughput.toFixed(2)} messages/second`);
        this.onComplete();
      }
    });
  }

  waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      this.onComplete = resolve;
    });
  }
}

async function runBenchmark(
  numMessages: number,
  mailboxType?: new () => DefaultMailbox | PriorityMailbox,
  batchSize: number = 1000
): Promise<void> {
  const system = new ActorSystem();
  const context = { expectedMessages: numMessages };
  
  // Create a promise that will resolve when messages are processed
  let resolvePromise!: () => void;
  const completionPromise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  // Create the actor with completion callback
  const pid = await system.spawn({
    actorClass: class extends BenchmarkActor {
      constructor(context: any) {
        super(context);
        this.onComplete = resolvePromise;
      }
    },
    mailboxType,
    actorContext: { ...context, onComplete: resolvePromise }
  });

  // Send start signal
  await system.send(pid, { type: 'start' });

  // Send messages in batches
  for (let i = 0; i < numMessages; i += batchSize) {
    const batch = Math.min(batchSize, numMessages - i);
    await Promise.all(
      Array(batch).fill(0).map(() => 
        system.send(pid, { type: 'benchmark' })
      )
    );
  }

  // Wait for completion
  await completionPromise;
}

test("Benchmark DefaultMailbox with 100K messages", async () => {
  console.log("\nBenchmarking DefaultMailbox with 100K messages:");
  await runBenchmark(100000);
}, 60000);

test("Benchmark DefaultMailbox with 1M messages", async () => {
  console.log("\nBenchmarking DefaultMailbox with 1M messages:");
  await runBenchmark(1000000);
}, 120000);

test("Benchmark PriorityMailbox with mixed priorities", async () => {
  console.log("\nBenchmarking PriorityMailbox with mixed priorities:");
  const system = new ActorSystem();
  const numMessages = 100000;
  
  // Create a promise that will resolve when messages are processed
  let resolvePromise!: () => void;
  const completionPromise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  // Create the actor with completion callback
  const pid = await system.spawn({
    actorClass: class extends BenchmarkActor {
      constructor(context: any) {
        super(context);
        this.onComplete = resolvePromise;
      }
    },
    mailboxType: PriorityMailbox,
    actorContext: { expectedMessages: numMessages, onComplete: resolvePromise }
  });

  // Send start signal
  await system.send(pid, { type: 'start' });

  // Send messages with different priorities
  const priorities = ['$priority.high', '$priority.low', 'normal'];
  for (let i = 0; i < numMessages; i++) {
    const priority = priorities[i % priorities.length];
    await system.send(pid, { type: `${priority}.benchmark` });
  }

  // Wait for completion
  await completionPromise;
}, 60000);

test("Benchmark concurrent message sending", async () => {
  console.log("\nBenchmarking concurrent message sending:");
  const system = new ActorSystem();
  const numActors = 10;
  const messagesPerActor = 10000;
  const completionPromises: Promise<void>[] = [];
  const pids: PID[] = [];

  // Create actors
  for (let i = 0; i < numActors; i++) {
    let resolvePromise!: () => void;
    const completionPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    completionPromises.push(completionPromise);

    const pid = await system.spawn({
      actorClass: class extends BenchmarkActor {
        constructor(context: any) {
          super(context);
          this.onComplete = resolvePromise;
        }
      },
      actorContext: { expectedMessages: messagesPerActor, onComplete: resolvePromise }
    });
    pids.push(pid);
  }

  const startTime = performance.now();

  // Send start signal to all actors
  await Promise.all(pids.map(pid => system.send(pid, { type: 'start' })));

  // Send messages to all actors concurrently
  await Promise.all(
    pids.map(pid =>
      Promise.all(
        Array(messagesPerActor).fill(0).map(() =>
          system.send(pid, { type: 'benchmark' })
        )
      )
    )
  );

  // Wait for all actors to complete
  await Promise.all(completionPromises);

  const endTime = performance.now();
  const duration = endTime - startTime;
  const totalMessages = numActors * messagesPerActor;
  const throughput = (totalMessages / duration) * 1000;

  console.log(`Processed ${totalMessages} messages across ${numActors} actors in ${duration.toFixed(2)}ms`);
  console.log(`Total throughput: ${throughput.toFixed(2)} messages/second`);
  console.log(`Per-actor throughput: ${(throughput / numActors).toFixed(2)} messages/second/actor`);
}, 120000); 