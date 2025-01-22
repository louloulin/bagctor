import { Actor } from '../core/actor';
import { Message } from '../core/types';
import { ActorSystem } from '../core/system';

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

// Example of location transparent actor communication
async function main() {
  // Start server system
  const serverSystem = new ActorSystem('0.0.0.0:50051');
  
  // Register the calculator actor on the server
  await serverSystem.spawn({
    actorClass: CalculatorActor,
    actorContext: { isTemplate: true }  // This instance will be used as a template
  });
  
  await serverSystem.start();
  console.log('Server system started');

  // Start client system
  const clientSystem = new ActorSystem();
  console.log('Client system started');

  try {
    // Spawn a remote calculator actor
    const calculatorPid = await clientSystem.spawn({
      actorClass: CalculatorActor,
      address: 'localhost:50051'  // This makes it remote
    });
    console.log('Spawned calculator actor:', calculatorPid);

    // Create a local actor that uses the remote calculator
    class UserActor extends Actor {
      protected initializeBehaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
          if (msg.type === 'calculate') {
            // Send message to remote actor - looks just like local communication
            await this.context.send(calculatorPid, {
              type: 'add',
              payload: { x: 5, y: 3 }
            });
          } else if (msg.type === 'result') {
            console.log('Received result:', msg.payload.result);
          }
        });
      }
    }

    // Spawn the local user actor
    const userPid = await clientSystem.spawn({
      actorClass: UserActor
    });
    console.log('Spawned user actor:', userPid);

    // Send a calculation request
    await clientSystem.send(userPid, { type: 'calculate' });

    // Wait a bit to see the results
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Clean up
    await clientSystem.stop();
    await serverSystem.stop();
    console.log('Systems stopped');
  } catch (error) {
    console.error('Error:', error);
    await clientSystem.stop();
    await serverSystem.stop();
  }
}

// Run the example
main().catch(console.error); 