import { TypedActor } from '../actor';
import { MessageContext, PID } from '../types';
import { TypedActorContext } from '../context';
import { Actor as BaseActor } from '../../core/actor';

// 请求消息类型
export interface UserActorRequestMessages {
    'user.create': { name: string; email: string; };
    'user.get': { id: string; };
    'user.update': { id: string; name?: string; email?: string; };
    'user.delete': { id: string; };
    'user.list': void;
}

// 响应消息类型
export interface UserActorResponseMessages {
    'user.create': { user: User };
    'user.get': { user?: User; error?: string };
    'user.update': { user?: User; error?: string };
    'user.delete': { success: boolean; error?: string };
    'user.list': { users: User[] };
}

// 合并请求和响应消息类型
export type UserActorMessages = UserActorRequestMessages & UserActorResponseMessages;

export interface User {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserActorState {
    users: Map<string, User>;
}

// UserActor实现
export class UserActor extends TypedActor<UserActorState, UserActorMessages> {
    constructor(context: TypedActorContext<UserActorMessages>) {
        super(context, {
            users: new Map<string, User>()
        });
    }

    protected behaviors(): void {
        this.registerMessageHandlers();
    }

    private registerMessageHandlers(): void {
        this.on('user.create', this.handleCreate.bind(this));
        this.on('user.get', this.handleGet.bind(this));
        this.on('user.update', this.handleUpdate.bind(this));
        this.on('user.delete', this.handleDelete.bind(this));
        this.on('user.list', this.handleList.bind(this));
    }

    private async handleCreate(
        payload: UserActorRequestMessages['user.create'],
        ctx: MessageContext
    ): Promise<void> {
        const id = this.generateId();
        const now = new Date();
        const user: User = {
            id,
            name: payload.name,
            email: payload.email,
            createdAt: now,
            updatedAt: now
        };

        const state = this.getState();
        state.users.set(id, user);

        const response: UserActorResponseMessages['user.create'] = { user };
        await this.context.send(ctx.sender!, 'user.create', response);
    }

    private async handleGet(
        payload: UserActorRequestMessages['user.get'],
        ctx: MessageContext
    ): Promise<void> {
        const state = this.getState();
        const user = state.users.get(payload.id);

        const response: UserActorResponseMessages['user.get'] = user
            ? { user }
            : { error: 'User not found' };
        await this.context.send(ctx.sender!, 'user.get', response);
    }

    private async handleUpdate(
        payload: UserActorRequestMessages['user.update'],
        ctx: MessageContext
    ): Promise<void> {
        const state = this.getState();
        const user = state.users.get(payload.id);

        let response: UserActorResponseMessages['user.update'];
        if (user) {
            const updatedUser: User = {
                ...user,
                name: payload.name ?? user.name,
                email: payload.email ?? user.email,
                updatedAt: new Date()
            };
            state.users.set(payload.id, updatedUser);
            response = { user: updatedUser };
        } else {
            response = { error: 'User not found' };
        }
        await this.context.send(ctx.sender!, 'user.update', response);
    }

    private async handleDelete(
        payload: UserActorRequestMessages['user.delete'],
        ctx: MessageContext
    ): Promise<void> {
        const state = this.getState();
        const user = state.users.get(payload.id);

        const response: UserActorResponseMessages['user.delete'] = user
            ? { success: true }
            : { success: false, error: 'User not found' };

        if (user) {
            state.users.delete(payload.id);
        }

        await this.context.send(ctx.sender!, 'user.delete', response);
    }

    private async handleList(
        _: UserActorRequestMessages['user.list'],
        ctx: MessageContext
    ): Promise<void> {
        const state = this.getState();
        const users = Array.from(state.users.values());
        const response: UserActorResponseMessages['user.list'] = { users };
        await this.context.send(ctx.sender!, 'user.list', response);
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
}

// 注释掉实现示例，避免编译错误
/* 
import { ActorSystem } from '../../core/system';
import { TypedActor } from '../actor';
import { MessageContext, PID } from '../types';
import { TypedActorContext } from '../context';

// UserActor实现
class UserActorImpl extends TypedActor<UserActorState, UserActorMessages> {
    constructor(context: TypedActorContext<UserActorMessages>) {
        super(context, {
            users: new Map<string, User>()
        });
    }

    protected behaviors(): void {
        this.registerMessageHandlers();
    }

    private registerMessageHandlers(): void {
        // 处理消息...
    }

    private async handleCreate(
        payload: { name: string; email: string; },
        ctx: MessageContext
    ): Promise<void> {
        // 创建用户处理逻辑...
    }

    private async handleGet(
        payload: { id: string; },
        ctx: MessageContext
    ): Promise<void> {
        // 获取用户处理逻辑...
    }

    private async handleUpdate(
        payload: { id: string; name?: string; email?: string; },
        ctx: MessageContext
    ): Promise<void> {
        // 更新用户处理逻辑...
    }

    private async handleDelete(
        payload: { id: string; },
        ctx: MessageContext
    ): Promise<void> {
        // 删除用户处理逻辑...
    }

    private async handleList(
        _: void,
        ctx: MessageContext
    ): Promise<void> {
        // 列出用户处理逻辑...
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }
}

// 使用示例
async function runExample() {
    // 创建Actor系统和示例用户管理逻辑
}
*/