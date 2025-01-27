import { ActorSystem } from '../core/system';
import { Actor } from '../core/actor';
import { Message } from '../core/types';
import { ActorContext } from '../core/context';
import { createRouter } from '../core/router';
import { log } from '../utils/logger';

// Worker actor that processes messages
class WorkerActor extends Actor {
    constructor(context: ActorContext) {
        super(context);
        this.initialize();
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            const workerId = this.context.self.id;
            log.info(`[Worker ${workerId}] Processing message:`, {
                messageType: message.type,
                content: message.content
            });

            // Simulate some work
            await new Promise(resolve => setTimeout(resolve, 100));

            log.info(`[Worker ${workerId}] Completed processing message`);
        });
    }
}

async function demonstrateRoundRobinRouter() {
    log.info('=== Round Robin Router Demo ===');
    const system = new ActorSystem();

    // Create worker actors
    const workerCount = 3;
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
        const worker = await system.spawn({
            producer: (context) => new WorkerActor(context)
        });
        workers.push(worker);
    }

    // Create round-robin router
    const router = createRouter('round-robin', { system, routees: workers });
    const routerPid = await system.spawn({ producer: () => router });

    // Send messages to be distributed round-robin
    for (let i = 0; i < 6; i++) {
        await system.send(routerPid, {
            type: 'task',
            content: `Task ${i + 1}`
        });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
}

async function demonstrateRandomRouter() {
    log.info('=== Random Router Demo ===');
    const system = new ActorSystem();

    // Create worker actors
    const workerCount = 3;
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
        const worker = await system.spawn({
            producer: (context) => new WorkerActor(context)
        });
        workers.push(worker);
    }

    // Create random router
    const router = createRouter('random', { system, routees: workers });
    const routerPid = await system.spawn({ producer: () => router });

    // Send messages to be distributed randomly
    for (let i = 0; i < 6; i++) {
        await system.send(routerPid, {
            type: 'task',
            content: `Task ${i + 1}`
        });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
}

async function demonstrateConsistentHashRouter() {
    log.info('=== Consistent Hash Router Demo ===');
    const system = new ActorSystem();

    // Create worker actors
    const workerCount = 3;
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
        const worker = await system.spawn({
            producer: (context) => new WorkerActor(context)
        });
        workers.push(worker);
    }

    // Create consistent hash router
    const router = createRouter('consistent-hash', {
        system,
        routees: workers,
        routingConfig: {
            hashFunction: (message: Message) => {
                // Use message content as hash key
                return message.content as string;
            }
        }
    });
    const routerPid = await system.spawn({ producer: () => router });

    // Send messages with same content to demonstrate consistent hashing
    const contents = ['A', 'B', 'A', 'C', 'B', 'A'];
    for (let i = 0; i < contents.length; i++) {
        await system.send(routerPid, {
            type: 'task',
            content: contents[i]
        });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
}

async function demonstrateBroadcastRouter() {
    log.info('=== Broadcast Router Demo ===');
    const system = new ActorSystem();

    // Create worker actors
    const workerCount = 3;
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
        const worker = await system.spawn({
            producer: (context) => new WorkerActor(context)
        });
        workers.push(worker);
    }

    // Create broadcast router
    const router = createRouter('broadcast', { system, routees: workers });
    const routerPid = await system.spawn({ producer: () => router });

    // Send messages to be broadcasted to all workers
    for (let i = 0; i < 3; i++) {
        await system.send(routerPid, {
            type: 'broadcast-task',
            content: `Broadcast Task ${i + 1}`
        });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
}

async function main() {
    try {
        // Demonstrate different router types
        await demonstrateRoundRobinRouter();
        await demonstrateRandomRouter();
        await demonstrateConsistentHashRouter();
        await demonstrateBroadcastRouter();
    } catch (error) {
        log.error('Error in router demo:', error);
    }
}

main(); 