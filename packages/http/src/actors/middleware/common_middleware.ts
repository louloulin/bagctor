import { ActorContext } from '@bactor/core';
import { MiddlewareActor, MiddlewareContext, MiddlewareResult, MiddlewareProps } from './middleware_types';

/**
 * Logger Middleware
 * Logs information about incoming requests
 */
export class LoggerMiddleware extends MiddlewareActor {
    constructor(context: ActorContext, props?: MiddlewareProps) {
        super(context, { name: 'LoggerMiddleware', ...props });
    }

    protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
        const { method, url } = context.request;
        const timestamp = new Date().toISOString();

        console.log(`[LoggerMiddleware] ${timestamp} ${method} ${url}`);
        console.log(`[LoggerMiddleware] Headers:`, Object.fromEntries(context.request.headers.entries()));

        // Store the start time in state for response time calculation
        context.state.set('requestStartTime', Date.now());

        return { context, handled: false };
    }
}

/**
 * CORS Middleware
 * Adds Cross-Origin Resource Sharing headers to responses
 */
export class CorsMiddleware extends MiddlewareActor {
    private corsConfig: {
        origin: string;
        methods: string;
        headers: string;
        credentials: boolean;
    };

    constructor(context: ActorContext, props?: MiddlewareProps & {
        origin?: string;
        methods?: string;
        headers?: string;
        credentials?: boolean;
    }) {
        super(context, { name: 'CorsMiddleware', ...props });

        this.corsConfig = {
            origin: props?.origin || '*',
            methods: props?.methods || 'GET, POST, PUT, DELETE, OPTIONS',
            headers: props?.headers || 'Content-Type, Authorization',
            credentials: props?.credentials || false
        };
    }

    protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
        console.log(`[CorsMiddleware] Processing ${context.request.method} request`);

        // Handle preflight OPTIONS request
        if (context.request.method === 'OPTIONS') {
            console.log('[CorsMiddleware] Handling OPTIONS preflight request');

            const headers = new Headers({
                'Access-Control-Allow-Origin': this.corsConfig.origin,
                'Access-Control-Allow-Methods': this.corsConfig.methods,
                'Access-Control-Allow-Headers': this.corsConfig.headers
            });

            if (this.corsConfig.credentials) {
                headers.set('Access-Control-Allow-Credentials', 'true');
            }

            context.response = {
                status: 204,
                headers,
                body: null
            };

            return { context, handled: true };
        }

        // Add CORS headers to the state for normal requests
        context.state.set('cors', {
            'Access-Control-Allow-Origin': this.corsConfig.origin,
            ...(this.corsConfig.credentials ? { 'Access-Control-Allow-Credentials': 'true' } : {})
        });

        return { context, handled: false };
    }
}

/**
 * Authentication Middleware
 * Validates authorization headers and adds user information to the request
 */
export class AuthMiddleware extends MiddlewareActor {
    private authConfig: {
        authType: 'bearer' | 'basic';
        realm: string;
        validateToken: (token: string) => Promise<any | null>;
    };

    constructor(context: ActorContext, props?: MiddlewareProps & {
        authType?: 'bearer' | 'basic';
        realm?: string;
        validateToken?: (token: string) => Promise<any | null>;
    }) {
        super(context, { name: 'AuthMiddleware', ...props });

        this.authConfig = {
            authType: props?.authType || 'bearer',
            realm: props?.realm || 'Application',
            validateToken: props?.validateToken || (async (token: string) => {
                // Default implementation for demo purposes
                if (token === 'demo-token') {
                    return { id: 1, role: 'admin' };
                }
                return null;
            })
        };
    }

    protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
        console.log('[AuthMiddleware] Processing request');

        const authHeader = context.request.headers.get('Authorization');
        if (!authHeader) {
            console.log('[AuthMiddleware] No authorization header');

            context.response = {
                status: 401,
                headers: new Headers({
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': `${this.authConfig.authType === 'bearer' ? 'Bearer' : 'Basic'} realm="${this.authConfig.realm}"`
                }),
                body: JSON.stringify({ error: 'Unauthorized' })
            };

            return { context, handled: true };
        }

        try {
            let token;

            if (this.authConfig.authType === 'bearer') {
                // Extract bearer token
                if (!authHeader.startsWith('Bearer ')) {
                    throw new Error('Invalid authorization header format');
                }
                token = authHeader.slice(7);
            } else {
                // Extract basic auth token
                if (!authHeader.startsWith('Basic ')) {
                    throw new Error('Invalid authorization header format');
                }
                token = authHeader.slice(6);
            }

            console.log(`[AuthMiddleware] Validating token: ${token.substring(0, 10)}...`);

            // Validate token
            const user = await this.authConfig.validateToken(token);

            if (!user) {
                throw new Error('Invalid token');
            }

            // Add user info to context
            console.log('[AuthMiddleware] Token valid, adding user to state');
            context.state.set('user', user);

            return { context, handled: false };
        } catch (error) {
            console.error('[AuthMiddleware] Authentication error:', error);

            context.response = {
                status: 403,
                headers: new Headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ error: 'Forbidden' })
            };

            return { context, handled: true };
        }
    }
}

/**
 * Content-Type Middleware
 * Parses request body based on content-type header
 */
export class ContentTypeMiddleware extends MiddlewareActor {
    constructor(context: ActorContext, props?: MiddlewareProps) {
        super(context, { name: 'ContentTypeMiddleware', ...props });
    }

    protected async process(context: MiddlewareContext): Promise<MiddlewareResult> {
        console.log('[ContentTypeMiddleware] Processing request');

        if (!context.request.body) {
            return { context, handled: false };
        }

        const contentType = context.request.headers.get('Content-Type');
        console.log(`[ContentTypeMiddleware] Content-Type: ${contentType}`);

        try {
            let parsedBody: any = null;

            if (contentType?.includes('application/json')) {
                // Parse JSON body
                const text = await new Response(context.request.body).text();
                parsedBody = JSON.parse(text);
            }
            else if (contentType?.includes('application/x-www-form-urlencoded')) {
                // Parse form data
                const text = await new Response(context.request.body).text();
                const params = new URLSearchParams(text);
                parsedBody = Object.fromEntries(params.entries());
            }
            else if (contentType?.includes('multipart/form-data')) {
                // Parse multipart form data
                const formData = await new Response(context.request.body).formData();
                parsedBody = Object.fromEntries(formData.entries());
            }

            if (parsedBody) {
                // Store parsed body in state
                context.state.set('parsedBody', parsedBody);
                console.log(`[ContentTypeMiddleware] Body parsed successfully`);
            }
        } catch (error) {
            console.error('[ContentTypeMiddleware] Error parsing body:', error);

            context.response = {
                status: 400,
                headers: new Headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ error: 'Bad Request', message: 'Invalid request body' })
            };

            return { context, handled: true };
        }

        return { context, handled: false };
    }
} 