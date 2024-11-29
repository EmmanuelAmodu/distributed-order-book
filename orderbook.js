const { Mutex } = require('async-mutex');
const EventEmitter = require('node:events');

class OrderBook extends EventEmitter {
  /**
   * Initializes the OrderBook with internal locking and event emission.
   * @param {Function} broadcastOrderUpdateFn - Function to broadcast an order update.
   */
  constructor(broadcastOrderUpdateFn) {
    super();
    this.buys = [];
    this.sells = [];
    this.broadcastOrderUpdate = broadcastOrderUpdateFn;
    this.mutex = new Mutex(); // Mutex for synchronizing access

    // Listen to internal events to trigger broadcasting
    this.on('orderAdded', (order, index) => {
      this.broadcastOrderUpdate({ type: 'add', order, index });
    });

    this.on('orderMatched', (matchDetails) => {
      this.broadcastOrderUpdate({ type: 'match', matchDetails });
    });
  }

  /**
   * Adds an order to the order book and attempts to match it.
   * @param {Object} order - The order to add.
   */
  async addOrder(order) {
    const release = await this.mutex.acquire(); // Acquire the mutex lock
    try {
      // Determine the order type
      const orderType = order.type === 'buy' ? this.buys : this.sells;

      // Add the order to the appropriate side
      const index = orderType.push(order) - 1;
      this.emit('orderAdded', order, index); // Emit event for broadcasting

      // Attempt to match the order
      await this.matchOrder(order, orderType, index);
    } finally {
      release(); // Release the mutex lock
    }
  }

  /**
   * Attempts to match an order against opposite orders.
   * @param {Object} order - The order to match.
   * @param {Array} orderType - The list of same-side orders.
   * @param {number} index - The index of the order in its side.
   */
  async matchOrder(order, orderType, index) {
    const oppositeOrders = order.type === 'buy' ? this.sells : this.buys;
    let remainingQuantity = order.quantity;

    // Sort opposite orders based on price priority
    oppositeOrders.sort((a, b) => {
      return order.type === 'buy' ? a.price - b.price : b.price - a.price;
    });

    for (let i = 0; i < oppositeOrders.length && remainingQuantity > 0; ) {
      const oppositeOrder = oppositeOrders[i];

      // Check if orders are compatible for matching
      const isPriceMatch =
        (order.type === 'buy' && order.price >= oppositeOrder.price) ||
        (order.type === 'sell' && order.price <= oppositeOrder.price);

      const isDifferentClient = order.clientId !== oppositeOrder.clientId;

      if (isPriceMatch && isDifferentClient) {
        // Perform the match
        const tradedQuantity = Math.min(remainingQuantity, oppositeOrder.quantity);
        const tradePrice = oppositeOrder.price;

        console.log(
          `Order matched: ${tradedQuantity} @ ${tradePrice} between ${order.clientId} and ${oppositeOrder.clientId}`
        );

        // Update quantities
        remainingQuantity -= tradedQuantity;
        oppositeOrder.quantity -= tradedQuantity;

        // Emit match event
        this.emit('orderMatched', {
          buyOrderId: order.type === 'buy' ? order.id : oppositeOrder.id,
          sellOrderId: order.type === 'sell' ? order.id : oppositeOrder.id,
          quantity: tradedQuantity,
          price: tradePrice,
          buyer: order.type === 'buy' ? order.clientId : oppositeOrder.clientId,
          seller: order.type === 'sell' ? order.clientId : oppositeOrder.clientId,
        });

        // Remove the opposite order if fully matched
        if (oppositeOrder.quantity === 0) {
          oppositeOrders.splice(i, 1);
        } else {
          i++;
        }

        // Update the incoming order's quantity
        order.quantity = remainingQuantity;
        orderType[index] = order; // Update the order in its side
      } else {
        i++;
      }
    }

    // If the order has remaining quantity, update it in the order book
    if (remainingQuantity > 0) {
      const remainingOrder = { ...order, quantity: remainingQuantity };
      orderType[index] = remainingOrder;
      this.emit('orderAdded', remainingOrder, index); // Emit add event for remaining quantity
      console.log(
        `Order added to ${order.type} side with remaining quantity: ${JSON.stringify(remainingOrder)}`
      );
    }
  }

  /**
   * Returns a JSON representation of the order book.
   * @returns {Object} - The order book in JSON format.
   */
  toJSON() {
    return {
      buys: this.buys,
      sells: this.sells,
    };
  }
}

module.exports = OrderBook;
