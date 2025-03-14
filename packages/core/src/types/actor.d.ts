// 声明ActorSystem接口
declare module '@core/system' {
    export class ActorSystem {
        constructor();

        // 初始化和关闭
        initialize(): Promise<void>;
        shutdown(): Promise<void>;

        // Actor生命周期操作
        spawn(options: any): Promise<PID>;
        stop(pid: PID): Promise<void>;

        // 消息发送
        send(target: PID, message: any): Promise<void>;
        request(target: PID, message: any, timeout?: number): Promise<any>;

        // 系统钩子
        addMessageInterceptor(interceptor: (message: any, source: PID, target: PID) => Promise<boolean>): void;
        addMessageProcessingHook(hook: (message: any, target: PID, error?: Error) => Promise<boolean>): void;
        addActorCreationHook(hook: (actor: PID) => boolean): void;
        addActorTerminationHook(hook: (actor: PID) => boolean): void;
        addErrorHook(hook: (actor: PID, error: Error) => boolean): void;
        addDeadLetterHook(hook: (message: any, target: PID) => boolean): void;
        addRestartHook(hook: (actor: PID, error: Error) => boolean): void;
        addStateUpdateHook(hook: (actor: PID, state: any) => Promise<void>): void;
    }
}

// 声明PID接口
declare module '@core/types' {
    export interface PID {
        id: string;
        address?: string;
        type?: string;
    }

    export interface Message {
        type: string;
        payload?: any;
        metadata?: {
            trace?: any;
            [key: string]: any;
        };
        id?: string;
    }
} 