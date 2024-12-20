const { PeerRPCServer, PeerRPCClient } = require('grenache-nodejs-http');
const Link = require('grenache-nodejs-link');
const OrderBook = require('./orderbook');
const { v4: uuidv4 } = require('uuid');
const minimist = require('minimist');

const args = minimist(process.argv.slice(2));
const NUM_ORDERS = Number.parseInt(args.orders, 10) || 100; // Number of orders to submit
const ORDER_INTERVAL = Number.parseInt(args.interval, 10) || 100; // Interval between orders in ms
const CLIENT_ID_PREFIX = args.clientId || 'client';

const ORDERBOOK_SERVICE = 'orderbook_service';

const link = new Link({
  grape: 'http://127.0.0.1:30001',
});
console.log('Instantiated Link:', link);

// Start the link
link.start();

// Function to broadcast an order update
async function broadcastOrderUpdate(delta) {
  peerClient.request(ORDERBOOK_SERVICE, { type: 'delta', delta }, { timeout: 10000 }, (err, data) => {
    if (err) {
      console.error('Error broadcasting order update:', err);
    } else {
      console.log(`Order update broadcast: ${JSON.stringify(data)}`);
    }
  });
}

// Initialize PeerRPCClient to communicate with other nnodes
const peerClient = new PeerRPCClient(link, {});
peerClient.init();

// Initialize OrderBook with broadcast function
const orderBook = new OrderBook(broadcastOrderUpdate);

// Function to start client operations
function startClientOperations() {
  const peerServer = new PeerRPCServer(link, {
    timeout: 300000,
  });
  peerServer.init();

  const port = 1024 + Math.floor(Math.random() * 1000);
  const service = peerServer.transport('server');
  service.listen(port);

  const clientId = `${CLIENT_ID_PREFIX}_${port}`;

  // Announce the orderbook service
  setInterval(() => {
    link.announce(ORDERBOOK_SERVICE, service.port, {});
  }, 1000);

  // Handle incoming deltas from the Order Book Server
  service.on('request', async (rid, key, payload, handler) => {
    if (payload.type === 'delta') {
      const delta = payload.delta;
      applyDelta(delta);
      console.log(`Received delta: ${JSON.stringify(delta)}`);
      handler.reply(null, { status: 'delta_received' });
    } else if (payload.type === 'full_sync') {
      const orderBookData = payload.orderBook;
      synchronizeOrderBook(orderBookData);
      console.log('Received full order book sync.');
      handler.reply(null, { status: 'full_sync_received' });
    } else {
      handler.reply(new Error('Unknown request type'));
    }
  });

  // Start submitting orders
  submitOrders(peerClient, clientId, NUM_ORDERS, ORDER_INTERVAL);

  // Optionally, display local order book for debugging
  setInterval(() => {
    console.log(`\nOrder Book for ${clientId}:`);
    console.log(JSON.stringify(orderBook.toJSON(), null, 2));
  }, 10000);
}

// Function to apply a delta to the local order book
async function applyDelta(delta) {
  if (delta.type === 'add') {
    const { order, index } = delta;
    if (order.type === 'buy') {
      orderBook.buys[index] = order;
    } else if (order.type === 'sell') {
      orderBook.sells[index] = order;
    }

    console.log(`Order added: ${JSON.stringify(order)}`);
  } else if (delta.type === 'match') {
    const { buyOrderId, sellOrderId, quantity, price, buyer, seller } = delta;
    const buyOrderIndex = orderBook.buys.findIndex((order) => order.id === buyOrderId);
    const sellOrderIndex = orderBook.sells.findIndex((order) => order.id === sellOrderId);

    if (buyOrderIndex === -1 || sellOrderIndex === -1) return;
    const buyOrder = orderBook.buys[buyOrderIndex];
    const sellOrder = orderBook.sells[sellOrderIndex];

    if (buyOrder.quantity - quantity === 0) {
      orderBook.buys.splice(buyOrderIndex, 1);
    }

    if (sellOrder.quantity - quantity === 0) {
      orderBook.sells.splice(sellOrderIndex, 1);
    }

    orderBook.buys[buyOrderIndex] = {
      ...buyOrder,
      quantity: buyOrder.quantity - quantity,
    };

    orderBook.sells[sellOrderIndex] = {
      ...sellOrder,
      quantity: sellOrder.quantity - quantity,
    };

    console.log(`Order matched: ${quantity} @ ${price} between ${buyer} and ${seller}`);
  }
}

// Function to synchronize the entire order book (initial sync)
function synchronizeOrderBook(orderBookData) {
  orderBook.buys = orderBookData.buys;
  orderBook.sells = orderBookData.sells;
  console.log('Order book synchronized.');
}

// Function to submit an order
async function submitOrder(peerClient, clientId, order) {
  await orderBook.addOrder(order);
  console.log(`Order ${order.id} added to local order book.`);

  // Distribute order to other clients by broadcasting the delta
  const delta = {
    type: 'add',
    order: order,
    index: order.type === 'buy' ? orderBook.buys.length - 1 : orderBook.sells.length - 1,
  };
  await broadcastOrderUpdate(delta);
  console.log(`Order ${order.id} broadcasted to peers.`);
}

// Function to submit multiple orders
function submitOrders(peerClient, clientId, numOrders, interval) {
  let ordersSubmitted = 0;
  const orderSubmission = setInterval(async () => {
    if (ordersSubmitted >= numOrders) {
      clearInterval(orderSubmission);
      console.log(`All ${numOrders} orders submitted by ${clientId}`);
      return;
    }
    const order = {
      id: uuidv4(),
      clientId: clientId,
      type: Math.random() > 0.5 ? 'buy' : 'sell',
      price: Math.floor(Math.random() * 100) + 1,
      quantity: Math.floor(Math.random() * 10) + 1,
    };
    console.log(`Submitting order: ${JSON.stringify(order)}`);
    await submitOrder(peerClient, clientId, order);
    ordersSubmitted++;
  }, interval);
}

// Start client operations after a short delay to ensure services are up
setTimeout(() => {
  startClientOperations();
}, 2000);
