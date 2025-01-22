import { expect, test, mock } from "bun:test";
import { DefaultMailbox, PriorityMailbox } from "../core/mailbox";
import { Message, MessageInvoker, MessageDispatcher } from "../core/types";

// Mock implementations
class MockMessageInvoker implements MessageInvoker {
  public systemMessages: Message[] = [];
  public userMessages: Message[] = [];

  async invokeSystemMessage(msg: Message): Promise<void> {
    this.systemMessages.push(msg);
  }

  async invokeUserMessage(msg: Message): Promise<void> {
    this.userMessages.push(msg);
  }
}

class MockDispatcher implements MessageDispatcher {
  public scheduledTasks: (() => Promise<void>)[] = [];

  schedule(runner: () => Promise<void>): void {
    this.scheduledTasks.push(runner);
    // Execute immediately for testing
    runner().catch(error => console.error(error));
  }
}

test("DefaultMailbox should process messages in correct order", async () => {
  const mailbox = new DefaultMailbox();
  const invoker = new MockMessageInvoker();
  const dispatcher = new MockDispatcher();

  mailbox.registerHandlers(invoker, dispatcher);
  mailbox.start();

  // Post messages
  mailbox.postSystemMessage({ type: "system1" });
  mailbox.postUserMessage({ type: "user1" });
  mailbox.postSystemMessage({ type: "system2" });
  mailbox.postUserMessage({ type: "user2" });

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify system messages processed first (due to separate queues, order is maintained)
  expect(invoker.systemMessages).toEqual([
    { type: "system1" },
    { type: "system2" }
  ]);

  // Verify user messages processed in order
  expect(invoker.userMessages).toEqual([
    { type: "user1" },
    { type: "user2" }
  ]);
});

test("PriorityMailbox should process messages according to priority", async () => {
  const mailbox = new PriorityMailbox();
  const invoker = new MockMessageInvoker();
  const dispatcher = new MockDispatcher();

  // Add delays to message processing to ensure order
  invoker.invokeSystemMessage = async (msg: Message) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    invoker.systemMessages.push(msg);
  };

  invoker.invokeUserMessage = async (msg: Message) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    invoker.userMessages.push(msg);
  };

  mailbox.registerHandlers(invoker, dispatcher);

  // Post all messages first, then start processing
  mailbox.postSystemMessage({ type: "system1" });
  mailbox.postUserMessage({ type: "$priority.low.msg1" });
  mailbox.postUserMessage({ type: "$priority.high.msg1" });
  mailbox.postUserMessage({ type: "normal_msg1" });
  mailbox.postUserMessage({ type: "$priority.high.msg2" });

  // Start processing after all messages are queued
  mailbox.start();

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 200));

  // Verify system messages processed first
  expect(invoker.systemMessages).toEqual([
    { type: "system1" }
  ]);

  // Verify user messages processed in priority order
  expect(invoker.userMessages).toEqual([
    { type: "$priority.high.msg1" },
    { type: "$priority.high.msg2" },
    { type: "normal_msg1" },
    { type: "$priority.low.msg1" }
  ]);
});

test("Mailbox should handle errors gracefully", async () => {
  const mailbox = new DefaultMailbox();
  const invoker = new MockMessageInvoker();
  const dispatcher = new MockDispatcher();

  // Override invoker methods to simulate errors
  invoker.invokeSystemMessage = async (msg: Message) => {
    if (msg.type === 'error') {
      throw new Error('System message error');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
    invoker.systemMessages.push(msg);
  };

  invoker.invokeUserMessage = async (msg: Message) => {
    if (msg.type === 'error') {
      throw new Error('User message error');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
    invoker.userMessages.push(msg);
  };

  mailbox.registerHandlers(invoker, dispatcher);

  // Post messages in sequence with delays
  mailbox.postSystemMessage({ type: "normal1" });
  await new Promise(resolve => setTimeout(resolve, 50));

  mailbox.postSystemMessage({ type: "error" });
  await new Promise(resolve => setTimeout(resolve, 50));

  // These messages should not be processed due to system error
  mailbox.postSystemMessage({ type: "normal2" });
  await new Promise(resolve => setTimeout(resolve, 50));

  // User messages should not be processed after system error
  mailbox.postUserMessage({ type: "user1" });
  mailbox.postUserMessage({ type: "error" });
  mailbox.postUserMessage({ type: "user2" });

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 200));

  // Only messages before system error should be processed
  expect(invoker.systemMessages).toEqual([
    { type: "normal1" }
  ]);

  // No user messages should be processed after system error
  expect(invoker.userMessages).toEqual([]);

  // Verify mailbox is suspended
  const suspended = mailbox.isSuspended?.();
  expect(suspended).toBe(true);
});

test("PriorityMailbox should report queue sizes correctly", async () => {
  const mailbox = new PriorityMailbox();
  const invoker = new MockMessageInvoker();
  const dispatcher = new MockDispatcher();

  // Add delays to message processing
  invoker.invokeSystemMessage = async (msg: Message) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    invoker.systemMessages.push(msg);
  };

  invoker.invokeUserMessage = async (msg: Message) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    invoker.userMessages.push(msg);
  };

  mailbox.registerHandlers(invoker, dispatcher);

  // Post messages without starting processing
  mailbox.postSystemMessage({ type: "system1" });
  mailbox.postUserMessage({ type: "$priority.high.msg1" });
  mailbox.postUserMessage({ type: "normal_msg1" });
  mailbox.postUserMessage({ type: "$priority.low.msg1" });

  // Check queue sizes before starting processing
  const sizes = await mailbox.getQueueSizes();
  expect(sizes.system).toBeGreaterThan(0);
  expect(sizes.high).toBeGreaterThan(0);
  expect(sizes.normal).toBeGreaterThan(0);
  expect(sizes.low).toBeGreaterThan(0);

  // Verify has messages
  expect(await mailbox.hasMessages()).toBe(true);

  // Start processing
  mailbox.start();

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 300));

  // Queues should be empty now
  const finalSizes = await mailbox.getQueueSizes();
  expect(finalSizes.system).toBe(0);
  expect(finalSizes.high).toBe(0);
  expect(finalSizes.normal).toBe(0);
  expect(finalSizes.low).toBe(0);
}); 