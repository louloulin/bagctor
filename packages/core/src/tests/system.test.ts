import { expect, test, mock } from "bun:test";
import { ActorSystem } from "../core/system";
import { Actor } from "../core/actor";
import { Message, ActorContext, Props, SupervisorStrategy, SupervisorDirective, PID } from "../core/types";

// Test actor implementation
class TestActor extends Actor {
  public messages: Message[] = [];

  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      this.messages.push(msg);
      if (msg.type === 'throw') {
        throw new Error('Test error');
      }
    });
  }
}

// Test supervisor strategy
class TestSupervisorStrategy implements SupervisorStrategy {
  public failures: { childPID: PID; error: Error }[] = [];
  public directive: SupervisorDirective = SupervisorDirective.Restart;

  handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
    console.log('TestSupervisorStrategy.handleError called:', { error: error.message, childPID, restartCount });
    this.failures.push({ childPID, error });
    return this.directive;
  }
}

// Lifecycle test actor
class LifecycleActor extends TestActor {
  constructor(context: ActorContext, private lifecycleEvents: string[]) {
    super(context);
  }

  async preStart(): Promise<void> {
    this.lifecycleEvents.push('preStart');
  }
  async postStop(): Promise<void> {
    this.lifecycleEvents.push('postStop');
  }
  async preRestart(): Promise<void> {
    this.lifecycleEvents.push('preRestart');
  }
  async postRestart(): Promise<void> {
    this.lifecycleEvents.push('postRestart');
  }
}

// Parent actor for supervision
class ParentActor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      // Handle system failure messages
      if (msg.type === '$system.failure') {
        console.log('ParentActor received failure message:', msg.payload);

        // 显式获取并调用supervisorStrategy
        const context = this.context as ActorContext;
        const supervisorStrategy = context['supervisorStrategy'] as SupervisorStrategy;

        if (supervisorStrategy) {
          const { child, error } = msg.payload;
          console.log('Calling supervisor strategy handleError');
          supervisorStrategy.handleError(error, child, 0);
        } else {
          console.log('No supervisorStrategy found in context');
        }
      }
    });
  }
}

test("ActorSystem should spawn actors", async () => {
  const system = new ActorSystem();
  const pid = await system.spawn({
    actorClass: TestActor
  });

  expect(pid.id).toBeDefined();

  // Send a message to verify actor exists
  await system.send(pid, { type: 'test' });
  const actor = system['actors'].get(pid.id) as TestActor;
  expect(actor.messages).toEqual([{ type: 'test' }]);
});

test("ActorSystem should handle actor failures with supervisor strategy", async () => {
  const system = new ActorSystem();
  const supervisorStrategy = new TestSupervisorStrategy();

  // First create parent actor with supervisor strategy
  console.log('Creating parent actor with supervisor strategy');
  const parentPid = await system.spawn({
    actorClass: ParentActor,
    supervisorStrategy
  });

  console.log('Parent actor created with pid:', parentPid.id);

  // Get parent context to spawn child
  const parentContext = system['contexts'].get(parentPid.id);

  // Ensure parent context exists
  expect(parentContext).toBeDefined();
  if (!parentContext) {
    throw new Error('Parent context not found');
  }

  // Create child actor via parent context
  console.log('Creating child actor via parent');
  const childPid = await parentContext.spawn({
    actorClass: TestActor
  });

  console.log('Child actor created with pid:', childPid.id);

  // 不再需要手动设置parent-child关系，在ActorContext.spawn方法中已经自动设置了parent-child关系

  // 确保系统已初始化
  await new Promise(resolve => setTimeout(resolve, 50));

  console.log('Sending message that causes error to child');
  // Send message that causes error to child
  try {
    await system.send(childPid, { type: 'throw' });
    console.log('Message sent successfully');
  } catch (e: any) {
    // 捕获可能发生的错误，防止测试中断
    console.log('Caught expected error in test:', e.message);
  }

  // 添加更长的延迟确保错误已处理
  console.log('Waiting for error to be processed');
  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify supervisor strategy was called
  console.log('SupervisorStrategy failures:', supervisorStrategy.failures);
  expect(supervisorStrategy.failures.length).toBe(1);
  expect(supervisorStrategy.failures[0].error.message).toBe('Test error');
  expect(supervisorStrategy.failures[0].childPID.id).toBe(childPid.id);
});

test("ActorSystem should handle actor lifecycle", async () => {
  const system = new ActorSystem();
  const lifecycleEvents: string[] = [];

  const pid = await system.spawn({
    producer: (context) => new LifecycleActor(context, lifecycleEvents)
  });

  // Verify preStart was called
  expect(lifecycleEvents).toEqual(['preStart']);

  // Stop actor
  await system.stop(pid);

  // Verify postStop was called
  expect(lifecycleEvents).toEqual(['preStart', 'postStop']);
});

test("ActorSystem should handle dead letters", async () => {
  const system = new ActorSystem();
  const deadLetters: Message[] = [];

  system.addMessageHandler(async (msg: Message) => {
    deadLetters.push(msg);
  });

  // Send message to non-existent actor
  await system.send({ id: 'non-existent' }, { type: 'test' });

  expect(deadLetters.length).toBe(1);
  expect(deadLetters[0]).toEqual({ type: 'test' });
}); 