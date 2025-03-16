import { expect, test, mock } from "bun:test";
import { ActorSystem } from "../core/system";
import { Actor } from "../core/actor";
import { Message, SupervisorDirective, PID } from "../core/types";
import { ActorContext } from "../core/context";
import { PropsBuilder } from "../core/props";
import { SupervisorStrategies } from "../core/helpers";

// 可以抛出错误的测试Actor
class ErrorActor extends Actor {
    public restartCount = 0;

    constructor(context: ActorContext) {
        super(context);
        console.log(`ErrorActor constructed with pid: ${(context as any).pid?.id}`);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            console.log(`ErrorActor received message: ${msg.type}`);

            if (msg.type === 'throw') {
                console.log(`ErrorActor about to throw error: ${msg.payload?.message || 'Test error'}`);
                throw new Error(msg.payload?.message || 'Test error');
            }
            if (msg.type === 'get-restart-count') {
                console.log(`ErrorActor returning restart count: ${this.restartCount}`);
                return this.restartCount;
            }
            return `Processed: ${msg.type}`;
        });
    }

    async preStart(): Promise<void> {
        console.log(`ErrorActor.preStart called. Actor pid: ${(this.context as any).pid?.id}`);
        await super.preStart();
    }

    async postStop(): Promise<void> {
        console.log(`ErrorActor.postStop called. Actor pid: ${(this.context as any).pid?.id}`);
        await super.postStop();
    }

    async preRestart(reason: Error): Promise<void> {
        console.log(`ErrorActor.preRestart called. Actor pid: ${(this.context as any).pid?.id}, reason: ${reason?.message}`);
        await super.preRestart(reason);
    }

    async postRestart(reason: Error): Promise<void> {
        console.log(`ErrorActor.postRestart called. Current count: ${this.restartCount}, incrementing.`);
        this.restartCount++;
        console.log(`ErrorActor.restartCount is now ${this.restartCount}`);
        await super.postRestart(reason);
    }
}

// 父Actor，用于测试子Actor的失败处理
class ParentActor extends Actor {
    public childPids: PID[] = [];
    public failureCount = 0;
    private supervisorStrategy: any;

    constructor(context: ActorContext) {
        super(context);
        console.log(`ParentActor constructed with pid: ${(context as any).pid?.id}`);
        // Store the parent's supervisor strategy for debugging
        this.supervisorStrategy = (context as any).supervisorStrategy;
        console.log(`ParentActor has supervisor strategy: ${this.supervisorStrategy ? this.supervisorStrategy.constructor.name : 'none'}`);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            console.log(`ParentActor received message: ${msg.type}`);

            if (msg.type === 'create-child') {
                console.log(`ParentActor creating child with supervisor strategy`);

                // Use the context's supervisor strategy rather than the message payload
                // This strategy was set when the parent was created with withSupervisor
                console.log(`Using context supervisor strategy: ${(this.context as any).supervisorStrategy ? (this.context as any).supervisorStrategy.constructor.name : 'none'}`);

                const childProps = PropsBuilder.fromClass(ErrorActor)
                    .build(); // Don't set strategy on children, they'll use parent's strategy

                const childPid = await this.spawn(childProps);
                this.childPids.push(childPid);
                console.log(`ParentActor created child with pid: ${childPid.id}`);

                // Check the child context to make sure it has the supervisor strategy
                const childContext = (this.context as any).system.contexts.get(childPid.id);
                console.log(`Child context has strategy: ${childContext && childContext.supervisorStrategy ? childContext.supervisorStrategy.constructor.name : 'none'}`);

                return childPid;
            }

            if (msg.type === 'send-to-child') {
                const { childIndex, message } = msg.payload;
                console.log(`ParentActor sending ${message.type} to child at index ${childIndex}`);
                if (childIndex >= 0 && childIndex < this.childPids.length) {
                    await this.send(this.childPids[childIndex], message);
                    return true;
                }
                return false;
            }

            if (msg.type === 'get-child-restart-count') {
                const { childIndex } = msg.payload;
                console.log(`ParentActor getting restart count for child at index ${childIndex}`);
                if (childIndex >= 0 && childIndex < this.childPids.length) {
                    return await this.context.request(this.childPids[childIndex], { type: 'get-restart-count' });
                }
                return -1;
            }

            if (msg.type === 'get-children') {
                return this.childPids;
            }

            if (msg.type === '$system.failure') {
                console.log(`ParentActor received failure message:`, msg.payload);
                this.failureCount++;

                // Validate the context has a supervisor strategy
                console.log(`ParentActor checking if context has supervisor strategy before forwarding...`);
                console.log(`Context is: ${this.context ? 'defined' : 'undefined'}`);
                console.log(`Context supervisorStrategy: ${(this.context as any).supervisorStrategy ? (this.context as any).supervisorStrategy.constructor.name : 'none'}`);

                console.log(`ParentActor forwarding failure message to context`);
                await (this.context as any).invokeSystemMessage(msg);
                console.log(`ParentActor finished forwarding failure message`);
                return;
            }

            return null;
        });
    }
}

// 测试OneForOne监督策略
test("OneForOne strategy should only restart the failed child", async () => {
    const system = new ActorSystem();
    console.log("\n--- Starting OneForOne test ---");

    // Create the strategy first
    const strategy = SupervisorStrategies.oneForOne(3, 1000);
    console.log("Created OneForOne supervisor strategy");
    console.log(`Strategy is instance of class: ${strategy.constructor.name}`);
    console.log(`Strategy has handleError method: ${typeof strategy.handleError === 'function'}`);

    // 创建父Actor，直接设置策略
    const parentProps = PropsBuilder.fromClass(ParentActor)
        .withSupervisor(strategy)  // Set the supervisor strategy directly on the parent
        .build();
    const parentPid = await system.spawn(parentProps);
    console.log(`Parent actor spawned with PID: ${parentPid.id}`);

    // Check parent context
    const parentContext = system['contexts'].get(parentPid.id);
    console.log(`Parent context supervisor strategy: ${parentContext && (parentContext as any).supervisorStrategy ? (parentContext as any).supervisorStrategy.constructor.name : 'none'}`);

    // 创建两个子Actor，不需要额外传递策略，因为父Actor已经有策略
    // 创建第一个子Actor
    const child1Pid = await system.request<PID>(parentPid, {
        type: 'create-child',
        payload: {}  // No need to pass strategy here
    });
    console.log(`Child 1 created with PID: ${child1Pid.id}`);

    // Check child context
    const childContext = system['contexts'].get(child1Pid.id);
    console.log(`Child 1 context supervisor strategy: ${childContext && (childContext as any).supervisorStrategy ? (childContext as any).supervisorStrategy.constructor.name : 'none'}`);

    // 创建第二个子Actor
    const child2Pid = await system.request<PID>(parentPid, {
        type: 'create-child',
        payload: {}  // No need to pass strategy here
    });
    console.log(`Child 2 created with PID: ${child2Pid.id}`);

    // 让第一个子Actor发生错误
    console.log("Sending error to Child 1");
    await system.send(parentPid, {
        type: 'send-to-child',
        payload: {
            childIndex: 0,
            message: { type: 'throw', payload: { message: 'Child 1 Error' } }
        }
    });

    // 等待错误处理完成
    console.log("Waiting for error handling to complete...");
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 获取重启次数
    console.log("Getting restart counts");
    const child1RestartCount = await system.request<number>(parentPid, {
        type: 'get-child-restart-count',
        payload: { childIndex: 0 }
    });
    console.log(`Child 1 restart count: ${child1RestartCount}`);

    const child2RestartCount = await system.request<number>(parentPid, {
        type: 'get-child-restart-count',
        payload: { childIndex: 1 }
    });
    console.log(`Child 2 restart count: ${child2RestartCount}`);

    // 验证第一个子Actor被重启，第二个没有
    expect(child1RestartCount).toBe(1);
    expect(child2RestartCount).toBe(0);
});

// 测试AllForOne监督策略
test("AllForOne strategy should restart all children when one fails", async () => {
    const system = new ActorSystem();
    console.log("\n--- Starting AllForOne test ---");

    // Create the strategy first
    const strategy = SupervisorStrategies.allForOne(3, 1000);
    console.log("Created AllForOne supervisor strategy");

    // 创建父Actor，直接设置策略
    const parentProps = PropsBuilder.fromClass(ParentActor)
        .withSupervisor(strategy)  // Set the supervisor strategy directly on the parent
        .build();
    const parentPid = await system.spawn(parentProps);
    console.log(`Parent actor spawned with PID: ${parentPid.id}`);

    // 创建两个子Actor
    // 创建第一个子Actor
    const child1Pid = await system.request<PID>(parentPid, {
        type: 'create-child',
        payload: {}  // No need to pass strategy here
    });
    console.log(`Child 1 created with PID: ${child1Pid.id}`);

    // 创建第二个子Actor
    const child2Pid = await system.request<PID>(parentPid, {
        type: 'create-child',
        payload: {}  // No need to pass strategy here
    });
    console.log(`Child 2 created with PID: ${child2Pid.id}`);

    // 让第一个子Actor发生错误
    console.log("Sending error to Child 1");
    await system.send(parentPid, {
        type: 'send-to-child',
        payload: {
            childIndex: 0,
            message: { type: 'throw', payload: { message: 'Child 1 Error' } }
        }
    });

    // 等待错误处理完成
    console.log("Waiting for error handling to complete...");
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 获取重启次数
    console.log("Getting restart counts");
    const child1RestartCount = await system.request<number>(parentPid, {
        type: 'get-child-restart-count',
        payload: { childIndex: 0 }
    });
    console.log(`Child 1 restart count: ${child1RestartCount}`);

    const child2RestartCount = await system.request<number>(parentPid, {
        type: 'get-child-restart-count',
        payload: { childIndex: 1 }
    });
    console.log(`Child 2 restart count: ${child2RestartCount}`);

    // 验证两个子Actor都被重启
    expect(child1RestartCount).toBeGreaterThan(0);
    expect(child2RestartCount).toBeGreaterThan(0);
});

// 测试自定义监督策略
test("Custom strategy should use the provided handler", async () => {
    const system = new ActorSystem();
    console.log("\n--- Starting Custom Strategy test ---");

    // 创建自定义监督策略
    const customStrategy = {
        handleError: (error: Error, child: PID, restartCount: number): SupervisorDirective => {
            console.log(`[Custom] handleError called for child ${child.id}, error: ${error.message}`);
            // 根据错误消息决定行为
            if (error.message.includes('restart')) {
                return SupervisorDirective.Restart;
            } else if (error.message.includes('stop')) {
                return SupervisorDirective.Stop;
            } else if (error.message.includes('resume')) {
                return SupervisorDirective.Resume;
            } else {
                return SupervisorDirective.Escalate;
            }
        }
    };
    console.log("Created custom supervisor strategy");

    // 创建父Actor，直接设置策略
    const parentProps = PropsBuilder.fromClass(ParentActor)
        .withSupervisor(customStrategy)  // Set the supervisor strategy directly on the parent
        .build();
    const parentPid = await system.spawn(parentProps);
    console.log(`Parent actor spawned with PID: ${parentPid.id}`);

    // 创建子Actor
    const childPid = await system.request<PID>(parentPid, {
        type: 'create-child',
        payload: {}  // No need to pass strategy here
    });
    console.log(`Child created with PID: ${childPid.id}`);

    // 让子Actor发生错误，触发重启
    console.log("Sending 'restart' error to child");
    await system.send(parentPid, {
        type: 'send-to-child',
        payload: {
            childIndex: 0,
            message: { type: 'throw', payload: { message: 'restart this actor' } }
        }
    });

    // 等待错误处理完成
    console.log("Waiting for error handling to complete...");
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 获取重启次数
    console.log("Getting restart count");
    const restartCount = await system.request<number>(parentPid, {
        type: 'get-child-restart-count',
        payload: { childIndex: 0 }
    });
    console.log(`Child restart count: ${restartCount}`);

    // 验证子Actor被重启
    expect(restartCount).toBe(1);
});

// 直接测试restart方法
test("Direct restart should increment restart count", async () => {
    const system = new ActorSystem();
    console.log("\n--- Starting Direct Restart test ---");

    // 创建一个ErrorActor
    const context = new ActorContext({ id: 'test-actor' } as PID, system);
    const actor = new ErrorActor(context);
    system['actors'].set('test-actor', actor);
    system['contexts'].set('test-actor', context);

    console.log("ErrorActor created directly for restart testing");
    console.log(`Initial restart count: ${actor.restartCount}`);

    // 直接调用restart方法
    console.log("Directly calling system.restart()");
    await system.restart({ id: 'test-actor' } as PID, new Error("Test restart"));

    console.log(`After restart count: ${actor.restartCount}`);
    expect(actor.restartCount).toBe(1);
});

test("Adding supervisor strategy validation", async () => {
    const system = new ActorSystem();
    console.log("\n--- Starting Supervisor Strategy Validation test ---");

    // Create a OneForOne strategy
    const strategy = SupervisorStrategies.oneForOne(3, 1000);
    console.log("Created OneForOne supervisor strategy for validation");

    // Create a parent actor with direct supervisor strategy
    console.log("Creating parent actor with supervisor strategy");
    const parentProps = PropsBuilder.fromClass(ParentActor)
        .withSupervisor(strategy)
        .build();
    const parentPid = await system.spawn(parentProps);

    // Get the parent's context and check if it has the strategy
    const parentContext = system['contexts'].get(parentPid.id);
    console.log(`Parent context has supervisor strategy: ${parentContext && (parentContext as any).supervisorStrategy ? (parentContext as any).supervisorStrategy.constructor.name : 'none'}`);

    // Create a child actor
    console.log("Creating child actor");
    const childPid = await system.request<PID>(parentPid, {
        type: 'create-child',
        payload: { supervisorStrategy: strategy }
    });

    // Get the child's context and check if it has the strategy
    const childContext = system['contexts'].get(childPid.id);
    console.log(`Child context has supervisor strategy: ${childContext && (childContext as any).supervisorStrategy ? (childContext as any).supervisorStrategy.constructor.name : 'none'}`);

    // Now try directly calling handleError on the strategy
    if (childContext && (childContext as any).supervisorStrategy) {
        console.log("Directly calling handleError on child context's strategy");
        const directive = (childContext as any).supervisorStrategy.handleError(new Error("Test error"), childPid, 0);
        console.log(`Strategy returned directive: ${SupervisorDirective[directive]} (${directive})`);

        // Now try handling this directive
        console.log("Directly calling handleSupervisorDirective");
        await (childContext as any).handleSupervisorDirective(childPid, directive, new Error("Test error"));

        // Check if the child actor was restarted
        const childActor = system.getActor(childPid.id) as ErrorActor;
        console.log(`Child actor restart count after direct strategy test: ${childActor.restartCount}`);
        expect(childActor.restartCount).toBe(1);
    } else {
        console.log("Child context does not have a supervisor strategy!");
        // Fail the test
        expect(childContext && (childContext as any).supervisorStrategy).toBeTruthy();
    }
});

// Directly validate supervisor strategy assignment
test("Supervisor Strategy Assignment", async () => {
    const system = new ActorSystem();
    console.log("\n--- Testing Supervisor Strategy Assignment ---");

    // Create a supervisor strategy
    const strategy = SupervisorStrategies.oneForOne(3, 1000);
    console.log(`Created strategy: ${strategy.constructor.name}`);

    // Create a child actor with the strategy
    const context = new ActorContext({ id: 'test-child' } as PID, system, undefined, strategy);
    const actor = new ErrorActor(context);
    system['actors'].set('test-child', actor);
    system['contexts'].set('test-child', context);

    // Check if the context has the strategy
    console.log(`Context has strategy: ${(context as any).supervisorStrategy ? (context as any).supervisorStrategy.constructor.name : 'none'}`);

    // Try calling handleError directly on the strategy
    if ((context as any).supervisorStrategy) {
        const directive = (context as any).supervisorStrategy.handleError(new Error("Test"), { id: 'test-child' } as PID, 0);
        console.log(`Strategy returned directive: ${SupervisorDirective[directive]} (${directive})`);

        // Call handleSupervisorDirective directly
        await (context as any).handleSupervisorDirective({ id: 'test-child' } as PID, directive, new Error("Test"));

        // Check restart count
        console.log(`Actor restart count: ${actor.restartCount}`);
        expect(actor.restartCount).toBe(1);
    }
}); 