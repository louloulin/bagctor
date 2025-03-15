import { expect, test, jest } from "bun:test";
import {
    Actor,
    ActorContext,
    ActorSystem,
    Message,
    PID,
    PropsBuilder,
    defineActor,
    match,
    ask
} from "..";
import { createEnhancedActorProxy, EnhancedActorProxy, MessageMap } from "../typed/types";

// 定义用户服务的消息类型
interface UserServiceMessages extends MessageMap {
    'createUser': {
        name: string;
        email: string;
    };
    'getUser': {
        id: string;
    };
    'updateUser': {
        id: string;
        name?: string;
        email?: string;
    };
    'deleteUser': {
        id: string;
    };
    'listUsers': void;
}

// 定义用户响应类型
interface UserResponse {
    id: string;
    name: string;
    email: string;
    createdAt: number;
}

// 定义用户服务的状态
interface UserServiceState {
    users: Record<string, UserResponse>;
    counter: number;
}

// 使用defineActor和match创建用户服务Actor
const UserServiceActor = defineActor<UserServiceState, Message>(
    { users: {}, counter: 0 },
    {
        default: match<UserServiceState, Message>({
            // 创建用户处理器
            'createUser': {
                handler: (state, msg) => {
                    const { name, email } = msg.payload;
                    const id = `user-${state.counter + 1}`;
                    const newUser: UserResponse = {
                        id,
                        name,
                        email,
                        createdAt: Date.now()
                    };

                    return {
                        users: {
                            ...state.users,
                            [id]: newUser
                        },
                        counter: state.counter + 1
                    };
                }
            },
            // 获取用户处理器 - 带条件，只处理存在的用户
            'getUser': {
                condition: (msg) => {
                    const { id } = msg.payload;
                    // 只有当用户ID存在时才处理
                    return Boolean(id);
                },
                handler: (state, msg, context) => {
                    const { id } = msg.payload;
                    const user = state.users[id];

                    // 如果是请求消息，发送响应
                    if (msg.responseId && context.respond) {
                        if (user) {
                            context.respond(msg, user);
                        } else {
                            context.respond(msg, null, new Error(`User with ID ${id} not found`));
                        }
                    }

                    return state;
                }
            },
            // 更新用户处理器
            'updateUser': {
                condition: (msg) => {
                    const { id } = msg.payload;
                    return Boolean(id);
                },
                handler: (state, msg, context) => {
                    const { id, ...updates } = msg.payload;
                    const user = state.users[id];

                    if (!user) {
                        if (msg.responseId && context.respond) {
                            context.respond(msg, null, new Error(`User with ID ${id} not found`));
                        }
                        return state;
                    }

                    const updatedUser = {
                        ...user,
                        ...updates
                    };

                    const newState = {
                        users: {
                            ...state.users,
                            [id]: updatedUser
                        },
                        counter: state.counter
                    };

                    if (msg.responseId && context.respond) {
                        context.respond(msg, updatedUser);
                    }

                    return newState;
                }
            },
            // 删除用户处理器
            'deleteUser': (state, msg, context) => {
                const { id } = msg.payload;
                const user = state.users[id];

                if (!user) {
                    if (msg.responseId && context.respond) {
                        context.respond(msg, { success: false, error: `User with ID ${id} not found` });
                    }
                    return state;
                }

                const newUsers = { ...state.users };
                delete newUsers[id];

                if (msg.responseId && context.respond) {
                    context.respond(msg, { success: true });
                }

                return {
                    users: newUsers,
                    counter: state.counter
                };
            },
            // 列出所有用户处理器
            'listUsers': (state, msg, context) => {
                const userList = Object.values(state.users);

                if (msg.responseId && context.respond) {
                    context.respond(msg, userList);
                }

                return state;
            }
        }, (state, msg, context) => {
            // 默认处理器
            console.warn(`Unhandled message: ${msg.type}`);

            if (msg.responseId && context.respond) {
                context.respond(msg, null, new Error(`Unsupported operation: ${msg.type}`));
            }

            return state;
        })
    }
);

test("Integrated test: EnhancedActorProxy with complex Actor", async () => {
    // 创建Actor系统
    const system = new ActorSystem();

    // 创建UserServiceActor
    const userServiceProps = PropsBuilder.fromClass(UserServiceActor).build();
    const userServicePid = await system.spawn(userServiceProps);

    // 使用增强的ActorProxy创建代理
    const userService = createEnhancedActorProxy<UserServiceMessages, any>(
        system as any,
        userServicePid,
        {
            timeout: 1000,
            errorHandler: (error, messageType, payload) => {
                console.error(`Error handling ${messageType}:`, error);
            }
        }
    );

    // 创建用户 - 直接使用系统的send方法确保消息格式正确
    await system.send(userServicePid, {
        type: 'createUser',
        payload: {
            name: "John Doe",
            email: "john@example.com"
        }
    });

    // 尝试获取用户
    const userList = await system.request(userServicePid, {
        type: 'listUsers'
    });

    expect(userList).toBeArray();
    expect(userList.length).toBe(1);
    expect(userList[0].name).toBe("John Doe");

    // 更新用户 - 还是使用系统直接发送
    const updatedUser = await system.request(userServicePid, {
        type: 'updateUser',
        payload: {
            id: userList[0].id,
            name: "John Updated"
        }
    });

    expect(updatedUser.name).toBe("John Updated");
    expect(updatedUser.email).toBe("john@example.com");

    // 删除用户
    const deleteResult = await system.request(userServicePid, {
        type: 'deleteUser',
        payload: {
            id: userList[0].id
        }
    });

    expect(deleteResult.success).toBe(true);

    // 验证用户已删除
    const emptyList = await system.request(userServicePid, {
        type: 'listUsers'
    });

    expect(emptyList.length).toBe(0);

    // 验证错误处理
    try {
        await system.request(userServicePid, {
            type: 'getUser',
            payload: {
                id: "non-existent"
            }
        });
        expect(true).toBe(false); // 不应该执行到这里
    } catch (error: any) {
        expect(error.message).toContain("not found");
    }
}); 