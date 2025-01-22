import { Actor } from '../core/actor';
import { Message } from '../core/types';
import { ActorServer } from '../remote/server';
import { ActorClient } from '../remote/client';

// Example remote actor
class CalculatorActor extends Actor {
  protected initializeBehaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'add') {
        const { x, y } = msg.payload;
        const result = x + y;
        console.log(`Calculator: ${x} + ${y} = ${result}`);
        
        // If there's a sender, we can send back the result
        if (msg.sender) {
          await this.context.send(msg.sender, {
            type: 'result',
            payload: { result }
          });
        }
      }
    });
  }
}

// Example of how to use remote actors
async function main() {
  // Start the server
  const server = new ActorServer('0.0.0.0:50051');
  
  // Register the calculator actor
  server.registerActor('CalculatorActor', CalculatorActor);
  
  await server.start();
  console.log('Server started');

  // Connect the client
  const client = new ActorClient('localhost:50051');
  await client.connect();
  console.log('Client connected');

  try {
    // Spawn a remote calculator actor
    const calculatorPid = await client.spawnActor('CalculatorActor');
    console.log('Spawned calculator actor:', calculatorPid.id);

    // Send some calculations
    await client.sendMessage(calculatorPid.id, {
      type: 'add',
      payload: { x: 5, y: 3 }
    });

    await client.sendMessage(calculatorPid.id, {
      type: 'add',
      payload: { x: 10, y: 20 }
    });

    // Watch the calculator actor
    const watcher = client.watchActor(calculatorPid.id, 'watcher1');
    watcher.on('data', (event: any) => {
      console.log('Actor event:', event);
    });

    // Wait a bit before stopping
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop the calculator actor
    await client.stopActor(calculatorPid.id);
    console.log('Stopped calculator actor');

    // Clean up
    client.close();
    await server.stop();
    console.log('Server stopped');
  } catch (error) {
    console.error('Error:', error);
    client.close();
    await server.stop();
  }
}

// Run the example
main().catch(console.error); 