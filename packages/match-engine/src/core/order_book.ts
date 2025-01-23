import Decimal from 'decimal.js';
import { Order, OrderSide, OrderStatus, Trade } from '../models/types';

// 价格级别的订单
interface PriceLevel {
  price: Decimal;
  orders: Order[];
  totalQuantity: Decimal;
}

export class OrderBook {
  private symbol: string;
  private bids: PriceLevel[] = [];  // 买单，按价格降序排列
  private asks: PriceLevel[] = [];  // 卖单，按价格升序排列
  private orderMap: Map<string, Order> = new Map();

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  // 添加订单到订单簿
  addOrder(order: Order): void {
    const levels = order.side === OrderSide.BUY ? this.bids : this.asks;
    const price = order.price;
    
    let level = levels.find(l => l.price.equals(price));
    if (!level) {
      level = {
        price,
        orders: [],
        totalQuantity: new Decimal(0)
      };
      
      // 插入并保持价格排序
      const insertIndex = order.side === OrderSide.BUY
        ? levels.findIndex(l => l.price.lessThan(price))
        : levels.findIndex(l => l.price.greaterThan(price));
      
      if (insertIndex === -1) {
        levels.push(level);
      } else {
        levels.splice(insertIndex, 0, level);
      }
    }

    level.orders.push(order);
    level.totalQuantity = level.totalQuantity.plus(order.quantity.minus(order.filledQuantity));
    this.orderMap.set(order.orderId, order);
  }

  // 从订单簿中移除订单
  removeOrder(orderId: string): Order | undefined {
    const order = this.orderMap.get(orderId);
    if (!order) return undefined;

    const levels = order.side === OrderSide.BUY ? this.bids : this.asks;
    const level = levels.find(l => l.price.equals(order.price));
    
    if (level) {
      const index = level.orders.findIndex(o => o.orderId === orderId);
      if (index !== -1) {
        level.orders.splice(index, 1);
        level.totalQuantity = level.totalQuantity.minus(
          order.quantity.minus(order.filledQuantity)
        );
        
        // 如果价格级别没有订单了，移除这个级别
        if (level.orders.length === 0) {
          const levelIndex = levels.indexOf(level);
          levels.splice(levelIndex, 1);
        }
      }
    }

    this.orderMap.delete(orderId);
    return order;
  }

  // 尝试撮合订单
  match(order: Order): Trade[] {
    const trades: Trade[] = [];
    const oppositeOrders = order.side === OrderSide.BUY ? this.asks : this.bids;
    
    while (oppositeOrders.length > 0 && order.filledQuantity.lessThan(order.quantity)) {
      const bestLevel = oppositeOrders[0];
      
      // 检查价格是否匹配
      if (order.side === OrderSide.BUY && bestLevel.price.greaterThan(order.price)) break;
      if (order.side === OrderSide.SELL && bestLevel.price.lessThan(order.price)) break;

      // 遍历当前价格级别的所有订单
      for (let i = 0; i < bestLevel.orders.length; i++) {
        const matchingOrder = bestLevel.orders[i];
        const remainingQuantity = order.quantity.minus(order.filledQuantity);
        const matchingRemaining = matchingOrder.quantity.minus(matchingOrder.filledQuantity);
        
        if (matchingRemaining.isZero()) continue;
        
        // 计算成交量
        const tradeQuantity = Decimal.min(remainingQuantity, matchingRemaining);
        
        // 创建成交记录
        const trade: Trade = {
          tradeId: `T${Date.now()}-${order.orderId}-${matchingOrder.orderId}`,
          symbol: this.symbol,
          price: bestLevel.price,
          quantity: tradeQuantity,
          makerOrderId: matchingOrder.orderId,
          takerOrderId: order.orderId,
          timestamp: Date.now()
        };
        
        trades.push(trade);
        
        // 更新订单状态
        order.filledQuantity = order.filledQuantity.plus(tradeQuantity);
        matchingOrder.filledQuantity = matchingOrder.filledQuantity.plus(tradeQuantity);
        
        // 更新订单状态
        if (matchingOrder.filledQuantity.equals(matchingOrder.quantity)) {
          matchingOrder.status = OrderStatus.FILLED;
          this.removeOrder(matchingOrder.orderId);
          i--;  // 因为移除了一个订单，需要调整索引
        } else {
          matchingOrder.status = OrderStatus.PARTIALLY_FILLED;
        }
        
        if (order.filledQuantity.equals(order.quantity)) {
          order.status = OrderStatus.FILLED;
          break;
        } else {
          order.status = OrderStatus.PARTIALLY_FILLED;
        }
      }
      
      // 如果当前价格级别没有更多订单了，移除这个级别
      if (bestLevel.orders.length === 0) {
        oppositeOrders.shift();
      }
      
      // 如果订单已完全成交，退出循环
      if (order.filledQuantity.equals(order.quantity)) break;
    }
    
    return trades;
  }

  // 获取当前买卖盘快照
  getSnapshot(): { bids: Array<[Decimal, Decimal]>; asks: Array<[Decimal, Decimal]> } {
    return {
      bids: this.bids.map(level => [level.price, level.totalQuantity]),
      asks: this.asks.map(level => [level.price, level.totalQuantity])
    };
  }

  // 获取指定订单
  getOrder(orderId: string): Order | undefined {
    return this.orderMap.get(orderId);
  }
} 