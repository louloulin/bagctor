// Worker thread for Actor message processing

/**
 * The Worker receives tasks from the main thread and executes them
 * Each task is a serialized function that will be executed in the worker thread
 */
self.addEventListener('message', async (event) => {
    const { type, taskId, taskFunction } = event.data;

    if (type === 'EXECUTE_TASK') {
        try {
            // Convert string function back to executable function
            // Note: This is simplistic and has security implications
            // A production implementation would use safer serialization/deserialization
            const runner = eval(`(${taskFunction})`);

            // Execute the task
            await runner();

            // Notify main thread of task completion
            self.postMessage({
                type: 'TASK_COMPLETE',
                taskId,
                success: true
            });
        } catch (error) {
            // Report error back to main thread
            self.postMessage({
                type: 'TASK_COMPLETE',
                taskId,
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        }
    }
});

// Send ready signal to main thread
self.postMessage({ type: 'WORKER_READY' }); 