import { describe, test, expect } from 'bun:test';
import { LockFreeMap } from '../../core/concurrent/lock-free-map';
import { ConcurrentSet } from '../../core/concurrent/concurrent-set';
import { AtomicReference } from '../../core/concurrent/atomic-reference';

describe('并发数据结构性能测试', () => {
    const ITERATIONS = 100000;
    const MEDIUM_ITERATIONS = 10000;

    test('LockFreeMap vs. Map 基本操作性能', () => {
        const lockFreeMap = new LockFreeMap<string, number>();
        const standardMap = new Map<string, number>();

        console.log('测试 Map 结构 - 写入性能:');

        // LockFreeMap 写入测试
        const lfmWriteStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            lockFreeMap.set(`key${i}`, i);
        }
        const lfmWriteEnd = performance.now();
        const lfmWriteTime = lfmWriteEnd - lfmWriteStart;
        console.log(`  LockFreeMap 写入 ${ITERATIONS} 项: ${lfmWriteTime.toFixed(2)}ms (${Math.floor(ITERATIONS / (lfmWriteTime / 1000))} ops/sec)`);

        // 标准 Map 写入测试
        const mapWriteStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            standardMap.set(`key${i}`, i);
        }
        const mapWriteEnd = performance.now();
        const mapWriteTime = mapWriteEnd - mapWriteStart;
        console.log(`  标准 Map 写入 ${ITERATIONS} 项: ${mapWriteTime.toFixed(2)}ms (${Math.floor(ITERATIONS / (mapWriteTime / 1000))} ops/sec)`);

        console.log('\n测试 Map 结构 - 读取性能:');

        // LockFreeMap 读取测试
        const lfmReadStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            const value = lockFreeMap.get(`key${i}`);
            expect(value).toBe(i);
        }
        const lfmReadEnd = performance.now();
        const lfmReadTime = lfmReadEnd - lfmReadStart;
        console.log(`  LockFreeMap 读取 ${ITERATIONS} 项: ${lfmReadTime.toFixed(2)}ms (${Math.floor(ITERATIONS / (lfmReadTime / 1000))} ops/sec)`);

        // 标准 Map 读取测试
        const mapReadStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            const value = standardMap.get(`key${i}`);
            expect(value).toBe(i);
        }
        const mapReadEnd = performance.now();
        const mapReadTime = mapReadEnd - mapReadStart;
        console.log(`  标准 Map 读取 ${ITERATIONS} 项: ${mapReadTime.toFixed(2)}ms (${Math.floor(ITERATIONS / (mapReadTime / 1000))} ops/sec)`);

        // 打印LockFreeMap的统计信息
        console.log('\nLockFreeMap 统计信息:');
        console.log(JSON.stringify(lockFreeMap.getStats(), null, 2));
    });

    test('ConcurrentSet vs. Set 基本操作性能', () => {
        const concurrentSet = new ConcurrentSet<string>();
        const standardSet = new Set<string>();

        console.log('测试 Set 结构 - 写入性能:');

        // ConcurrentSet 写入测试
        const csWriteStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            concurrentSet.add(`item${i}`);
        }
        const csWriteEnd = performance.now();
        const csWriteTime = csWriteEnd - csWriteStart;
        console.log(`  ConcurrentSet 写入 ${ITERATIONS} 项: ${csWriteTime.toFixed(2)}ms (${Math.floor(ITERATIONS / (csWriteTime / 1000))} ops/sec)`);

        // 标准 Set 写入测试
        const setWriteStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            standardSet.add(`item${i}`);
        }
        const setWriteEnd = performance.now();
        const setWriteTime = setWriteEnd - setWriteStart;
        console.log(`  标准 Set 写入 ${ITERATIONS} 项: ${setWriteTime.toFixed(2)}ms (${Math.floor(ITERATIONS / (setWriteTime / 1000))} ops/sec)`);

        console.log('\n测试 Set 结构 - 包含性能:');

        // ConcurrentSet 包含测试
        const csContainsStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            const contains = concurrentSet.has(`item${i}`);
            expect(contains).toBe(true);
        }
        const csContainsEnd = performance.now();
        const csContainsTime = csContainsEnd - csContainsStart;
        console.log(`  ConcurrentSet 检查 ${ITERATIONS} 项: ${csContainsTime.toFixed(2)}ms (${Math.floor(ITERATIONS / (csContainsTime / 1000))} ops/sec)`);

        // 标准 Set 包含测试
        const setContainsStart = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            const contains = standardSet.has(`item${i}`);
            expect(contains).toBe(true);
        }
        const setContainsEnd = performance.now();
        const setContainsTime = setContainsEnd - setContainsStart;
        console.log(`  标准 Set 检查 ${ITERATIONS} 项: ${setContainsTime.toFixed(2)}ms (${Math.floor(ITERATIONS / (setContainsTime / 1000))} ops/sec)`);

        // 打印ConcurrentSet的统计信息
        console.log('\nConcurrentSet 统计信息:');
        console.log(JSON.stringify(concurrentSet.getStats(), null, 2));
    });

    test('AtomicReference 与普通对象更新对比', () => {
        console.log('测试 AtomicReference vs. 普通对象更新:');

        const atomicRef = new AtomicReference<number>(0);
        let plainValue = 0;

        // AtomicReference 更新测试
        const atomicUpdateStart = performance.now();
        for (let i = 0; i < MEDIUM_ITERATIONS; i++) {
            atomicRef.updateAndGet(val => val + 1);
        }
        const atomicUpdateEnd = performance.now();
        const atomicUpdateTime = atomicUpdateEnd - atomicUpdateStart;
        console.log(`  AtomicReference 更新 ${MEDIUM_ITERATIONS} 次: ${atomicUpdateTime.toFixed(2)}ms (${Math.floor(MEDIUM_ITERATIONS / (atomicUpdateTime / 1000))} ops/sec)`);
        expect(atomicRef.get()).toBe(MEDIUM_ITERATIONS);

        // 普通变量更新测试
        const plainUpdateStart = performance.now();
        for (let i = 0; i < MEDIUM_ITERATIONS; i++) {
            plainValue += 1;
        }
        const plainUpdateEnd = performance.now();
        const plainUpdateTime = plainUpdateEnd - plainUpdateStart;
        console.log(`  普通变量更新 ${MEDIUM_ITERATIONS} 次: ${plainUpdateTime.toFixed(2)}ms (${Math.floor(MEDIUM_ITERATIONS / (plainUpdateTime / 1000))} ops/sec)`);
        expect(plainValue).toBe(MEDIUM_ITERATIONS);

        // 更复杂的更新场景 - 模拟并发冲突的情况
        const atomicComplexStart = performance.now();
        for (let i = 0; i < MEDIUM_ITERATIONS; i++) {
            atomicRef.updateAndGet(val => {
                // 模拟CAS操作的重试逻辑
                for (let j = 0; j < 3; j++) {
                    if (val % 2 === 0) {
                        return val + 1;
                    }
                }
                return val + 1;
            });
        }
        const atomicComplexEnd = performance.now();
        const atomicComplexTime = atomicComplexEnd - atomicComplexStart;
        console.log(`  AtomicReference 模拟冲突更新 ${MEDIUM_ITERATIONS} 次: ${atomicComplexTime.toFixed(2)}ms (${Math.floor(MEDIUM_ITERATIONS / (atomicComplexTime / 1000))} ops/sec)`);
    });

    test('集合操作性能 - 交集/并集/差集', () => {
        console.log('测试集合操作性能:');

        // 准备测试数据
        const set1 = new ConcurrentSet<number>();
        const set2 = new ConcurrentSet<number>();
        const standardSet1 = new Set<number>();
        const standardSet2 = new Set<number>();

        for (let i = 0; i < MEDIUM_ITERATIONS; i++) {
            set1.add(i);
            standardSet1.add(i);

            if (i % 2 === 0) {
                set2.add(i);
                standardSet2.add(i);
            } else {
                set2.add(i + MEDIUM_ITERATIONS);
                standardSet2.add(i + MEDIUM_ITERATIONS);
            }
        }

        // 测试交集操作
        console.log('\n  测试交集操作:');

        const csIntersectionStart = performance.now();
        const intersection = set1.intersection(set2);
        const csIntersectionEnd = performance.now();
        const csIntersectionTime = csIntersectionEnd - csIntersectionStart;
        console.log(`    ConcurrentSet 交集操作: ${csIntersectionTime.toFixed(2)}ms`);
        expect(intersection.size()).toBe(MEDIUM_ITERATIONS / 2);

        const stdIntersectionStart = performance.now();
        const stdIntersection = new Set([...standardSet1].filter(x => standardSet2.has(x)));
        const stdIntersectionEnd = performance.now();
        const stdIntersectionTime = stdIntersectionEnd - stdIntersectionStart;
        console.log(`    标准 Set 交集操作: ${stdIntersectionTime.toFixed(2)}ms`);
        expect(stdIntersection.size).toBe(MEDIUM_ITERATIONS / 2);

        // 测试并集操作
        console.log('\n  测试并集操作:');

        const csUnionStart = performance.now();
        const union = set1.union(set2);
        const csUnionEnd = performance.now();
        const csUnionTime = csUnionEnd - csUnionStart;
        console.log(`    ConcurrentSet 并集操作: ${csUnionTime.toFixed(2)}ms`);
        expect(union.size()).toBe(MEDIUM_ITERATIONS * 1.5);

        const stdUnionStart = performance.now();
        const stdUnion = new Set([...standardSet1, ...standardSet2]);
        const stdUnionEnd = performance.now();
        const stdUnionTime = stdUnionEnd - stdUnionStart;
        console.log(`    标准 Set 并集操作: ${stdUnionTime.toFixed(2)}ms`);
        expect(stdUnion.size).toBe(MEDIUM_ITERATIONS * 1.5);

        // 测试差集操作
        console.log('\n  测试差集操作:');

        const csDifferenceStart = performance.now();
        const difference = set1.difference(set2);
        const csDifferenceEnd = performance.now();
        const csDifferenceTime = csDifferenceEnd - csDifferenceStart;
        console.log(`    ConcurrentSet 差集操作: ${csDifferenceTime.toFixed(2)}ms`);
        expect(difference.size()).toBe(MEDIUM_ITERATIONS / 2);

        const stdDifferenceStart = performance.now();
        const stdDifference = new Set([...standardSet1].filter(x => !standardSet2.has(x)));
        const stdDifferenceEnd = performance.now();
        const stdDifferenceTime = stdDifferenceEnd - stdDifferenceStart;
        console.log(`    标准 Set 差集操作: ${stdDifferenceTime.toFixed(2)}ms`);
        expect(stdDifference.size).toBe(MEDIUM_ITERATIONS / 2);
    });
}); 