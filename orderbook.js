class OrderBook {
  lockedOrders = new Set();
  buys = [];
  sells = [];
  /**
   * Initializes the OrderBook with external lock and unlock functions.
   * @param {Function} acquireLockFn - Function to acquire a lock for an order ID.
   * @param {Function} releaseLockFn - Function to release a lock for an order ID.
   * @param {Function} broadcastOrderUpdateFn - Function to broadcast an order update.
   */
  constructor(acquireLockFn, releaseLockFn, broadcastOrderUpdateFn) {
    // External lock functions
    this.acquireLock = acquireLockFn;
    this.releaseLock = releaseLockFn;
    this.broadcastOrderUpdate = broadcastOrderUpdateFn;
  }

  async updateOrder(order, orderIndex) {
    if (orderIndex === -1) {
      return;
    }

    const orderType = order.type === 'buy' ? this.buys : this.sells;
    if (order.quantity === 0) {
      orderType.splice(orderIndex, 1);
    } else {
      orderType[orderIndex] = order;
    }
  }

  async _updateOrderInternal(order, orderIndex) {
    if (orderIndex !== -1) {
      updateOrder(order, orderIndex);
  
      await this.broadcastOrderUpdate(order, orderIndex);
      await this.releaseLock(oppositeOrder.id);
      return orderIndex;
    }
  
    const orderType = order.type === 'buy' ? this.buys : this.sells;
    orderType.push(order);
    await this.broadcastOrderUpdate(order, orderType.length - 1);
    return orderType.length - 1;
  }

  /**
   * Attempts to add an order to the order book.
   * @param {Object} order - The order to add.
   */
  async addOrder(order) {
    const lockAcquired = await this.acquireLock(order.id);
    // Attempt to acquire a lock on the incoming order
    if (!lockAcquired) {
      console.log(`Could not acquire lock for order ${order.id}. Skipping.`);
      return;
    }

    const index = await this._updateOrderInternal(order, -1);
    if (order.type === 'buy') {
      await this.matchOrder(order, this.sells, this.buys, index);
    } else if (order.type === 'sell') {
      await this.matchOrder(order, this.buys, this.sells, index);
    }

    await this.updateOrder(order, index);
  }

  /**
   * Attempts to match an order against opposite orders.
   * @param {Object} order - The order to match.
   * @param {Array} oppositeOrders - The list of opposite orders.
   * @param {Array} sameSideOrders - The list of same-side orders.
   */
  async matchOrder(order, oppositeOrders, sameSideOrders, index) {
    let remainingQuantity = order.quantity;

    // Sort opposite orders based on price priority
    oppositeOrders.sort((a, b) => {
      return order.type === 'buy' ? a.price - b.price : b.price - a.price;
    });

    for (let i = 0; i < oppositeOrders.length && remainingQuantity > 0; i++) {
      const oppositeOrder = oppositeOrders[i];

      // Check if orders are compatible for matching
      const isPriceMatch =
        (order.type === 'buy' && order.price >= oppositeOrder.price) ||
        (order.type === 'sell' && order.price <= oppositeOrder.price);

      const isDifferentType = order.type !== oppositeOrder.type;
      const isDifferentClient = order.clientId !== oppositeOrder.clientId;

      if (isPriceMatch && isDifferentType && isDifferentClient) {
        // Attempt to acquire locks on both orders
        const lockOpposite = await this.acquireLock(oppositeOrder.id);

        if (!lockOpposite) {
          console.log(
            `Could not acquire locks for orders ${oppositeOrder.id}. Skipping.`
          );
          continue;
        }

        // Perform the match
        const tradedQuantity = Math.min(remainingQuantity, oppositeOrder.quantity);

        console.log(
          `Order matched: ${tradedQuantity} @ ${oppositeOrder.price} between ${order.clientId} and ${oppositeOrder.clientId}`
        );

        remainingQuantity -= tradedQuantity;
        oppositeOrder.quantity -= tradedQuantity;

        await this._updateOrderInternal(order, index);
        await this._updateOrderInternal(oppositeOrder, i);

        if (oppositeOrder.quantity === 0) {
          oppositeOrders.splice(i, 1);
        }
      }
    }

    if (remainingQuantity > 0) {
      const remainingOrder = { ...order, quantity: remainingQuantity };
      sameSideOrders.push(remainingOrder);
      console.log(
        `Order added to ${order.type} side: ${JSON.stringify(remainingOrder)}`
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
