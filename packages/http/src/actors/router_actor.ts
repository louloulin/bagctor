import { Actor, ActorContext } from '@bactor/core';
import { HttpRequest, HttpResponse, Route, RouteParams, HttpContext, HttpHandler } from '../types';

export interface RouteConfig {
    method: string;
    pattern: string;
    handler: HttpHandler;
}

export interface RouteGroupConfig {
    prefix: string;
    routes: RouteConfig[];
}

/**
 * Router Actor
 * Handles routing of HTTP requests to the appropriate handler
 */
export class RouterActor extends Actor {
    private routes: Route[] = [];

    constructor(context: ActorContext) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            console.log(`[RouterActor] Received message: ${msg.type}`);

            if (msg.type === 'router.addRoute') {
                const routeConfig = msg.payload as RouteConfig;
                this.addRoute(routeConfig.method, routeConfig.pattern, routeConfig.handler);
                console.log(`[RouterActor] Added route: ${routeConfig.method} ${routeConfig.pattern}`);
            }
            else if (msg.type === 'router.addRouteGroup') {
                const groupConfig = msg.payload as RouteGroupConfig;
                this.addRouteGroup(groupConfig);
                console.log(`[RouterActor] Added route group with prefix: ${groupConfig.prefix}`);
            }
            else if (msg.type === 'router.handle') {
                const request = msg.payload as HttpRequest;
                const response = await this.handleRequest(request);

                if (msg.sender) {
                    await this.context.send(msg.sender, {
                        type: 'router.response',
                        payload: response,
                        sender: this.context.self
                    });
                }
            }
        });
    }

    /**
     * Add a route to the router
     * @param method HTTP method
     * @param pattern URL pattern
     * @param handler Handler function
     */
    private addRoute(method: string, pattern: string, handler: HttpHandler): void {
        this.routes.push({ method, pattern, handler });
    }

    /**
     * Add a group of routes with a common prefix
     * @param groupConfig Route group configuration
     */
    private addRouteGroup(groupConfig: RouteGroupConfig): void {
        const { prefix, routes } = groupConfig;

        // Normalize prefix to ensure it starts with / and doesn't end with /
        const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
        const cleanPrefix = normalizedPrefix.endsWith('/')
            ? normalizedPrefix.slice(0, -1)
            : normalizedPrefix;

        // Add each route with the prefix
        for (const route of routes) {
            // Normalize pattern to ensure it starts with /
            const normalizedPattern = route.pattern.startsWith('/')
                ? route.pattern
                : `/${route.pattern}`;

            // Combine prefix with pattern
            const fullPattern = `${cleanPrefix}${normalizedPattern}`;

            this.addRoute(route.method, fullPattern, route.handler);
            console.log(`[RouterActor] Added route in group: ${route.method} ${fullPattern}`);
        }
    }

    /**
     * Match a route based on the path and pattern
     * @param path URL path
     * @param pattern Route pattern
     * @returns Parameters object or null if no match
     */
    private matchRoute(path: string, pattern: string): RouteParams | null {
        const pathParts = path.split('/').filter(Boolean);
        const patternParts = pattern.split('/').filter(Boolean);

        // Quick check for wildcard pattern
        if (pattern === '*') {
            return {};
        }

        // Check if pattern ends with wildcard
        if (patternParts.length > 0 && patternParts[patternParts.length - 1] === '*') {
            // Remove the wildcard from pattern parts for comparison
            const patternWithoutWildcard = patternParts.slice(0, -1);

            // If path doesn't have at least as many parts as the pattern (minus wildcard), no match
            if (pathParts.length < patternWithoutWildcard.length) {
                return null;
            }

            const params: RouteParams = {};

            // Match the non-wildcard parts
            for (let i = 0; i < patternWithoutWildcard.length; i++) {
                const patternPart = patternWithoutWildcard[i];
                const pathPart = pathParts[i];

                if (patternPart.startsWith(':')) {
                    params[patternPart.slice(1)] = pathPart;
                } else if (patternPart !== pathPart) {
                    return null;
                }
            }

            // Add any remaining path parts as a wildcard parameter
            if (pathParts.length > patternWithoutWildcard.length) {
                params['*'] = pathParts.slice(patternWithoutWildcard.length).join('/');
            }

            return params;
        }

        // Handle optional parameters (marked with ?)
        let optionalCount = 0;
        const requiredPatternParts = patternParts.filter(part => {
            if (part.endsWith('?')) {
                optionalCount++;
                return false;
            }
            return true;
        });

        // Path must have at least as many parts as required pattern parts
        if (pathParts.length < requiredPatternParts.length) {
            return null;
        }

        // Path can have at most as many parts as total pattern parts
        if (pathParts.length > patternParts.length) {
            return null;
        }

        const params: RouteParams = {};

        // Match each part
        for (let i = 0; i < pathParts.length; i++) {
            const patternPart = patternParts[i];
            const pathPart = pathParts[i];

            // Handle optional parameter
            if (patternPart.endsWith('?')) {
                const paramName = patternPart.slice(1, -1); // Remove : and ?
                params[paramName] = pathPart;
            }
            // Handle regular parameter
            else if (patternPart.startsWith(':')) {
                const paramName = patternPart.slice(1);
                params[paramName] = pathPart;
            }
            // Handle literal part
            else if (patternPart !== pathPart) {
                return null;
            }
        }

        // Handle missing optional parameters
        for (let i = pathParts.length; i < patternParts.length; i++) {
            const patternPart = patternParts[i];
            if (patternPart.endsWith('?')) {
                const paramName = patternPart.slice(1, -1); // Remove : and ?
                params[paramName] = undefined;
            } else {
                // If we have a required parameter that's missing, no match
                return null;
            }
        }

        return params;
    }

    /**
     * Handle an HTTP request
     * @param request HTTP request
     * @returns HTTP response
     */
    async handleRequest(request: HttpRequest): Promise<HttpResponse> {
        console.log(`[RouterActor] Handling request: ${request.method} ${request.url}`);

        // Parse query parameters
        const url = new URL(request.url, 'http://localhost');
        const searchParams = url.searchParams;

        // Find a matching route
        for (const route of this.routes) {
            if (route.method !== request.method) {
                continue;
            }

            const params = this.matchRoute(url.pathname, route.pattern);
            if (params === null) {
                continue;
            }

            console.log(`[RouterActor] Found matching route: ${route.method} ${route.pattern}`);

            // Create context object
            const context: HttpContext = {
                request,
                params,
                query: searchParams,
                state: request.state || new Map(),
                actorContext: this.context
            };

            try {
                // Call the handler
                const response = await route.handler(context);
                console.log(`[RouterActor] Handler response: ${response.status}`);
                return response;
            } catch (error) {
                console.error('[RouterActor] Error in route handler:', error);
                return {
                    status: 500,
                    headers: new Headers({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ error: 'Internal Server Error' })
                };
            }
        }

        // No matching route found
        console.log('[RouterActor] No matching route found');
        return {
            status: 404,
            headers: new Headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ error: 'Not Found' })
        };
    }
} 