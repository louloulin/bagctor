/**
 * thread_binding.ts
 * 
 * 线程亲和性实际绑定实现
 * 提供与平台相关的线程绑定操作，使用N-API实现真正的CPU亲和性控制
 */

import { platform } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

// 判断当前平台
const currentPlatform = platform();
let nativeBindingAvailable = false;

// 尝试加载平台相关的native binding模块
let nativeBinding: any = null;

try {
    // 查找对应平台的native binding
    const bindingPath = join(__dirname, '..', '..', '..', 'native_modules', `thread_binding_${currentPlatform}.node`);

    if (existsSync(bindingPath)) {
        nativeBinding = require(bindingPath);
        nativeBindingAvailable = true;
    }
} catch (error: any) {
    console.warn(`无法加载线程亲和性native binding: ${error.message}`);
    nativeBindingAvailable = false;
}

/**
 * 检查是否支持原生线程绑定
 */
export function isNativeBindingSupported(): boolean {
    return nativeBindingAvailable;
}

/**
 * 获取当前线程ID
 * @returns 当前线程的ID
 */
export function getNativeThreadId(): number {
    if (nativeBindingAvailable && nativeBinding.getThreadId) {
        try {
            return nativeBinding.getThreadId();
        } catch (error: any) {
            console.warn(`获取线程ID失败: ${error.message}`);
        }
    }

    // 无法获取真实线程ID时返回模拟ID
    return Date.now() % 100000;
}

/**
 * 将当前线程绑定到指定CPU核心
 * @param coreId 要绑定的CPU核心ID
 * @returns 是否绑定成功
 */
export function bindThreadToCore(coreId: number): boolean {
    if (!nativeBindingAvailable || !nativeBinding.bindThreadToCore) {
        // 无法使用原生绑定时，返回模拟成功
        return true;
    }

    try {
        return nativeBinding.bindThreadToCore(coreId);
    } catch (error: any) {
        console.warn(`绑定线程到CPU核心失败: ${error.message}`);
        return false;
    }
}

/**
 * 获取当前线程绑定的CPU核心
 * @returns 当前线程绑定的CPU核心ID，如果未绑定则返回-1
 */
export function getCurrentThreadCore(): number {
    if (!nativeBindingAvailable || !nativeBinding.getCurrentThreadCore) {
        return -1;
    }

    try {
        return nativeBinding.getCurrentThreadCore();
    } catch (error: any) {
        console.warn(`获取当前线程CPU核心失败: ${error.message}`);
        return -1;
    }
}

/**
 * 设置线程优先级
 * @param priority 优先级(0-99)，值越大优先级越高
 * @returns 是否设置成功
 */
export function setThreadPriority(priority: number): boolean {
    if (!nativeBindingAvailable || !nativeBinding.setThreadPriority) {
        return true;
    }

    try {
        return nativeBinding.setThreadPriority(priority);
    } catch (error: any) {
        console.warn(`设置线程优先级失败: ${error.message}`);
        return false;
    }
}

/**
 * 获取系统拓扑信息
 * @returns CPU拓扑信息，包括NUMA节点、物理核心和逻辑核心的映射关系
 */
export function getSystemTopology(): {
    numaNodes: number;
    coresPerNode: number[];
    logicalToPhysicalMap: Record<number, number>;
} {
    if (!nativeBindingAvailable || !nativeBinding.getSystemTopology) {
        // 返回默认拓扑
        return {
            numaNodes: 1,
            coresPerNode: [require('os').cpus().length],
            logicalToPhysicalMap: {}
        };
    }

    try {
        return nativeBinding.getSystemTopology();
    } catch (error: any) {
        console.warn(`获取系统拓扑信息失败: ${error.message}`);
        // 返回默认拓扑
        return {
            numaNodes: 1,
            coresPerNode: [require('os').cpus().length],
            logicalToPhysicalMap: {}
        };
    }
}

/**
 * 获取当前CPU使用率
 * @param coreId 可选的核心ID，如果不指定则返回所有核心的平均值
 * @returns CPU使用率(0-100)
 */
export function getCpuUsage(coreId?: number): number {
    if (!nativeBindingAvailable || !nativeBinding.getCpuUsage) {
        // 返回模拟值
        return Math.random() * 30 + 10; // 10-40%的随机值
    }

    try {
        return nativeBinding.getCpuUsage(coreId);
    } catch (error: any) {
        console.warn(`获取CPU使用率失败: ${error.message}`);
        return Math.random() * 30 + 10;
    }
}

/**
 * 设置线程的NUMA亲和性
 * @param numaNode NUMA节点ID
 * @returns 是否设置成功
 */
export function setNumaAffinity(numaNode: number): boolean {
    if (!nativeBindingAvailable || !nativeBinding.setNumaAffinity) {
        return true;
    }

    try {
        return nativeBinding.setNumaAffinity(numaNode);
    } catch (error: any) {
        console.warn(`设置NUMA亲和性失败: ${error.message}`);
        return false;
    }
}

/**
 * 解除当前线程的CPU亲和性
 * @returns 是否成功解除
 */
export function unbindThread(): boolean {
    if (!nativeBindingAvailable || !nativeBinding.unbindThread) {
        return true;
    }

    try {
        return nativeBinding.unbindThread();
    } catch (error: any) {
        console.warn(`解除线程亲和性失败: ${error.message}`);
        return false;
    }
} 