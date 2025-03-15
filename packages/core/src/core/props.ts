import { Props, IMailbox, SupervisorStrategy, MessageDispatcher, Message } from './types';
import { ActorContext } from './context';
import { Actor } from './actor';

/**
 * Props 构建器，提供流畅的 API
 * @template TState Actor状态类型
 * @template TMessage Actor消息类型，必须扩展基础Message接口
 */
export class PropsBuilder<TState = any, TMessage extends Message = Message> {
  private props: Props = {};

  /**
   * 从Actor类创建Props构建器
   * @param actorClass Actor类
   * @returns Props构建器实例
   */
  static fromClass<S = any, M extends Message = Message>(
    actorClass: new (context: ActorContext) => Actor
  ): PropsBuilder<S, M> {
    const builder = new PropsBuilder<S, M>();
    builder.props.actorClass = actorClass;
    return builder;
  }

  /**
   * 从Actor生产函数创建Props构建器
   * @param producer Actor生产函数
   * @returns Props构建器实例
   */
  static fromProducer<S = any, M extends Message = Message>(
    producer: (context: ActorContext) => Actor
  ): PropsBuilder<S, M> {
    const builder = new PropsBuilder<S, M>();
    builder.props.producer = producer;
    return builder;
  }

  /**
   * 从简单的消息处理函数创建Props构建器
   * @param handler 消息处理函数
   * @returns Props构建器实例
   */
  static fromHandler<M extends Message = Message>(
    handler: (msg: M) => void | Promise<void>
  ): PropsBuilder<any, M> {
    return PropsBuilder.fromProducer((context: ActorContext) => {
      class LambdaActor extends Actor {
        protected behaviors(): void {
          this.addBehavior('default', async (msg: Message) => {
            await Promise.resolve(handler(msg as M));
          });
        }
      }
      return new LambdaActor(context);
    });
  }

  /**
   * 从有状态的处理函数创建Props构建器
   * @param initialState 初始状态
   * @param handler 状态处理函数，接收当前状态和消息，返回新状态
   * @returns Props构建器实例
   */
  static fromState<S, M extends Message = Message>(
    initialState: S,
    handler: (state: S, msg: M, context: ActorContext) => Promise<S> | S
  ): PropsBuilder<S, M> {
    return PropsBuilder.fromProducer((context: ActorContext) => {
      class StatefulLambdaActor extends Actor {
        private customState: S = initialState;

        protected behaviors(): void {
          this.addBehavior('default', async (msg: Message) => {
            this.customState = await Promise.resolve(handler(this.customState, msg as M, context));
            this.setState(this.customState as any);
          });
        }
      }
      return new StatefulLambdaActor(context);
    });
  }

  /**
   * 从带上下文的函数创建Props构建器
   * @param func 处理函数，接收上下文和消息
   * @returns Props构建器实例
   */
  static fromFunc<M extends Message = Message>(
    func: (context: ActorContext, message: M) => void
  ): PropsBuilder<any, M> {
    return PropsBuilder.fromProducer((context: ActorContext) => {
      class FunctionalActor extends Actor {
        constructor(context: ActorContext) {
          super(context);
        }

        protected behaviors(): void {
          this.addBehavior('default', async (msg: Message) => {
            func(context, msg as M);
          });
        }
      }
      return new FunctionalActor(context);
    });
  }

  /**
   * 静态创建方法
   * @returns 新的Props构建器实例
   */
  static create<S = any, M extends Message = Message>(): PropsBuilder<S, M> {
    return new PropsBuilder<S, M>();
  }

  /**
   * 设置Actor类
   * @param actorClass Actor类
   * @returns 当前构建器实例，支持链式调用
   */
  withActorClass(
    actorClass: new (context: ActorContext) => Actor
  ): this {
    this.props.actorClass = actorClass;
    return this;
  }

  /**
   * 设置Actor生产函数
   * @param producer Actor生产函数
   * @returns 当前构建器实例，支持链式调用
   */
  withProducer(
    producer: (context: ActorContext) => Actor
  ): this {
    this.props.producer = producer;
    return this;
  }

  /**
   * 设置邮箱类型
   * @param mailboxType 邮箱类型
   * @returns 当前构建器实例，支持链式调用
   */
  withMailbox(mailboxType: new () => IMailbox): this {
    this.props.mailboxType = mailboxType;
    return this;
  }

  /**
   * 设置监督策略
   * @param strategy 监督策略
   * @returns 当前构建器实例，支持链式调用
   */
  withSupervisor(strategy: SupervisorStrategy): this {
    this.props.supervisorStrategy = strategy;
    return this;
  }

  /**
   * 设置调度器
   * @param dispatcher 调度器
   * @returns 当前构建器实例，支持链式调用
   */
  withDispatcher(dispatcher: MessageDispatcher): this {
    this.props.dispatcher = dispatcher;
    return this;
  }

  /**
   * 设置地址
   * @param address 地址字符串
   * @returns 当前构建器实例，支持链式调用
   */
  withAddress(address: string): this {
    this.props.address = address;
    return this;
  }

  /**
   * 设置上下文
   * @param context 上下文对象
   * @returns 当前构建器实例，支持链式调用
   */
  withContext(context: any): this {
    this.props.actorContext = context;
    return this;
  }

  /**
   * 构建Props
   * @returns 构建的Props对象
   */
  build(): Props {
    // Validate props
    if (!this.props.actorClass && !this.props.producer) {
      throw new Error('Props must have either actorClass or producer defined');
    }
    return { ...this.props };
  }
} 