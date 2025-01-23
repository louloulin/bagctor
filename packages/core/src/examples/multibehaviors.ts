import { Message, Props } from '../core/types';
import { ActorContext } from '../core/context';
import { Actor } from '../core/actor';
import { ActorSystem } from '../core/system';

// 定义不同类型的消息
interface SwitchModeMessage extends Message {
  type: 'switch_mode';
  payload: {
    mode: 'happy' | 'angry' | 'calm';
  };
}

interface GreetMessage extends Message {
  type: 'greet';
  payload: {
    name: string;
  };
}

type MoodActorMessage = SwitchModeMessage | GreetMessage;

// 创建一个具有多种行为模式的Actor
class MoodActor extends Actor {
  constructor(context: ActorContext) {
    super(context);
  }

  protected behaviors(): void {
    // 添加快乐模式的行为
    this.addBehavior('happy', async (message: Message) => {
      if (message.type === 'greet') {
        const greetMsg = message as GreetMessage;
        console.log(`😊 Hey ${greetMsg.payload.name}! What a wonderful day!`);
      } else if (message.type === 'switch_mode') {
        const switchMsg = message as SwitchModeMessage;
        console.log(`😊 -> ${switchMsg.payload.mode === 'angry' ? '😠' : '😌'}`);
        this.become(switchMsg.payload.mode);
      }
    });

    // 添加生气模式的行为
    this.addBehavior('angry', async (message: Message) => {
      if (message.type === 'greet') {
        const greetMsg = message as GreetMessage;
        console.log(`😠 Go away ${greetMsg.payload.name}! I'm not in the mood!`);
      } else if (message.type === 'switch_mode') {
        const switchMsg = message as SwitchModeMessage;
        console.log(`😠 -> ${switchMsg.payload.mode === 'happy' ? '😊' : '😌'}`);
        this.become(switchMsg.payload.mode);
      }
    });

    // 添加平静模式的行为
    this.addBehavior('calm', async (message: Message) => {
      if (message.type === 'greet') {
        const greetMsg = message as GreetMessage;
        console.log(`😌 Hello ${greetMsg.payload.name}. Peace be with you.`);
      } else if (message.type === 'switch_mode') {
        const switchMsg = message as SwitchModeMessage;
        console.log(`😌 -> ${switchMsg.payload.mode === 'happy' ? '😊' : '😠'}`);
        this.become(switchMsg.payload.mode);
      }
    });

    // 设置默认行为为平静模式
    this.become('calm');
  }
}

// 主函数：展示如何使用多行为Actor
async function main() {
  // 创建一个新的Actor系统
  const system = new ActorSystem();
  await system.start();
  
  // 创建一个MoodActor实例
  const moodProps: Props = {
    producer: (context: ActorContext) => new MoodActor(context)
  };
  
  const moodActorPid = await system.spawn(moodProps);
  
  // 测试不同的行为模式
  const greetMessage: GreetMessage = {
    type: 'greet',
    payload: { name: "World" }
  };

  const switchToHappy: SwitchModeMessage = {
    type: 'switch_mode',
    payload: { mode: 'happy' }
  };

  const switchToAngry: SwitchModeMessage = {
    type: 'switch_mode',
    payload: { mode: 'angry' }
  };

  // 演示行为切换序列
  console.log("=== 开始行为模式演示 ===");
  
  // 1. 默认模式（平静）下的问候
  await system.send(moodActorPid, greetMessage);
  await new Promise(resolve => setTimeout(resolve, 100));

  // 2. 切换到快乐模式
  await system.send(moodActorPid, switchToHappy);
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 3. 快乐模式下的问候
  await system.send(moodActorPid, greetMessage);
  await new Promise(resolve => setTimeout(resolve, 100));

  // 4. 切换到生气模式
  await system.send(moodActorPid, switchToAngry);
  await new Promise(resolve => setTimeout(resolve, 100));

  // 5. 生气模式下的问候
  await system.send(moodActorPid, greetMessage);
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log("=== 演示结束 ===");

  // 关闭Actor系统
  await system.stop();
}

// 如果直接运行此文件，则执行main函数
if (require.main === module) {
  main().catch(console.error);
} 