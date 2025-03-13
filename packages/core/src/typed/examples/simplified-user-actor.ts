import { v4 as uuidv4 } from 'uuid';
import { TypedActor } from '../actor';
import { TypedActorContext } from '../context';

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

/**
 * 简化版的类型安全用户Actor实现
 */
export class SimpleUserActor extends TypedActor<UserActorState, any> {
    constructor(context: any) {
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
    private async handleCreate(payload: any, ctx: any): Promise<void> {
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
                'user.created',
                { user }
            );
        }
    }

    /**
     * 处理获取用户请求
     */
    private async handleGet(payload: any, ctx: any): Promise<void> {
        const user = this.state.data.users[payload.id] || null;

        // 更新最后活动时间
        this.setState({
            lastActivity: new Date()
        });

        // 回复用户信息
        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'user.found',
                { user }
            );
        }
    }

    /**
     * 处理更新用户请求
     */
    private async handleUpdate(payload: any, ctx: any): Promise<void> {
        const { id, ...updates } = payload;
        const existingUser = this.state.data.users[id];

        if (!existingUser) {
            if (ctx.sender) {
                await this.context.send(
                    ctx.sender,
                    'user.error',
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
                'user.updated',
                { user: updatedUser }
            );
        }
    }

    /**
     * 处理删除用户请求
     */
    private async handleDelete(payload: any, ctx: any): Promise<void> {
        const { id } = payload;
        const existingUser = this.state.data.users[id];

        if (!existingUser) {
            if (ctx.sender) {
                await this.context.send(
                    ctx.sender,
                    'user.deleted',
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
                'user.deleted',
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
    private async handleList(_: any, ctx: any): Promise<void> {
        const users = Object.values(this.state.data.users);

        // 更新最后活动时间
        this.setState({
            lastActivity: new Date()
        });

        // 回复用户列表
        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'user.listed',
                { users }
            );
        }
    }
} 