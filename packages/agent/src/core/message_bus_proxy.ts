import { PID, Message } from '@bactor/core';
import { MessageBus, EnhancedMessage, MessageFilter, MessageHandler, Priority, MessageContext, AgentContext } from '../types/message';
import { ActorSystem } from '@bactor/core';
import { v4 as uuidv4 } from 'uuid';

export class MessageBusProxy implements MessageBus {
    private pendingRequests = new Map<string, {
        resolve: (value: any) => void;
        reject: (error: any) => void;
        timeout?: ReturnType<typeof setTimeout>;
        messageType?: string;
    }>();

    constructor(private pid: PID, private system: ActorSystem) {
        console.log('[MessageBusProxy] Initializing with PID:', pid);
        // Set up response handler
        system.addMessageHandler(async (msg: Message) => {
            console.log('[MessageBusProxy] Received message:', {
                type: msg.type,
                correlationId: msg.payload?.correlationId,
                payload: msg.payload,
                sender: msg.sender
            });

            if (msg.type === 'RESPONSE' && msg.payload?.correlationId) {
                const request = this.pendingRequests.get(msg.payload.correlationId);
                if (request) {
                    console.log('[MessageBusProxy] Found pending request:', {
                        correlationId: msg.payload.correlationId,
                        messageType: request.messageType,
                        hasTimeout: !!request.timeout
                    });

                    // 先清理超时定时器
                    if (request.timeout) {
                        console.log('[MessageBusProxy] Clearing timeout for correlationId:', msg.payload.correlationId);
                        clearTimeout(request.timeout);
                    }

                    const response = msg.payload.response;
                    console.log('[MessageBusProxy] Processing response:', {
                        originalMessageType: request.messageType,
                        responseType: response?.type,
                        hasContext: !!response?.context,
                        hasMetadata: !!response?.metadata,
                        hasSubscriptionId: !!response?.subscriptionId,
                        isInvalid: !!response?.invalid,
                        fullResponse: response
                    });

                    // 验证响应格式
                    if (response && typeof response === 'object') {
                        if (request.messageType === 'SUBSCRIBE' && response.subscriptionId) {
                            console.log('[MessageBusProxy] Valid subscription response:', response.subscriptionId);
                            this.pendingRequests.delete(msg.payload.correlationId);
                            request.resolve(response);
                        } else if (request.messageType === 'PUBLISH') {
                            console.log('[MessageBusProxy] Valid publish response');
                            this.pendingRequests.delete(msg.payload.correlationId);
                            request.resolve(undefined);
                        } else if (response.type === 'RESPONSE' && response.context && response.metadata) {
                            console.log('[MessageBusProxy] Valid enhanced message response for:', request.messageType);
                            this.pendingRequests.delete(msg.payload.correlationId);
                            request.resolve(response);
                        } else if (response.invalid) {
                            console.log('[MessageBusProxy] Invalid response format received for:', request.messageType);
                            this.pendingRequests.delete(msg.payload.correlationId);
                            request.reject(new Error('Invalid response format'));
                        } else {
                            console.log('[MessageBusProxy] Unknown response format:', {
                                messageType: request.messageType,
                                response
                            });
                            this.pendingRequests.delete(msg.payload.correlationId);
                            request.reject(new Error('Unknown response format'));
                        }
                    } else {
                        console.log('[MessageBusProxy] Response is not an object:', {
                            messageType: request.messageType,
                            response
                        });
                        this.pendingRequests.delete(msg.payload.correlationId);
                        request.reject(new Error('Invalid response format'));
                    }
                } else {
                    console.log('[MessageBusProxy] No pending request found:', {
                        correlationId: msg.payload.correlationId,
                        currentPendingRequests: Array.from(this.pendingRequests.keys())
                    });
                }
            } else {
                console.log('[MessageBusProxy] Received non-response message:', {
                    type: msg.type,
                    payload: msg.payload
                });
            }
        });
    }

    private async sendRequest(message: Message, timeout: number = 5000): Promise<any> {
        const correlationId = uuidv4();
        console.log('[MessageBusProxy] Preparing to send request:', {
            type: message.type,
            correlationId,
            timeout,
            payload: message.payload
        });

        const promise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                console.log('[MessageBusProxy] Request timed out:', {
                    correlationId,
                    messageType: message.type,
                    timeout
                });
                this.pendingRequests.delete(correlationId);
                reject(new Error('Request timed out'));
            }, timeout);

            console.log('[MessageBusProxy] Setting up pending request:', {
                correlationId,
                messageType: message.type
            });

            this.pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeout: timeoutId,
                messageType: message.type
            });
        });

        const enhancedMessage = {
            ...message,
            payload: {
                ...message.payload,
                correlationId
            }
        };

        console.log('[MessageBusProxy] Sending message to actor:', {
            message: enhancedMessage,
            pendingRequestsCount: this.pendingRequests.size
        });

        try {
            await this.system.send(this.pid, enhancedMessage);
            console.log('[MessageBusProxy] Message sent successfully:', {
                correlationId,
                messageType: message.type
            });
        } catch (error) {
            console.error('[MessageBusProxy] Error sending message:', {
                correlationId,
                messageType: message.type,
                error
            });
            throw error;
        }

        return promise;
    }

    async subscribe(filter: MessageFilter, handler: MessageHandler): Promise<() => void> {
        console.log('[MessageBusProxy] Subscribing with filter:', filter);
        const response = await this.sendRequest({
            type: 'SUBSCRIBE',
            payload: { filter, handler }
        }, 5000);

        console.log('[MessageBusProxy] Subscription response:', response);
        const subscriptionId = response.subscriptionId;
        return () => {
            console.log('[MessageBusProxy] Unsubscribing with subscriptionId:', subscriptionId);
            this.system.send(this.pid, {
                type: 'UNSUBSCRIBE',
                payload: { subscriptionId }
            });
        };
    }

    async publish(message: EnhancedMessage): Promise<void> {
        console.log('[MessageBusProxy] Publishing message:', message);
        await this.sendRequest({
            type: 'PUBLISH',
            payload: { message }
        }, 5000);
        console.log('[MessageBusProxy] Message published successfully');
    }

    async request(message: EnhancedMessage, timeout: number = 5000): Promise<EnhancedMessage> {
        console.log('[MessageBusProxy] Making request:', message, 'timeout:', timeout);
        const response = await this.sendRequest({
            type: 'REQUEST',
            payload: { message }
        }, timeout);

        console.log('[MessageBusProxy] Received response:', response);
        // Ensure response is an EnhancedMessage
        if (!response.context || !response.metadata) {
            console.error('[MessageBusProxy] Invalid response format:', response);
            throw new Error('Invalid response format');
        }
        return response as EnhancedMessage;
    }

    clear(): void {
        console.log('[MessageBusProxy] Clearing all pending requests');
        // Clear all pending requests
        for (const request of this.pendingRequests.values()) {
            if (request.timeout) {
                clearTimeout(request.timeout);
            }
            request.reject(new Error('MessageBus cleared'));
        }
        this.pendingRequests.clear();

        this.system.send(this.pid, {
            type: 'CLEAR'
        });
        console.log('[MessageBusProxy] All pending requests cleared');
    }

    getStats(): { subscriptions: number; pendingRequests: number } {
        const stats = {
            subscriptions: 0,
            pendingRequests: this.pendingRequests.size
        };
        console.log('[MessageBusProxy] Current stats:', stats);
        return stats;
    }
} 