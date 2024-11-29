class OrderBook {
  constructor() {
    this.buys = [];
    this.sells = [];
    this.processedOrders = new Set(); // Track processed orders
  }

  addOrder(order) {
    if (this.processedOrders.has(order.id)) {
      console.log(`Order ${order.id} has already been processed.`);
      return;
    }
    this.processedOrders.add(order.id);

    if (order.type === 'buy') {
      this.matchOrder(order, this.sells, this.buys);
    } else if (order.type === 'sell') {
      this.matchOrder(order, this.buys, this.sells);
    }
  }

  matchOrder(order, oppositeOrders, sameSideOrders) {
    let remainingQuantity = order.quantity;

    // Sort opposite orders based on price priority
    oppositeOrders.sort((a, b) => {
      return order.type === 'buy' ? a.price - b.price : b.price - a.price;
    });

    for (let i = 0; i < oppositeOrders.length && remainingQuantity > 0; ) {
      const oppositeOrder = oppositeOrders[i];

      if (
        (order.type === 'buy' && order.price >= oppositeOrder.price) ||
        (order.type === 'sell' && order.price <= oppositeOrder.price)
      ) {
        const tradedQuantity = Math.min(remainingQuantity, oppositeOrder.quantity);

        console.log(
          `Order matched: ${tradedQuantity} @ ${oppositeOrder.price} between ${order.clientId} and ${oppositeOrder.clientId}`
        );

        remainingQuantity -= tradedQuantity;
        oppositeOrder.quantity -= tradedQuantity;

        if (oppositeOrder.quantity === 0) {
          oppositeOrders.splice(i, 1);
        } else {
          i++;
        }
      } else {
        break;
      }
    }

    if (remainingQuantity > 0) {
      const remainingOrder = { ...order, quantity: remainingQuantity };
      sameSideOrders.push(remainingOrder);
    }
  }

  toJSON() {
    return {
      buys: this.buys,
      sells: this.sells,
    };
  }
}

module.exports = OrderBook;
