import { describe, expect, test } from 'bun:test';
import { RegExpRouter } from '../../src/routing/regexp_router';

describe('RegExpRouter', () => {
    test('should match static routes', () => {
        const router = new RegExpRouter();

        const handler = () => ({ status: 200, headers: new Headers(), body: null });
        router.add('GET', '/hello', handler);

        const match = router.match('GET', '/hello');
        expect(match).not.toBe(null);
        expect(match?.handler).toBe(handler);
        expect(Object.keys(match?.params || {}).length).toBe(0);

        const noMatch = router.match('GET', '/world');
        expect(noMatch).toBe(null);
    });

    test('should match routes with path parameters', () => {
        const router = new RegExpRouter();

        const handler = () => ({ status: 200, headers: new Headers(), body: null });
        router.add('GET', '/users/:id', handler);

        const match = router.match('GET', '/users/123');
        expect(match).not.toBe(null);
        expect(match?.handler).toBe(handler);
        expect(match?.params.id).toBe('123');

        const noMatch = router.match('GET', '/users');
        expect(noMatch).toBe(null);
    });

    test('should match routes with optional parameters', () => {
        const router = new RegExpRouter();

        const handler = () => ({ status: 200, headers: new Headers(), body: null });
        router.add('GET', '/users/:id?', handler);

        const matchWithParam = router.match('GET', '/users/123');
        expect(matchWithParam).not.toBe(null);
        expect(matchWithParam?.params.id).toBe('123');

        const matchWithoutParam = router.match('GET', '/users');
        expect(matchWithoutParam).not.toBe(null);
        expect(matchWithoutParam?.params.id).toBeUndefined();
    });

    test('should match wildcard routes', () => {
        const router = new RegExpRouter();

        const handler = () => ({ status: 200, headers: new Headers(), body: null });
        router.add('GET', '/files/*', handler);

        const match = router.match('GET', '/files/images/photo.jpg');
        expect(match).not.toBe(null);
        expect(match?.params['*']).toBe('images/photo.jpg');

        const matchRoot = router.match('GET', '/files');
        expect(matchRoot).toBe(null);
    });

    test('should match full wildcard routes', () => {
        const router = new RegExpRouter();

        const handler = () => ({ status: 200, headers: new Headers(), body: null });
        router.add('GET', '*', handler);

        const match1 = router.match('GET', '/anything');
        expect(match1).not.toBe(null);

        const match2 = router.match('GET', '/users/123');
        expect(match2).not.toBe(null);
    });

    test('should respect HTTP method', () => {
        const router = new RegExpRouter();

        const getHandler = () => ({ status: 200, headers: new Headers(), body: 'GET' });
        const postHandler = () => ({ status: 200, headers: new Headers(), body: 'POST' });

        router.add('GET', '/api', getHandler);
        router.add('POST', '/api', postHandler);

        const getMatch = router.match('GET', '/api');
        expect(getMatch?.handler).toBe(getHandler);

        const postMatch = router.match('POST', '/api');
        expect(postMatch?.handler).toBe(postHandler);

        const noMatch = router.match('PUT', '/api');
        expect(noMatch).toBe(null);
    });

    test('should use cache for repeated matches', () => {
        const router = new RegExpRouter({ cacheSize: 10 });

        const handler = () => ({ status: 200, headers: new Headers(), body: null });
        router.add('GET', '/users/:id', handler);

        // First match (not cached)
        const match1 = router.match('GET', '/users/123');
        expect(match1?.params.id).toBe('123');

        // Second match (should use cache)
        const match2 = router.match('GET', '/users/123');
        expect(match2?.params.id).toBe('123');

        // Access private cache property for testing
        const cache = (router as any).cache;
        expect(cache.has('GET:/users/123')).toBe(true);

        // Clear cache
        router.clearCache();
        expect(cache.size).toBe(0);
    });
}); 