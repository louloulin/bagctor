import { log } from '@utils/logger';

export interface ResourceMetrics {
    cpu: number;  // CPU usage percentage
    memory: number;  // Memory usage in bytes
    timestamp: number;
}

export class ResourceMonitor {
    private metrics: ResourceMetrics[] = [];
    private startTime: number = 0;
    private isMonitoring: boolean = false;

    start(): void {
        this.startTime = Date.now();
        this.isMonitoring = true;
        this.metrics = [];
        this.collectMetrics();
    }

    stop(): void {
        this.isMonitoring = false;
    }

    getMetrics(): ResourceMetrics[] {
        return this.metrics;
    }

    getAverageMetrics(): ResourceMetrics {
        if (this.metrics.length === 0) {
            return {
                cpu: 0,
                memory: 0,
                timestamp: Date.now()
            };
        }

        const totalCpu = this.metrics.reduce((sum, m) => sum + m.cpu, 0);
        const totalMemory = this.metrics.reduce((sum, m) => sum + m.memory, 0);
        const count = this.metrics.length;

        return {
            cpu: totalCpu / count,
            memory: totalMemory / count,
            timestamp: Date.now()
        };
    }

    private async collectMetrics(): Promise<void> {
        while (this.isMonitoring) {
            try {
                const metrics = await this.gatherMetrics();
                this.metrics.push(metrics);
                log.debug(`Resource metrics collected: CPU ${metrics.cpu.toFixed(2)}%, Memory ${(metrics.memory / 1024 / 1024).toFixed(2)} MB`);
            } catch (error) {
                log.error('Error collecting resource metrics:', error);
            }

            // Collect metrics every second
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    private async gatherMetrics(): Promise<ResourceMetrics> {
        // Note: This is a simplified implementation. In a real-world scenario,
        // you would use platform-specific APIs to get accurate CPU and memory usage.
        // For Node.js, you might use the 'os' module or a third-party package.

        const memoryUsage = process.memoryUsage();
        const cpuUsage = await this.getCPUUsage();

        return {
            cpu: cpuUsage,
            memory: memoryUsage.heapUsed,
            timestamp: Date.now()
        };
    }

    private async getCPUUsage(): Promise<number> {
        // This is a simplified implementation. In a real-world scenario,
        // you would use platform-specific APIs to get accurate CPU usage.
        // For Node.js, you might use the 'os' module or a third-party package.

        const startUsage = process.cpuUsage();
        await new Promise(resolve => setTimeout(resolve, 100));
        const endUsage = process.cpuUsage(startUsage);

        // Calculate CPU usage percentage
        const totalUsage = (endUsage.user + endUsage.system) / 1000000; // Convert to milliseconds
        return (totalUsage / 100) * 100; // Convert to percentage
    }
} 