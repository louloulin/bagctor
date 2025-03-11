declare module 'bun:test' {
    export function describe(name: string, fn: () => void): void;
    export function test(name: string, fn: () => void | Promise<void>): void;
    export function expect<T>(value: T): {
        toBe(expected: any): void;
        toEqual(expected: any): void;
        toMatch(pattern: RegExp | string): void;
        toMatchObject(object: any): void;
        toContain(item: any): void;
        toBeDefined(): void;
        toBeUndefined(): void;
        toBeNull(): void;
        toBeTruthy(): void;
        toBeFalsy(): void;
        toBeGreaterThan(expected: number): void;
        toBeGreaterThanOrEqual(expected: number): void;
        toBeLessThan(expected: number): void;
        toBeLessThanOrEqual(expected: number): void;
        toBeInstanceOf(expected: any): void;
        toThrow(expected?: string | RegExp | Error): void;
        resolves: any;
        rejects: any;
    };
    export function beforeAll(fn: () => void | Promise<void>): void;
    export function afterAll(fn: () => void | Promise<void>): void;
    export function beforeEach(fn: () => void | Promise<void>): void;
    export function afterEach(fn: () => void | Promise<void>): void;
} 