/**
 * RegExpRouter
 * 
 * A high-performance router using pre-compiled regular expressions
 * Inspired by Hono.js RegExpRouter implementation
 */

import { Route, RouteParams } from '../types';

interface CompiledRoute {
    method: string;
    pattern: string;
    regexp: RegExp;
    paramNames: string[];
    handler: Route['handler'];
}

/**
 * RegExpRouter class
 * Uses precompiled regular expressions for faster route matching
 */
export class RegExpRouter {
    private routes: CompiledRoute[] = [];
    private cache: Map<string, { route: CompiledRoute; params: RouteParams }> = new Map();
    private cacheSize: number;

    /**
     * Create a new RegExpRouter
     * @param options Configuration options
     */
    constructor(options: { cacheSize?: number } = {}) {
        this.cacheSize = options.cacheSize || 1000;
    }

    /**
     * Add a route to the router
     * @param method HTTP method
     * @param pattern URL pattern
     * @param handler Route handler
     */
    add(method: string, pattern: string, handler: Route['handler']): void {
        const compiled = this.compile(pattern);
        this.routes.push({
            method,
            pattern,
            regexp: compiled.regexp,
            paramNames: compiled.paramNames,
            handler
        });
    }

    /**
     * Compile a route pattern into a regular expression
     * @param pattern Route pattern
     * @returns Compiled route with regexp and parameter names
     */
    private compile(pattern: string): { regexp: RegExp; paramNames: string[] } {
        // Handle wildcard routes
        if (pattern === '*') {
            return {
                regexp: /^.*$/,
                paramNames: []
            };
        }

        const paramNames: string[] = [];

        // Replace parameter placeholders with regex capture groups
        let regexPattern = pattern
            .replace(/\/+/g, '/') // Normalize multiple slashes
            .replace(/:\w+\?/g, (match) => {
                // Optional parameter
                const paramName = match.slice(1, -1); // Remove : and ?
                paramNames.push(paramName);
                return '(?:/([^/]+))?';
            })
            .replace(/:\w+/g, (match) => {
                // Required parameter
                const paramName = match.slice(1); // Remove :
                paramNames.push(paramName);
                return '/([^/]+)';
            });

        // Handle wildcard parameters at the end
        if (regexPattern.endsWith('/*')) {
            regexPattern = regexPattern.slice(0, -2) + '(?:/(.*))?';
            paramNames.push('*');
        }

        // Ensure the pattern starts with /
        if (!regexPattern.startsWith('/')) {
            regexPattern = '/' + regexPattern;
        }

        // Make sure the pattern matches the entire path
        const regexp = new RegExp(`^${regexPattern}$`);

        return { regexp, paramNames };
    }

    /**
     * Find a matching route for the given method and path
     * @param method HTTP method
     * @param path URL path
     * @returns Route match with handler and params, or null if no match
     */
    match(method: string, path: string): { handler: Route['handler']; params: RouteParams } | null {
        // Check cache first
        const cacheKey = `${method}:${path}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return {
                handler: cached.route.handler,
                params: cached.params
            };
        }

        // Find matching route
        for (const route of this.routes) {
            if (route.method !== method) {
                continue;
            }

            const match = route.regexp.exec(path);
            if (!match) {
                continue;
            }

            // Extract parameters
            const params: RouteParams = {};
            for (let i = 0; i < route.paramNames.length; i++) {
                const value = match[i + 1];
                if (value) {
                    params[route.paramNames[i]] = value;
                }
            }

            // Store in cache if not full
            if (this.cache.size < this.cacheSize) {
                this.cache.set(cacheKey, { route, params });
            } else if (this.cache.size === this.cacheSize) {
                // Clear the cache when it gets full to avoid memory issues
                // A more sophisticated implementation would use LRU cache
                this.cache.clear();
            }

            return {
                handler: route.handler,
                params
            };
        }

        return null;
    }

    /**
     * Clear the route cache
     */
    clearCache(): void {
        this.cache.clear();
    }
} 