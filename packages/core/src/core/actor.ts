import { Message, PID, Props } from './types';
import { ActorContext } from './context';

/**
 * Actor基类 - 类型安全版本
 * 提供消息处理、状态管理和行为转换的基础设施
 * @template TState 状态类型
 * @template TMessage 消息类型，必须扩展基础Message接口
 */
export abstract class Actor<TState = any, TMessage extends Message = Message> {
  protected context: ActorContext;
  // 当前行为名称
  protected behaviorState: string = 'default';
  // 用于存储Actor业务数据的状态对象
  protected state: TState;
  // 行为映射表
  protected behaviorMap: Map<string, (message: TMessage) => Promise<any> | any> = new Map();
  // 缓存当前行为处理函数以提高性能
  private cachedBehavior: ((message: TMessage) => Promise<any> | any) | null = null;
  private cachedBehaviorState: string | null = null;

  constructor(context: ActorContext, initialState?: TState) {
    this.context = context;
    this.state = initialState || {} as TState;
    this.behaviors();
  }

  /**
   * 子类必须实现behaviors方法，定义Actor的行为
   */
  protected abstract behaviors(): void;

  /**
   * 添加行为处理函数
   * @param state 行为状态名称
   * @param handler 处理该状态下的消息的函数
   */
  protected addBehavior(
    state: string,
    handler: (message: TMessage) => Promise<any> | any
  ): void {
    this.behaviorMap.set(state, handler);
  }

  /**
   * 转换Actor状态，更改当前行为
   * @param state 要切换到的行为状态名称
   */
  protected become(state: string): void {
    if (!this.behaviorMap.has(state)) {
      throw new Error(`Unknown state: ${state}`);
    }
    this.behaviorState = state;
    this.cachedBehavior = null;
    this.cachedBehaviorState = null;
  }

  /**
   * Actor消息接收入口方法
   * 优化版：使用缓存减少行为查找开销，支持响应处理
   * @param message 要处理的消息
   * @returns 消息处理的结果
   */
  async receive(message: TMessage): Promise<any> {
    // 使用缓存优化行为查找
    if (this.cachedBehaviorState !== this.behaviorState || this.cachedBehavior === null) {
      this.cachedBehavior = this.behaviorMap.get(this.behaviorState) || null;
      this.cachedBehaviorState = this.behaviorState;
    }

    if (!this.cachedBehavior) {
      const error = new Error(`No behavior found for state: ${this.behaviorState}`);
      console.error(error);

      // 如果是请求消息，发送错误响应
      if (message.responseId) {
        this.context.respond(message, null, error);
      }

      throw error;
    }

    try {
      // 执行行为处理函数
      const result = await this.cachedBehavior(message);

      // 如果是请求消息，自动发送响应
      if (message.responseId) {
        this.context.respond(message, result);
      }

      return result;
    } catch (error) {
      console.error(`Error processing message ${message.type} in state ${this.behaviorState}:`, error);

      // 如果是请求消息，发送错误响应
      if (message.responseId) {
        this.context.respond(message, null, error);
      }

      throw error;
    }
  }

  /**
   * 向另一个Actor发送消息
   * @param target 目标Actor的PID
   * @param message 要发送的消息
   */
  protected async send(target: PID, message: Message): Promise<void> {
    await this.context.send(target, message);
  }

  /**
   * 创建子Actor
   * @param props Actor的属性定义
   * @returns 创建的Actor的PID
   */
  protected async spawn(props: Props): Promise<PID> {
    return await this.context.spawn(props);
  }

  // 生命周期方法
  /**
   * Actor启动前调用
   */
  async preStart(): Promise<void> {
    // 初始化actor状态
  }

  /**
   * Actor停止后调用
   */
  async postStop(): Promise<void> {
    // 清理actor状态
  }

  /**
   * Actor重启前调用
   * @param reason 重启原因
   */
  async preRestart(reason: Error): Promise<void> {
    console.log(`[Actor Base] preRestart called for ${(this.context as any).pid?.id}. Reason: ${reason?.message}`);
    // We'll skip calling postStop() to preserve state like restartCount
    // await this.postStop();
    console.log(`[Actor Base] preRestart completed for ${(this.context as any).pid?.id}`);
  }

  /**
   * Actor重启后调用
   * @param reason 重启原因
   */
  async postRestart(reason: Error): Promise<void> {
    console.log(`[Actor Base] postRestart called for ${(this.context as any).pid?.id}. Reason: ${reason?.message}`);
    // We'll skip calling preStart() to preserve state like restartCount
    // await this.preStart();
    console.log(`[Actor Base] postRestart completed for ${(this.context as any).pid?.id}`);
  }

  /**
   * 更新状态数据
   * @param newStateData 新的状态数据，将与现有状态合并
   */
  protected setState(newStateData: Partial<TState>): void {
    this.state = { ...this.state, ...newStateData };
  }

  /**
   * 获取当前状态数据
   * @returns 当前状态数据
   */
  protected getState(): TState {
    return this.state;
  }

  /**
   * 获取完整的Actor状态，包括行为状态和数据状态
   */
  get actorState() {
    return {
      behavior: this.behaviorState,
      data: this.state
    };
  }

  /**
   * 设置完整的Actor状态，包括行为状态和数据状态
   */
  set actorState(newState: { behavior: string, data: Partial<TState> }) {
    if (newState.behavior && this.behaviorMap.has(newState.behavior)) {
      this.behaviorState = newState.behavior;
      this.cachedBehavior = null;
      this.cachedBehaviorState = null;
    }
    if (newState.data) {
      this.setState(newState.data);
    }
  }
} 