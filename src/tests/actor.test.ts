import { expect, test, mock } from "bun:test";
import { Actor } from "../core/actor";
import { Message, ActorContext, PID } from "../core/types";

// Test actor implementation
class TestActor extends Actor {
  public messageLog: Message[] = [];
  public currentBehavior: string = 'default';

  protected initializeBehaviors(): void {
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
  expect(actor.messageLog).toEqual([{ type: 'test' }]);
});

test("Actor should change behavior", async () => {
  const context = new MockContext({ id: 'test' });
  const actor = new TestActor(context);

  // Initial behavior
  await actor.receive({ type: 'test1' });
  // Change behavior
  await actor.receive({ type: 'change_behavior' });
  // New behavior
  await actor.receive({ type: 'test2' });

  expect(actor.messageLog).toEqual([
    { type: 'test1' },
    { type: 'change_behavior' },
    { type: 'alternative_test2' }
  ]);
});

test("Actor should handle lifecycle events", async () => {
  const context = new MockContext({ id: 'test' });
  const actor = new TestActor(context);
  const lifecycleEvents: string[] = [];

  // Override lifecycle methods for testing
  actor.preStart = async () => {
    lifecycleEvents.push('preStart');
  };
  actor.postStop = async () => {
    lifecycleEvents.push('postStop');
  };
  actor.preRestart = async () => {
    lifecycleEvents.push('preRestart');
  };
  actor.postRestart = async () => {
    lifecycleEvents.push('postRestart');
  };

  // Test lifecycle
  await actor.preStart();
  await actor.preRestart(new Error('test'));
  await actor.postRestart(new Error('test'));
  await actor.postStop();

  expect(lifecycleEvents).toEqual([
    'preStart',
    'preRestart',
    'postRestart',
    'postStop'
  ]);
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