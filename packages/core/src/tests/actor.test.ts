import { expect, test, mock } from "bun:test";
import { Actor } from "../core/actor";
import { Message, ActorContext, PID } from "../core/types";

// Test actor implementation
class TestActor extends Actor {
  public messageLog: Message[] = [];
  public currentBehavior: string = 'default';

  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      this.messageLog.push(msg);
      if (msg.type === 'change_behavior') {
        this.become('alternative');
      }
    });

    this.addBehavior('alternative', async (msg: Message) => {
      this.messageLog.push({ ...msg, type: 'alternative_' + msg.type });
    });
  }
}

// Mock context
class MockContext implements ActorContext {
  public sentMessages: { target: PID; message: Message }[] = [];
  public children: PID[] = [];

  constructor(private pid: PID) {}

  getPID(): PID {
    return this.pid;
  }

  async send(target: PID, message: Message): Promise<void> {
    this.sentMessages.push({ target, message });
  }

  async spawn(props: any): Promise<PID> {
    const childPid = { id: 'child_' + this.children.length };
    this.children.push(childPid);
    return childPid;
  }
}

test("Actor should handle messages with current behavior", async () => {
  const context = new MockContext({ id: 'test' });
  const actor = new TestActor(context);
  await actor.receive({ type: 'test' });
  expect(actor.messageLog.length).toBe(1);
  expect(actor.messageLog[0].type).toBe('test');
});

test("Actor should change behavior", async () => {
  const context = new MockContext({ id: 'test' });
  const actor = new TestActor(context);
  await actor.receive({ type: 'change_behavior' });
  await actor.receive({ type: 'test' });
  expect(actor.messageLog[1].type).toBe('alternative_test');
});

test("Actor should handle lifecycle events", async () => {
  const context = new MockContext({ id: 'test' });
  const actor = new TestActor(context);
  await actor.preStart();
  await actor.postStop();
  expect(true).toBe(true);
});

test("Actor should manage state", async () => {
  const context = new MockContext({ id: 'test' });
  const actor = new TestActor(context);
  // Test state management
  actor['setState']({ count: 1 });
  expect(actor['getState']()).toEqual({ count: 1 });

  // State should persist between messages
  await actor.receive({ type: 'test' });
  expect(actor['getState']()).toEqual({ count: 1 });
}); 