import { Actor } from '@bactor/core';
import { Message, PID } from '@bactor/common';
import { ActorSystem } from '@bactor/core';

// Example remote actor
class CalculatorActor extends Actor {
  constructor(name: string) {
    super(name);
    this.addBehavior('add', this.handleAdd.bind(this));
  }

  protected behaviors(): void {
    // Behaviors are added in constructor
  }

  private async handleAdd(message: Message): Promise<void> {
    const { a, b } = message.payload;
    const result = a + b;
    await this.context.sender?.tell({
      type: 'result',
      payload: { result }
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
      private calculatorPid?: PID;

      constructor(name: string) {
        super(name);
        this.addBehavior('start', this.handleStart.bind(this));
        this.addBehavior('result', this.handleResult.bind(this));
      }

      protected behaviors(): void {
        // Behaviors are added in constructor
      }

      private async handleStart(message: Message): Promise<void> {
        this.calculatorPid = message.payload.calculatorPid;
        await this.context.tell(this.calculatorPid!, {
          type: 'add',
          payload: { a: 5, b: 3 }
        });
      }

      private async handleResult(message: Message): Promise<void> {
        console.log('Received result:', message.payload.result);
        await this.context.stop();
      }
    }

    // Spawn the local user actor
    const userPid = await clientSystem.spawn({
      actorClass: UserActor
    });
    console.log('Spawned user actor:', userPid);

    // Send a calculation request
    await clientSystem.send(userPid, {
      type: 'start',
      payload: { calculatorPid: calculatorPid }
    });

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