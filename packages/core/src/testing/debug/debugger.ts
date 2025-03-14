import { ActorSystem } from '@core/system';
import { Message, PID } from '@core/types';
import { log } from '@utils/logger';

export interface DebuggerConfig {
    breakOnMessage: string[];
    breakOnActor: string[];
    logLevel: string;
    captureStackTrace: boolean;
    recordHistory: boolean;
    historyLimit: number;
}

export interface MessageTrace {
    messageId: string;
    type: string;
    source: PID;
    target: PID;
    timestamp: number;
    stackTrace?: string;
    context?: any;
}

export interface ActorState {
    pid: PID;
    mailboxSize: number;
    lastProcessedMessage?: MessageTrace;
    state: any;
    children: PID[];
}

export class ActorDebugger {
    private system: ActorSystem;
    private config: DebuggerConfig;
    private messageHistory: MessageTrace[] = [];
    private breakpoints: Set<string> = new Set();
    private actorStates: Map<string, ActorState> = new Map();
    private isDebugging: boolean = false;

    constructor(system: ActorSystem, config: DebuggerConfig) {
        this.system = system;
        this.config = config;
        this.initializeBreakpoints();
    }

    start(): void {
        this.isDebugging = true;
        log.info('Actor debugger started');
        this.attachDebugHooks();
    }

    stop(): void {
        this.isDebugging = false;
        log.info('Actor debugger stopped');
    }

    private initializeBreakpoints(): void {
        if (this.config.breakOnMessage) {
            this.config.breakOnMessage.forEach(msgType =>
                this.breakpoints.add(`msg:${msgType}`));
        }
        if (this.config.breakOnActor) {
            this.config.breakOnActor.forEach(actorId =>
                this.breakpoints.add(`actor:${actorId}`));
        }
    }

    private attachDebugHooks(): void {
        // 注入消息拦截器
        this.system.addMessageInterceptor(async (msg: Message, source: PID, target: PID) => {
            if (!this.isDebugging) return true;

            const trace = this.createMessageTrace(msg, source, target);
            this.recordMessage(trace);

            // 检查断点
            if (this.shouldBreak(msg, target)) {
                await this.handleBreakpoint(trace);
            }

            return true;
        });

        // 注入状态更新钩子
        this.system.addStateUpdateHook(async (pid: PID, state: any) => {
            if (!this.isDebugging) return;

            this.updateActorState(pid, state);
        });
    }

    private createMessageTrace(msg: Message, source: PID, target: PID): MessageTrace {
        const trace: MessageTrace = {
            messageId: Math.random().toString(36).substr(2, 9),
            type: msg.type,
            source,
            target,
            timestamp: Date.now(),
            context: msg.payload
        };

        if (this.config.captureStackTrace) {
            trace.stackTrace = new Error().stack;
        }

        return trace;
    }

    private recordMessage(trace: MessageTrace): void {
        if (!this.config.recordHistory) return;

        this.messageHistory.push(trace);
        if (this.messageHistory.length > this.config.historyLimit) {
            this.messageHistory.shift();
        }

        log.debug(`Message recorded: ${trace.type} from ${trace.source.id} to ${trace.target.id}`);
    }

    private shouldBreak(msg: Message, target: PID): boolean {
        return this.breakpoints.has(`msg:${msg.type}`) ||
            this.breakpoints.has(`actor:${target.id}`);
    }

    private async handleBreakpoint(trace: MessageTrace): Promise<void> {
        log.info(`Breakpoint hit: ${trace.type}`);
        log.info('Message details:', trace);

        // 在这里可以添加交互式调试功能
        await this.pauseExecution();
    }

    private async pauseExecution(): Promise<void> {
        log.info('Execution paused. Press any key to continue...');
        // 在实际实现中，这里可以添加交互式调试命令处理
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    private updateActorState(pid: PID, state: any): void {
        const actorState = this.actorStates.get(pid.id) || {
            pid,
            mailboxSize: 0,
            state: {},
            children: []
        };

        actorState.state = state;
        this.actorStates.set(pid.id, actorState);

        log.debug(`Actor state updated: ${pid.id}`);
    }

    // 调试API
    getMessageHistory(): MessageTrace[] {
        return this.messageHistory;
    }

    getActorState(pid: PID): ActorState | undefined {
        return this.actorStates.get(pid.id);
    }

    getAllActorStates(): ActorState[] {
        return Array.from(this.actorStates.values());
    }

    addBreakpoint(type: 'message' | 'actor', value: string): void {
        const key = type === 'message' ? `msg:${value}` : `actor:${value}`;
        this.breakpoints.add(key);
        log.info(`Breakpoint added: ${key}`);
    }

    removeBreakpoint(type: 'message' | 'actor', value: string): void {
        const key = type === 'message' ? `msg:${value}` : `actor:${value}`;
        this.breakpoints.delete(key);
        log.info(`Breakpoint removed: ${key}`);
    }

    clearBreakpoints(): void {
        this.breakpoints.clear();
        log.info('All breakpoints cleared');
    }
} 