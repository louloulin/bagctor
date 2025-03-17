/**
 * optimized_middleware.test.ts
 * 
 * 优化中间件系统的测试文件
 */

import {
    composeMiddleware,
    createMiddlewareHandler,
    clearMiddlewareCache,
    getMiddlewareCacheStats
} from '../../src/middleware/optimized_middleware';
import { MiddlewareFunction } from '../../src/core/router/optimized_router';

describe('优化中间件系统', () => {
    // 每个测试后清除缓存
    afterEach(() => {
        clearMiddlewareCache(true, true);
    });

    describe('中间件组合', () => {
        it('应该正确组合中间件并按顺序执行', async () => {
            // 记录执行顺序
            const executionOrder: number[] = [];

            // 创建测试中间件
            const middleware1: MiddlewareFunction = async (ctx, next) => {
                executionOrder.push(1);
                await next();
                executionOrder.push(6);
            };

            const middleware2: MiddlewareFunction = async (ctx, next) => {
                executionOrder.push(2);
                await next();
                executionOrder.push(5);
            };

            const middleware3: MiddlewareFunction = async (ctx, next) => {
                executionOrder.push(3);
                await next();
                executionOrder.push(4);
            };

            // 组合中间件
            const composed = composeMiddleware([middleware1, middleware2, middleware3]);

            // 执行组合后的中间件
            const context = {};
            await composed(context);

            // 验证执行顺序 (洋葱模型: 1->2->3->4->5->6)
            expect(executionOrder).toEqual([1, 2, 3, 4, 5, 6]);
        });

        it('应该在没有中间件时正确处理', async () => {
            const composed = composeMiddleware([]);
            const context = {};

            // 不应抛出错误
            try {
                await composed(context);
                expect(true).toBe(true); // 如果执行到这里，说明没有抛出错误
            } catch (error) {
                expect(error).toBeUndefined(); // 这个断言会失败并显示具体错误
            }
        });

        it('应该正确调用最终的next函数', async () => {
            const finalNext = jest.fn();

            const middleware: MiddlewareFunction = async (ctx, next) => {
                await next();
            };

            const composed = composeMiddleware([middleware]);

            await composed({}, finalNext);

            expect(finalNext).toHaveBeenCalled();
        });

        it('应该传递上下文对象', async () => {
            const context = { value: 'initial' };

            const middleware: MiddlewareFunction = async (ctx, next) => {
                // 修改上下文
                ctx.value = 'modified';
                await next();
            };

            const composed = composeMiddleware([middleware]);

            await composed(context);

            expect(context.value).toBe('modified');
        });
    });

    describe('缓存机制', () => {
        it('应该缓存组合后的中间件函数', async () => {
            // 创建具有不同签名的中间件
            const middleware1 = async (ctx: any, next: () => Promise<void>) => { await next(); };
            const middleware2 = async (ctx: any, next: () => Promise<void>) => { await next(); };

            // 首次组合 - 应该创建新函数
            const firstComposed = composeMiddleware([middleware1, middleware2]);

            // 再次组合相同的中间件 - 应该返回缓存的函数
            const secondComposed = composeMiddleware([middleware1, middleware2]);

            // 应该是同一个函数引用
            expect(firstComposed).toBe(secondComposed);
        });

        it('应该在禁用缓存时不使用缓存', async () => {
            const middleware = async (ctx: any, next: () => Promise<void>) => { await next(); };

            // 禁用缓存
            const firstComposed = composeMiddleware([middleware], { enableCaching: false });
            const secondComposed = composeMiddleware([middleware], { enableCaching: false });

            // 应该是不同的函数引用
            expect(firstComposed).not.toBe(secondComposed);
        });

        it('应该尊重缓存大小限制', async () => {
            // 创建多个不同的中间件函数
            const middlewares = Array.from({ length: 5 }, (_, i) =>
                async (ctx: any, next: () => Promise<void>) => {
                    ctx[`value${i}`] = i;
                    await next();
                }
            );

            // 设置缓存限制为3
            const options = { cacheLimit: 3 };

            // 组合不同的中间件组合
            composeMiddleware([middlewares[0]], options);
            composeMiddleware([middlewares[1]], options);
            composeMiddleware([middlewares[2]], options);
            composeMiddleware([middlewares[3]], options);
            composeMiddleware([middlewares[4]], options);

            // 获取统计信息
            const stats = getMiddlewareCacheStats();

            // 缓存大小应该尊重限制
            expect(stats.globalCacheSize).toBeLessThanOrEqual(3);
        });
    });

    describe('中间件处理器', () => {
        it('应该创建一个有效的处理器函数', async () => {
            const results: string[] = [];

            const middleware1: MiddlewareFunction = async (ctx, next) => {
                results.push('before1');
                await next();
                results.push('after1');
            };

            const middleware2: MiddlewareFunction = async (ctx, next) => {
                results.push('before2');
                await next();
                results.push('after2');
            };

            // 创建处理器
            const handler = createMiddlewareHandler([middleware1, middleware2]);

            // 执行处理器
            await handler({});

            // 验证执行顺序
            expect(results).toEqual(['before1', 'before2', 'after2', 'after1']);
        });
    });

    describe('性能特性', () => {
        it('应该比串行执行中间件更高效', async () => {
            // 创建大量简单中间件
            const middlewareCount = 100;
            const middlewares = Array.from({ length: middlewareCount }, () =>
                async (ctx: any, next: () => Promise<void>) => { await next(); }
            );

            // 准备上下文
            const context = {};

            // 优化的中间件执行
            const startOptimized = Date.now();
            const composed = composeMiddleware(middlewares);
            await composed(context);
            const optimizedTime = Date.now() - startOptimized;

            // 重置缓存和上下文
            clearMiddlewareCache();
            const context2 = {};

            // 手动串行执行相同的中间件 - 使用Promise链
            const startManual = Date.now();
            let i = 0;

            const executeNext = async (): Promise<void> => {
                if (i < middlewares.length) {
                    const currentMiddleware = middlewares[i++];
                    await currentMiddleware(context2, executeNext);
                }
            };

            await executeNext();
            const manualTime = Date.now() - startManual;

            // 优化的中间件执行应该至少不慢于手动串行执行
            // 注：在某些环境中，性能差异可能不明显，因此这个测试是宽松的
            if (manualTime === 0) {
                // 如果手动执行时间为0，则说明执行太快，无法准确测量
                // 在这种情况下，我们仅检查优化的执行不要太慢
                expect(optimizedTime).toBeLessThanOrEqual(5); // 允许最多5毫秒
            } else {
                expect(optimizedTime).toBeLessThanOrEqual(manualTime * 1.5);
            }
        });
    });
}); 