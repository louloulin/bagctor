/**
 * zero_copy.ts
 * 
 * 零拷贝(Zero Copy)优化实现
 * 减少数据复制和内存分配，提高性能和减少GC压力
 */

import { Buffer } from 'buffer';

/**
 * 缓冲区视图接口
 * 提供对底层缓冲区的不复制视图
 */
export interface BufferView {
    /**
     * 获取原始Buffer
     */
    buffer: Buffer;

    /**
     * 偏移量
     */
    offset: number;

    /**
     * 视图长度
     */
    length: number;

    /**
     * 将视图转换为Buffer（尽可能避免复制）
     */
    toBuffer(): Buffer;

    /**
     * 创建子视图（不复制数据）
     */
    slice(start: number, end?: number): BufferView;

    /**
     * 复制数据到目标缓冲区
     */
    copyTo(target: Buffer, targetStart?: number): number;

    /**
     * 读取指定位置的字节
     */
    readUInt8(offset: number): number;

    /**
     * 读取字符串（可能涉及复制）
     */
    toString(encoding?: BufferEncoding, start?: number, end?: number): string;
}

/**
 * 缓冲区视图实现
 */
export class BufferViewImpl implements BufferView {
    readonly buffer: Buffer;
    readonly offset: number;
    readonly length: number;

    /**
     * 构造函数
     * @param buffer 原始缓冲区
     * @param offset 偏移量（默认为0）
     * @param length 长度（默认为剩余缓冲区长度）
     */
    constructor(buffer: Buffer, offset: number = 0, length?: number) {
        this.buffer = buffer;
        this.offset = offset;
        this.length = length ?? (buffer.length - offset);

        // 验证参数
        if (offset < 0 || offset > buffer.length) {
            throw new Error('Invalid offset');
        }

        if (this.length < 0 || offset + this.length > buffer.length) {
            throw new Error('Invalid length');
        }
    }

    /**
     * 将视图转换为Buffer
     * 如果视图与原始Buffer一致，则返回原始Buffer
     * 否则创建一个切片，避免复制
     */
    toBuffer(): Buffer {
        if (this.offset === 0 && this.length === this.buffer.length) {
            return this.buffer;
        }

        // 使用slice创建新的Buffer视图（不复制内存）
        return this.buffer.slice(this.offset, this.offset + this.length);
    }

    /**
     * 创建子视图（不复制数据）
     */
    slice(start: number, end?: number): BufferView {
        // 计算实际的起始和结束位置
        const actualStart = Math.max(0, start);
        const actualEnd = end !== undefined ? Math.min(this.length, end) : this.length;

        // 计算新的偏移量和长度
        const newOffset = this.offset + actualStart;
        const newLength = actualEnd - actualStart;

        // 创建新的视图
        return new BufferViewImpl(this.buffer, newOffset, newLength);
    }

    /**
     * 复制数据到目标缓冲区
     */
    copyTo(target: Buffer, targetStart: number = 0): number {
        // Use type assertion to tell TypeScript that this is a valid operation
        return this.buffer.copy(target as unknown as Uint8Array, targetStart, this.offset, this.offset + this.length);
    }

    /**
     * 读取指定位置的字节
     */
    readUInt8(offset: number): number {
        if (offset < 0 || offset >= this.length) {
            throw new Error('Offset out of bounds');
        }
        return this.buffer[this.offset + offset];
    }

    /**
     * 读取字符串（可能涉及复制）
     */
    toString(encoding: BufferEncoding = 'utf8', start: number = 0, end?: number): string {
        const actualStart = Math.max(0, start);
        const actualEnd = end !== undefined ? Math.min(this.length, end) : this.length;

        return this.buffer.toString(
            encoding,
            this.offset + actualStart,
            this.offset + actualEnd
        );
    }
}

/**
 * 零拷贝缓冲区池
 * 管理缓冲区的分配和回收，最小化复制和内存分配
 */
export class ZeroCopyBufferPool {
    private static instance: ZeroCopyBufferPool;

    // 缓冲区大小分类
    private static readonly SIZE_CLASSES = [
        1024,     // 1KB
        4096,     // 4KB
        16384,    // 16KB
        65536,    // 64KB
        262144    // 256KB
    ];

    // 每个大小类别的缓冲区池
    private pools: Map<number, Buffer[]> = new Map();

    // 统计信息
    private stats = {
        allocated: 0,
        recycled: 0,
        wastedBytes: 0,
        totalRequested: 0
    };

    /**
     * 私有构造函数
     */
    private constructor() {
        // 初始化每个大小类别的池
        ZeroCopyBufferPool.SIZE_CLASSES.forEach(size => {
            this.pools.set(size, []);
        });
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): ZeroCopyBufferPool {
        if (!ZeroCopyBufferPool.instance) {
            ZeroCopyBufferPool.instance = new ZeroCopyBufferPool();
        }
        return ZeroCopyBufferPool.instance;
    }

    /**
     * 分配指定大小的缓冲区
     * @param size 需要的缓冲区大小
     * @returns 缓冲区视图
     */
    public allocate(size: number): BufferView {
        this.stats.totalRequested += size;

        // 找到最合适的缓冲区大小类别
        const sizeClass = this.findSizeClass(size);

        // 尝试从池中获取缓冲区
        const pool = this.pools.get(sizeClass);
        if (pool && pool.length > 0) {
            const buffer = pool.pop()!;
            this.stats.recycled++;
            // 计算浪费的字节
            this.stats.wastedBytes += (sizeClass - size);
            return new BufferViewImpl(buffer, 0, size);
        }

        // 没有可用的缓冲区，创建新的
        this.stats.allocated++;
        const buffer = Buffer.allocUnsafe(sizeClass);
        this.stats.wastedBytes += (sizeClass - size);
        return new BufferViewImpl(buffer, 0, size);
    }

    /**
     * 回收缓冲区
     * @param bufferView 要回收的缓冲区视图
     */
    public recycle(bufferView: BufferView): void {
        const buffer = bufferView.buffer;

        // 只回收我们支持的大小类别的缓冲区
        const sizeClass = this.findSizeClass(buffer.length, true);
        if (sizeClass === 0) {
            // 不是标准大小，无法回收
            return;
        }

        // 确保这是完整的原始缓冲区，而不是切片
        if (buffer.length === sizeClass) {
            const pool = this.pools.get(sizeClass);
            if (pool) {
                // 限制池大小，避免内存泄漏
                if (pool.length < 100) { // 每个大小类别最多保留100个缓冲区
                    pool.push(buffer);
                }
            }
        }
    }

    /**
     * 创建字符串，尽量避免复制
     * @param str 要创建的字符串
     * @param encoding 编码方式
     */
    public createBufferFromString(str: string, encoding: BufferEncoding = 'utf8'): BufferView {
        // 估计所需的缓冲区大小
        const estimatedSize = Buffer.byteLength(str, encoding);

        // 分配缓冲区
        const bufferView = this.allocate(estimatedSize);

        // 写入字符串 - Using type assertion to fix compatibility issue
        const written = Buffer.from(str, encoding).copy(
            bufferView.buffer as unknown as Uint8Array,
            bufferView.offset,
            0,
            estimatedSize
        );

        // 如果实际写入大小不同，调整视图
        if (written !== estimatedSize) {
            return bufferView.slice(0, written);
        }

        return bufferView;
    }

    /**
     * 连接多个缓冲区，尽量避免复制
     * @param buffers 要连接的缓冲区视图数组
     */
    public concat(buffers: BufferView[]): BufferView {
        if (buffers.length === 0) {
            return new BufferViewImpl(Buffer.alloc(0));
        }

        if (buffers.length === 1) {
            return buffers[0];
        }

        // 计算总长度
        let totalLength = 0;
        for (const buffer of buffers) {
            totalLength += buffer.length;
        }

        // 分配新缓冲区
        const result = this.allocate(totalLength);

        // 复制数据
        let offset = 0;
        for (const buffer of buffers) {
            buffer.copyTo(result.buffer, result.offset + offset);
            offset += buffer.length;
        }

        return result;
    }

    /**
     * 获取统计信息
     */
    public getStats(): any {
        return { ...this.stats };
    }

    /**
     * 根据请求的大小找到合适的大小类别
     * @param size 请求的大小
     * @param exact 是否需要精确匹配
     */
    private findSizeClass(size: number, exact: boolean = false): number {
        if (exact) {
            return ZeroCopyBufferPool.SIZE_CLASSES.includes(size) ? size : 0;
        }

        // 找到最小的足够大的缓冲区大小
        for (const sizeClass of ZeroCopyBufferPool.SIZE_CLASSES) {
            if (sizeClass >= size) {
                return sizeClass;
            }
        }

        // 如果请求的大小大于最大的类别，返回自定义大小
        // 这种情况下可能不会进行池化管理
        return size;
    }
}

/**
 * 零拷贝消息接口
 * 实现消息的高效传递，减少复制
 */
export interface ZeroCopyMessage {
    /**
     * 消息类型
     */
    type: string;

    /**
     * 消息数据（使用缓冲区视图避免复制）
     */
    data: BufferView | any;

    /**
     * 元数据
     */
    metadata?: Record<string, any>;

    /**
     * 将消息转换为Buffer（尽可能避免复制）
     */
    toBuffer(): Buffer;

    /**
     * 释放消息资源
     */
    release(): void;
}

/**
 * 零拷贝消息实现
 */
export class ZeroCopyMessageImpl implements ZeroCopyMessage {
    readonly type: string;
    readonly data: BufferView | any;
    readonly metadata?: Record<string, any>;
    private pool: ZeroCopyBufferPool;
    private released: boolean = false;

    /**
     * 构造函数
     * @param type 消息类型
     * @param data 消息数据
     * @param metadata 元数据
     * @param pool 缓冲区池（可选，默认使用全局池）
     */
    constructor(
        type: string,
        data: BufferView | any,
        metadata?: Record<string, any>,
        pool?: ZeroCopyBufferPool
    ) {
        this.type = type;
        this.data = data;
        this.metadata = metadata;
        this.pool = pool || ZeroCopyBufferPool.getInstance();
    }

    /**
     * 将消息转换为Buffer
     */
    toBuffer(): Buffer {
        if (this.released) {
            throw new Error('Message has been released');
        }

        if (this.data instanceof BufferViewImpl) {
            return this.data.toBuffer();
        }

        // 如果不是BufferView，则序列化为JSON
        const json = JSON.stringify({
            type: this.type,
            data: this.data,
            metadata: this.metadata
        });

        return Buffer.from(json);
    }

    /**
     * 释放消息资源
     */
    release(): void {
        if (this.released) {
            return;
        }

        if (this.data instanceof BufferViewImpl) {
            this.pool.recycle(this.data);
        }

        this.released = true;
    }
}

/**
 * 便捷函数：创建零拷贝缓冲区视图
 * @param buffer 原始缓冲区
 * @param offset 偏移量
 * @param length 长度
 */
export function createBufferView(buffer: Buffer, offset: number = 0, length?: number): BufferView {
    return new BufferViewImpl(buffer, offset, length);
}

/**
 * 便捷函数：从池中分配缓冲区
 * @param size 缓冲区大小
 */
export function allocateBuffer(size: number): BufferView {
    return ZeroCopyBufferPool.getInstance().allocate(size);
}

/**
 * 便捷函数：回收缓冲区
 * @param bufferView 缓冲区视图
 */
export function recycleBuffer(bufferView: BufferView): void {
    ZeroCopyBufferPool.getInstance().recycle(bufferView);
}

/**
 * 便捷函数：创建零拷贝消息
 * @param type 消息类型
 * @param data 消息数据
 * @param metadata 元数据
 */
export function createZeroCopyMessage(
    type: string,
    data: BufferView | any,
    metadata?: Record<string, any>
): ZeroCopyMessage {
    return new ZeroCopyMessageImpl(type, data, metadata);
}

/**
 * 便捷函数：连接多个缓冲区
 * @param buffers 缓冲区视图数组
 */
export function concatBuffers(buffers: BufferView[]): BufferView {
    return ZeroCopyBufferPool.getInstance().concat(buffers);
}

/**
 * 便捷函数：从字符串创建缓冲区
 * @param str 字符串
 * @param encoding 编码方式
 */
export function bufferFromString(str: string, encoding?: BufferEncoding): BufferView {
    return ZeroCopyBufferPool.getInstance().createBufferFromString(str, encoding);
} 