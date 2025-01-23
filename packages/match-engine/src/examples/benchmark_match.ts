import { ActorSystem } from '@bactor/core';
import { Message } from '@bactor/core';
import { createRouter, RouterConfig, Actor, ActorContext } from '@bactor/core';
import { configureLogger } from '@bactor/core';
import Decimal from 'decimal.js';
import { MatchingEngineActor } from '../actors/matching_engine_actor';
import { 
  Order, 
  OrderSide, 
  OrderStatus, 
  OrderType, 
  PlaceOrderMessage,
  TradeExecutedMessage,
  OrderStatusUpdateMessage,
  OrderBookUpdateMessage,
  MatchingEngineMessage
} from '../models/types';

// 统计处理器Actor
class StatsHandlerActor extends Actor {
  private orderCount: number = 0;
  private tradeCount: number = 0;
  private startTime: number = 0;
  private lastPrintTime: number = 0;
  private readonly printInterval: number = 1000; // 每秒打印一次统计

  protected behaviors(): void {
    this.addBehavior('default', async (message: Message) => {
      const msg = message as MatchingEngineMessage;
      
      if (!this.startTime) {
        this.startTime = Date.now();
        this.lastPrintTime = this.startTime;
      }

      switch (msg.type) {
        case 'trade_executed':
          this.tradeCount++;
          break;
        case 'order_status_update':
          this.orderCount++;
          break;
      }

      const now = Date.now();
      if (now - this.lastPrintTime >= this.printInterval) {
        this.printStats(now);
        this.lastPrintTime = now;
      }
    });
  }

  private printStats(now: number) {
    const elapsed = (now - this.startTime) / 1000;
    const ordersPerSecond = this.orderCount / elapsed;
    const tradesPerSecond = this.tradeCount / elapsed;

    console.log(`\n=== Performance Stats (${elapsed.toFixed(1)}s) ===`);
    console.log(`Total Orders: ${this.orderCount} (${ordersPerSecond.toFixed(1)}/s)`);
    console.log(`Total Trades: ${this.tradeCount} (${tradesPerSecond.toFixed(1)}/s)`);
  }

  async preStart(): Promise<void> {
    console.log('Stats Handler started');
  }

  async postStop(): Promise<void> {
    // 打印最终统计
    this.printStats(Date.now());
    console.log('Stats Handler stopped');
  }
}

// 生成随机价格
function generateRandomPrice(basePrice: number, volatility: number): Decimal {
  const change = (Math.random() - 0.5) * 2 * volatility;
  const price = basePrice * (1 + change);
  return new Decimal(price.toFixed(2));
}

// 生成随机数量
function generateRandomQuantity(minQty: number, maxQty: number): Decimal {
  const qty = minQty + Math.random() * (maxQty - minQty);
  return new Decimal(qty.toFixed(4));
}

// 生成测试订单
function generateTestOrders(count: number, basePrice: number = 50000): Order[] {
  const orders: Order[] = [];
  const volatility = 0.01; // 1% 价格波动
  const minQty = 0.1;
  const maxQty = 2.0;

  for (let i = 0; i < count; i++) {
    const side = Math.random() < 0.5 ? OrderSide.BUY : OrderSide.SELL;
    const price = generateRandomPrice(basePrice, volatility);
    const quantity = generateRandomQuantity(minQty, maxQty);

    orders.push({
      orderId: `order-${i + 1}`,
      symbol: 'BTC-USDT',
      side,
      type: OrderType.LIMIT,
      price,
      quantity,
      filledQuantity: new Decimal(0),
      status: OrderStatus.NEW,
      timestamp: Date.now(),
      userId: `user${(i % 100) + 1}` // 模拟100个用户
    });
  }

  return orders;
}

async function main() {
  // 配置日志级别
  configureLogger({
    level: 'info', // 压测时使用 info 级别，避免大量 debug 日志
    prettyPrint: true,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: true,
        ignore: 'pid,hostname'
      }
    }
  });

  // 创建Actor系统
  const system = new ActorSystem();
  await system.start();

  // 创建广播路由器
  const routerConfig: RouterConfig = { system };
  const broadcastRouter = createRouter('broadcast', routerConfig);
  const routerPid = await system.spawn({
    producer: () => broadcastRouter
  });

  // 创建撮合引擎Actor
  const matchingEngine = await system.spawn({
    producer: (context) => new MatchingEngineActor(context, 'BTC-USDT', routerPid)
  });

  // 创建统计处理Actor
  const statsPid = await system.spawn({
    producer: (context) => new StatsHandlerActor(context)
  });

  // 添加统计处理器到路由器
  await system.send(routerPid, {
    type: 'router.add-routee',
    routee: statsPid
  });

  // 生成测试订单
  const orderCount = 100000; // 生成100万个订单
  const orders = generateTestOrders(orderCount);

  // 发送订单
  console.log(`=== Starting Benchmark with ${orderCount} orders ===`);
  const startTime = Date.now();

  for (const order of orders) {
    const message: PlaceOrderMessage = {
      type: 'place_order',
      payload: { order }
    };
    
    await system.send(matchingEngine, message);
  }

  // 等待所有消息处理完成
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 获取最终的订单簿状态
  await system.send(matchingEngine, {
    type: 'order_book_snapshot',
    payload: { symbol: 'BTC-USDT' }
  });

  // 等待最后的消息处理完成
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 计算总耗时
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n=== Benchmark Complete ===`);
  console.log(`Total time: ${duration.toFixed(2)} seconds`);
  console.log(`Average throughput: ${(orderCount / duration).toFixed(2)} orders/second`);

  // 移除处理器
  await system.send(routerPid, {
    type: 'router.remove-routee',
    routee: statsPid
  });

  // 关闭系统
  await system.stop();
}

// 执行压测
main().catch(console.error); 