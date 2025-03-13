import { v4 as uuidv4 } from 'uuid';
import {
    TypedActor,
    MessageMap,
    ActorContext,
    MessageContext,
    PID
} from '../index';

// 定义用户类型
interface User {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
}

// 定义用户Actor状态
interface UserActorState {
    users: Record<string, User>;
    lastActivity: Date;
}

// 定义用户Actor可处理的消息类型
interface UserActorMessages extends MessageMap {
    'user.create': {
        name: string;
        email: string;
    };
    'user.get': {
        id: string;
    };
    'user.update': {
        id: string;
        name?: string;
        email?: string;
    };
    'user.delete': {
        id: string;
    };
    'user.list': void;
}

// 定义用户Actor响应的消息类型
interface UserActorResponses extends MessageMap {
    'user.created': {
        user: User;
    };
    'user.found': {
        user: User | null;
    };
    'user.updated': {
        user: User;
    };
    'user.deleted': {
        id: string;
        success: boolean;
    };
    'user.listed': {
        users: User[];
    };
    'user.error': {
        message: string;
        code: string;
    };
}

/**
 * 类型安全的用户Actor实现
 */
export class UserActor extends TypedActor<UserActorState, UserActorMessages> {
    constructor(context: ActorContext<UserActorMessages>) {
        super(context, {
            users: {},
            lastActivity: new Date()
        });
    }

    /**
     * 注册消息处理函数
     */
    protected behaviors(): void {
        this.on('user.create', this.handleCreate.bind(this))
            .on('user.get', this.handleGet.bind(this))
            .on('user.update', this.handleUpdate.bind(this))
            .on('user.delete', this.handleDelete.bind(this))
            .on('user.list', this.handleList.bind(this));
    }

    /**
     * 处理用户创建请求
     */
    private async handleCreate(
        payload: UserActorMessages['user.create'],
        ctx: MessageContext
    ): Promise<void> {
        const id = uuidv4();
        const now = new Date();

        const user: User = {
            id,
            name: payload.name,
            email: payload.email,
            createdAt: now,
            updatedAt: now
        };

        // 更新状态
        this.setState({
            users: { ...this.state.data.users, [id]: user },
            lastActivity: now
        });

        // 回复创建成功消息
        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'user.created' as any,
                { user }
            );
        }
    }

    /**
     * 处理获取用户请求
     */
    private async handleGet(
        payload: UserActorMessages['user.get'],
        ctx: MessageContext
    ): Promise<void> {
        const user = this.state.data.users[payload.id] || null;

        // 更新最后活动时间
        this.setState({
            lastActivity: new Date()
        });

        // 回复用户信息
        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'user.found' as any,
                { user }
            );
        }
    }

    /**
     * 处理更新用户请求
     */
    private async handleUpdate(
        payload: UserActorMessages['user.update'],
        ctx: MessageContext
    ): Promise<void> {
        const { id, ...updates } = payload;
        const existingUser = this.state.data.users[id];

        if (!existingUser) {
            if (ctx.sender) {
                await this.context.send(
                    ctx.sender,
                    'user.error' as any,
                    {
                        message: `User with id ${id} not found`,
                        code: 'USER_NOT_FOUND'
                    }
                );
            }
            return;
        }

        const now = new Date();
        const updatedUser: User = {
            ...existingUser,
            ...updates,
            updatedAt: now
        };

        // 更新状态
        const updatedUsers = { ...this.state.data.users };
        updatedUsers[id] = updatedUser;

        this.setState({
            users: updatedUsers,
            lastActivity: now
        });

        // 回复更新成功消息
        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'user.updated' as any,
                { user: updatedUser }
            );
        }
    }

    /**
     * 处理删除用户请求
     */
    private async handleDelete(
        payload: UserActorMessages['user.delete'],
        ctx: MessageContext
    ): Promise<void> {
        const { id } = payload;
        const existingUser = this.state.data.users[id];

        if (!existingUser) {
            if (ctx.sender) {
                await this.context.send(
                    ctx.sender,
                    'user.deleted' as any,
                    {
                        id,
                        success: false
                    }
                );
            }
            return;
        }

        // 更新状态
        const updatedUsers = { ...this.state.data.users };
        delete updatedUsers[id];

        this.setState({
            users: updatedUsers,
            lastActivity: new Date()
        });

        // 回复删除成功消息
        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'user.deleted' as any,
                {
                    id,
                    success: true
                }
            );
        }
    }

    /**
     * 处理获取用户列表请求
     */
    private async handleList(
        _: void,
        ctx: MessageContext
    ): Promise<void> {
        const users = Object.values(this.state.data.users);

        // 更新最后活动时间
        this.setState({
            lastActivity: new Date()
        });

        // 回复用户列表
        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'user.listed' as any,
                { users }
            );
        }
    }
} 