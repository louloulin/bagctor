// 模拟文件：为测试提供必要的ActorSystem、ActorContext和相关组件的模拟实现
import { Actor } from '../../core/actor';
import { Message as BaseMessage, PID as BasePID } from '@bactor/common';
import { Props, IMailbox, MessageInvoker, MessageDispatcher } from '../../core/types';

// 简化的模拟实现，仅用于测试目的
export class MockMailbox implements IMailbox {
    registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void { }
    postUserMessage(message: BaseMessage): void { }
    postSystemMessage(message: BaseMessage): void { }
    start(): void { }
    isSuspended(): boolean { return false; }
}

export class MockDispatcher implements MessageDispatcher {
    schedule(runner: () => Promise<void>): void {
        runner(); // 简单直接执行
    }
}

export class MockActorSystem {
    private actors: Map<string, Actor> = new Map();
    private contexts: Map<string, MockActorContext> = new Map();
    public rootContext!: MockActorContext; // 使用!断言这个属性会在构造后初始化

    constructor(public name: string = 'mock-system') {
        // 创建一个临时的自引用根上下文
        this.initRootContext();
    }

    initRootContext(): void {
        // 创建根上下文
        this.rootContext = new MockActorContext(
            { id: 'root', address: 'local' },
            this
        );
    }

    getActor(id: string): Actor | undefined {
        return this.actors.get(id);
    }

    registerActor(id: string, actor: Actor, context: MockActorContext): void {
        this.actors.set(id, actor);
        this.contexts.set(id, context);
    }

    async shutdown(): Promise<void> {
        for (const [id, context] of this.contexts) {
            await context.stopAll();
        }
        this.actors.clear();
        this.contexts.clear();
    }
}

export class MockActorContext {
    public children: Map<string, BasePID> = new Map();
    public mailbox: IMailbox = new MockMailbox();

    constructor(
        public pid: BasePID,
        public system: MockActorSystem
    ) { }

    get self(): BasePID {
        return this.pid;
    }

    async send(target: BasePID, message: BaseMessage): Promise<void> {
        const actor = this.system.getActor(target.id);
        if (actor) {
            await actor.receive(message);
        }
    }

    async spawn(props: Props): Promise<BasePID> {
        const actorId = `actor-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const pid = { id: actorId, address: 'local' };

        // 创建上下文
        const context = new MockActorContext(pid, this.system);

        // 创建Actor
        let actor: Actor;
        if (props.actorClass) {
            // 特殊处理TypedActor，它需要两个参数
            try {
                // 尝试使用两个参数创建
                if (props.actorContext?.initialState !== undefined) {
                    // @ts-ignore - 我们知道TypedActor需要两个参数
                    actor = new props.actorClass(context, props.actorContext.initialState);
                } else {
                    actor = new props.actorClass(context);
                }
            } catch (error) {
                // 回退到单参数构造函数
                actor = new props.actorClass(context);
            }
        } else if (props.producer) {
            actor = props.producer(context);
        } else {
            throw new Error('No actor class or producer provided');
        }

        // 注册Actor
        this.system.registerActor(actorId, actor, context);
        this.children.set(actorId, pid);

        return pid;
    }

    async stop(pid: BasePID): Promise<void> {
        this.children.delete(pid.id);
    }

    async stopAll(): Promise<void> {
        for (const pid of this.children.values()) {
            await this.stop(pid);
        }
        this.children.clear();
    }
} 