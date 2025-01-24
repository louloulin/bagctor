import { expect, test, mock } from "bun:test";
import { ActorSystem } from "../core/system";
import { Actor } from "../core/actor";
import { Message, ActorContext, Props, SupervisorStrategy, SupervisorDirective } from "../core/types";

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
  public failures: { supervisor: ActorContext; child: any; error: Error }[] = [];
  public directive: SupervisorDirective = SupervisorDirective.Restart;

  handleFailure(supervisor: ActorContext, child: any, error: Error): SupervisorDirective {
    this.failures.push({ supervisor, child, error });
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

let system: ActorSystem;
let supervisorStrategy: TestSupervisorStrategy;
let lifecycleEvents: string[];

test("ActorSystem should spawn actors", async () => {
  system = new ActorSystem();
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
  system = new ActorSystem();
  supervisorStrategy = new TestSupervisorStrategy();
  
  const pid = await system.spawn({
    actorClass: TestActor,
    supervisorStrategy
  });

  // Send message that causes error
  await system.send(pid, { type: 'throw' });

  // Verify supervisor strategy was called
  expect(supervisorStrategy.failures.length).toBe(1);
  expect(supervisorStrategy.failures[0].error.message).toBe('Test error');
});

test("ActorSystem should handle actor lifecycle", async () => {
  system = new ActorSystem();
  lifecycleEvents = [];

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
  system = new ActorSystem();
  const pid = { id: 'non-existent' };

  // Send message to non-existent actor
  const message = { type: 'test' };
  await system.send(pid, message);

  // Verify message was added to dead letters
  expect(system['deadLetters']).toEqual([message]);
}); 