import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

// WebSocket 状态类型
type WebSocketStatus = 'connecting' | 'open' | 'closing' | 'closed' | 'error';

// WebSocket 消息类型
interface WebSocketMessage {
    type: string;
    data: any;
}

// WebSocket 上下文类型
interface WebSocketContextType {
    status: WebSocketStatus;
    lastMessage: WebSocketMessage | null;
    sendMessage: (message: object) => void;
    connect: () => void;
    disconnect: () => void;
    reconnect: () => void;
    isConnected: boolean;
}

// 创建 WebSocket 上下文
const WebSocketContext = createContext<WebSocketContextType>({
    status: 'closed',
    lastMessage: null,
    sendMessage: () => { },
    connect: () => { },
    disconnect: () => { },
    reconnect: () => { },
    isConnected: false
});

// 最大重连尝试次数
const MAX_RECONNECT_ATTEMPTS = 5;

// WebSocket 提供者组件
export const WebSocketProvider: React.FC<{
    children: React.ReactNode;
    url: string;
    autoConnect?: boolean;
}> = ({ children, url, autoConnect = true }) => {
    const [status, setStatus] = useState<WebSocketStatus>('closed');
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

    // 使用 ref 存储 WebSocket 实例和重连尝试次数
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const urlRef = useRef(url);

    // 更新 URL 引用
    useEffect(() => {
        urlRef.current = url;
    }, [url]);

    // 清理函数
    const cleanup = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    }, []);

    // 连接 WebSocket
    const connect = useCallback(() => {
        // 清理现有连接
        cleanup();

        try {
            setStatus('connecting');
            const ws = new WebSocket(urlRef.current);
            wsRef.current = ws;

            // 设置事件处理器
            ws.onopen = () => {
                setStatus('open');
                reconnectAttemptsRef.current = 0; // 重置重连尝试次数
            };

            ws.onclose = (event) => {
                setStatus('closed');

                // 非正常关闭时尝试重连
                if (!event.wasClean && autoConnect) {
                    attemptReconnect();
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                setStatus('error');

                // 错误时尝试重连
                if (autoConnect) {
                    attemptReconnect();
                }
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    setLastMessage(message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            setStatus('error');

            // 连接失败时尝试重连
            if (autoConnect) {
                attemptReconnect();
            }
        }
    }, [cleanup, autoConnect]);

    // 尝试重连
    const attemptReconnect = useCallback(() => {
        // 超过最大尝试次数则停止
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.warn(`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached.`);
            return;
        }

        // 指数退避重连
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);

        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
    }, [connect]);

    // 断开连接
    const disconnect = useCallback(() => {
        if (wsRef.current && (status === 'open' || status === 'connecting')) {
            setStatus('closing');
            wsRef.current.close();
        }
        cleanup();
    }, [status, cleanup]);

    // 重新连接
    const reconnect = useCallback(() => {
        disconnect();
        reconnectAttemptsRef.current = 0; // 重置重连尝试次数
        connect();
    }, [disconnect, connect]);

    // 发送消息
    const sendMessage = useCallback((message: object) => {
        if (wsRef.current && status === 'open') {
            wsRef.current.send(JSON.stringify(message));
        } else {
            console.warn('Cannot send message: WebSocket is not connected');
        }
    }, [status]);

    // 初始连接
    useEffect(() => {
        if (autoConnect) {
            connect();
        }

        // 组件卸载时清理
        return () => {
            cleanup();
        };
    }, [connect, cleanup, autoConnect]);

    // 导出上下文值
    const contextValue: WebSocketContextType = {
        status,
        lastMessage,
        sendMessage,
        connect,
        disconnect,
        reconnect,
        isConnected: status === 'open'
    };

    return (
        <WebSocketContext.Provider value={contextValue}>
            {children}
        </WebSocketContext.Provider>
    );
};

// 自定义 Hook，用于在组件中访问 WebSocket 上下文
export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (context === undefined) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
};

// 订阅特定类型的消息
export const useWebSocketMessages = <T extends object>(messageType: string) => {
    const { lastMessage, status } = useWebSocket();
    const [messages, setMessages] = useState<T[]>([]);

    // 当收到新消息时更新
    useEffect(() => {
        if (lastMessage && lastMessage.type === messageType) {
            setMessages(prev => [...prev, lastMessage.data as T]);
        }
    }, [lastMessage, messageType]);

    return {
        messages,
        clearMessages: () => setMessages([]),
        isConnected: status === 'open'
    };
};

export default WebSocketContext; 