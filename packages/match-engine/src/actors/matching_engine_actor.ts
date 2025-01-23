import { Actor, ActorContext, Message, PID } from '@bactor/core';
import { OrderBook } from '../core/order_book';
import { 
  MatchingEngineMessage, 
  Order, 
  OrderStatus, 
  PlaceOrderMessage,
  CancelOrderMessage,
  OrderStatusUpdateMessage,
  TradeExecutedMessage,
  OrderBookUpdateMessage
} from '../models/types';

export class MatchingEngineActor extends Actor {
  private orderBook: OrderBook;
  private routerPid: PID;
  private symbol: string;

  constructor(context: ActorContext, symbol: string, routerPid: PID) {
    super(context);
    this.symbol = symbol;
    this.orderBook = new OrderBook(symbol);
    this.routerPid = routerPid;
  }

  protected behaviors(): void {
    // 处理下单请求
    this.addBehavior('default', async (message: Message) => {
      const msg = message as MatchingEngineMessage;
      switch (msg.type) {
        case 'place_order':
          await this.handlePlaceOrder(msg as PlaceOrderMessage);
          break;
        case 'cancel_order':
          await this.handleCancelOrder(msg as CancelOrderMessage);
          break;
        case 'order_book_snapshot':
          await this.handleOrderBookSnapshot();
          break;
      }
    });
  }

  // 处理下单请求
  private async handlePlaceOrder(message: PlaceOrderMessage) {
    const order = message.payload.order;
    
    // 先尝试撮合
    const trades = this.orderBook.match(order);
    
    // 发送成交消息
    for (const trade of trades) {
      const tradeMessage: TradeExecutedMessage = {
        type: 'trade_executed',
        payload: { trade }
      };
      await this.context.send(this.routerPid, tradeMessage);
      
      // 更新maker订单状态
      const makerOrder = this.orderBook.getOrder(trade.makerOrderId);
      if (makerOrder) {
        const statusMessage: OrderStatusUpdateMessage = {
          type: 'order_status_update',
          payload: {
            orderId: makerOrder.orderId,
            status: makerOrder.status,
            filledQuantity: makerOrder.filledQuantity
          }
        };
        await this.context.send(this.routerPid, statusMessage);
      }
    }
    
    // 如果订单未完全成交，加入订单簿
    if (order.status !== OrderStatus.FILLED) {
      this.orderBook.addOrder(order);
    }
    
    // 发送订单状态更新
    const statusMessage: OrderStatusUpdateMessage = {
      type: 'order_status_update',
      payload: {
        orderId: order.orderId,
        status: order.status,
        filledQuantity: order.filledQuantity
      }
    };
    await this.context.send(this.routerPid, statusMessage);
    
    // 发送订单簿更新
    const snapshot = this.orderBook.getSnapshot();
    const bookMessage: OrderBookUpdateMessage = {
      type: 'order_book_update',
      payload: {
        symbol: order.symbol,
        bids: snapshot.bids,
        asks: snapshot.asks
      }
    };
    await this.context.send(this.routerPid, bookMessage);
  }

  // 处理撤单请求
  private async handleCancelOrder(message: CancelOrderMessage) {
    const { orderId, userId } = message.payload;
    const order = this.orderBook.getOrder(orderId);
    
    if (order && order.userId === userId) {
      this.orderBook.removeOrder(orderId);
      order.status = OrderStatus.CANCELED;
      
      // 发送订单状态更新
      const statusMessage: OrderStatusUpdateMessage = {
        type: 'order_status_update',
        payload: {
          orderId: order.orderId,
          status: order.status,
          filledQuantity: order.filledQuantity
        }
      };
      await this.context.send(this.routerPid, statusMessage);
      
      // 发送订单簿更新
      const snapshot = this.orderBook.getSnapshot();
      const bookMessage: OrderBookUpdateMessage = {
        type: 'order_book_update',
        payload: {
          symbol: order.symbol,
          bids: snapshot.bids,
          asks: snapshot.asks
        }
      };
      await this.context.send(this.routerPid, bookMessage);
    }
  }

  // 处理订单簿快照请求
  private async handleOrderBookSnapshot() {
    const snapshot = this.orderBook.getSnapshot();
    const bookMessage: OrderBookUpdateMessage = {
      type: 'order_book_update',
      payload: {
        symbol: this.symbol,
        bids: snapshot.bids,
        asks: snapshot.asks
      }
    };
    await this.context.send(this.routerPid, bookMessage);

    // 打印汇总信息
    console.log('\n=== Final Order Book Status ===');
    console.log('Symbol:', this.symbol);
    console.log('\nBids:');
    snapshot.bids.forEach(([price, quantity]) => {
      console.log(`  ${quantity} BTC @ ${price} USDT`);
    });
    console.log('\nAsks:');
    snapshot.asks.forEach(([price, quantity]) => {
      console.log(`  ${quantity} BTC @ ${price} USDT`);
    });
  }
} 