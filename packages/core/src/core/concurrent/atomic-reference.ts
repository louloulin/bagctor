/**
 * AtomicReference - 提供原子性的引用更新功能
 * 这个类使用无锁的方式保证引用更新的原子性
 */
export class AtomicReference<T> {
    private value: T;

    /**
     * 创建一个新的原子引用
     * @param initialValue 初始引用值
     */
    constructor(initialValue: T) {
        this.value = initialValue;
    }

    /**
     * 获取当前引用值
     * @returns 当前引用值
     */
    get(): T {
        return this.value;
    }

    /**
     * 设置新的引用值
     * @param newValue 新引用值
     * @returns 更新前的旧值
     */
    set(newValue: T): T {
        const oldValue = this.value;
        this.value = newValue;
        return oldValue;
    }

    /**
     * 原子性地更新引用
     * 只有当当前值与期望值相等时才会更新
     *
     * @param expect 期望的当前值
     * @param update 要更新的新值
     * @returns 如果更新成功返回true，否则返回false
     */
    compareAndSet(expect: T, update: T): boolean {
        if (this.value === expect) {
            this.value = update;
            return true;
        }
        return false;
    }

    /**
     * 获取当前值，然后设置新值
     * @param newValue 新引用值
     * @returns 更新前的旧值
     */
    getAndSet(newValue: T): T {
        return this.set(newValue);
    }

    /**
     * 使用提供的函数原子性地更新当前值
     * 如果在更新过程中值被其他线程修改，会自动重试
     *
     * @param updateFunction 更新函数，接收当前值并返回新值
     * @returns 更新后的值
     */
    updateAndGet(updateFunction: (currentValue: T) => T): T {
        let current: T;
        let newValue: T;
        do {
            current = this.get();
            newValue = updateFunction(current);
        } while (!this.compareAndSet(current, newValue));

        return newValue;
    }

    /**
     * 使用提供的函数原子性地更新当前值，并返回更新前的值
     * 如果在更新过程中值被其他线程修改，会自动重试
     *
     * @param updateFunction 更新函数，接收当前值并返回新值
     * @returns 更新前的旧值
     */
    getAndUpdate(updateFunction: (currentValue: T) => T): T {
        let current: T;
        let newValue: T;
        do {
            current = this.get();
            newValue = updateFunction(current);
        } while (!this.compareAndSet(current, newValue));

        return current;
    }

    /**
     * 如果当前值为null或undefined，则原子性地设置为新值
     * @param newValue 要设置的新值
     * @returns 如果设置成功返回true，否则返回false
     */
    setIfNull(newValue: T): boolean {
        return this.compareAndSet(null as unknown as T, newValue) ||
            this.compareAndSet(undefined as unknown as T, newValue);
    }

    /**
     * 尝试使用提供的函数更新值一次，无论成功与否都不会重试
     * @param updateFunction 更新函数，接收当前值并返回新值
     * @returns 如果更新成功返回true，否则返回false
     */
    tryUpdate(updateFunction: (currentValue: T) => T): boolean {
        const current = this.get();
        const newValue = updateFunction(current);
        return this.compareAndSet(current, newValue);
    }

    /**
     * 如果当前值等于期望值，则转换为新值
     * @param expectedValue 期望的当前值
     * @param newValue 要设置的新值
     * @returns 如果当前值等于期望值，则返回新值；否则返回当前值
     */
    transform(expectedValue: T, newValue: T): T {
        if (this.compareAndSet(expectedValue, newValue)) {
            return newValue;
        }
        return this.get();
    }
} 