import { Message, PID, Props } from './types';
import { ActorContext } from './context';

/**
 * Actor基类 - 优化版本
 * 提供消息处理、状态管理和行为转换的基础设施
 */
export abstract class Actor {
  protected context: ActorContext;
  // 当前行为名称
  protected behaviorState: string = 'default';
  // 用于存储Actor业务数据的状态对象
  protected stateData: Record<string, any> = {};
  // 行为映射表
  protected behaviorMap: Map<string, (message: Message) => Promise<any> | any> = new Map();
  // 缓存当前行为处理函数以提高性能
  private cachedBehavior: ((message: Message) => Promise<any> | any) | null = null;
  private cachedBehaviorState: string | null = null;

  constructor(context: ActorContext) {
    this.context = context;
    this.behaviors();
  }

  /**
   * 子类必须实现behaviors方法，定义Actor的行为
   */
  protected abstract behaviors(): void;

  /**
   * 添加行为处理函数
   */
  protected addBehavior(
    state: string,
    handler: (message: Message) => Promise<any> | any
  ): void {
    this.behaviorMap.set(state, handler);
  }

  /**
   * 转换Actor状态，更改当前行为
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
   */
  async receive(message: Message): Promise<any> {
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

  protected async send(target: PID, message: Message): Promise<void> {
    await this.context.send(target, message);
  }

  protected async spawn(props: Props): Promise<PID> {
    return await this.context.spawn(props);
  }

  // 生命周期方法
  async preStart(): Promise<void> {
    // 初始化actor状态
  }

  async postStop(): Promise<void> {
    // 清理actor状态
  }

  async preRestart(reason: Error): Promise<void> {
    await this.postStop();
  }

  async postRestart(reason: Error): Promise<void> {
    await this.preStart();
  }

  // 状态管理 - 兼容旧的API但使用新的实现
  protected setState(data: any): void {
    this.stateData = { ...this.stateData, ...data };
  }

  protected getState(): any {
    return this.stateData;
  }

  // 提供访问器以保持API兼容性，供旧测试和代码使用
  get state() {
    return {
      behavior: this.behaviorState,
      data: this.stateData
    };
  }

  set state(newState: { behavior: string, data: any }) {
    if (newState.behavior && this.behaviorMap.has(newState.behavior)) {
      this.behaviorState = newState.behavior;
      this.cachedBehavior = null;
      this.cachedBehaviorState = null;
    }
    if (newState.data) {
      this.stateData = { ...this.stateData, ...newState.data };
    }
  }
} 