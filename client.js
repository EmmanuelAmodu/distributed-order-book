const { PeerRPCServer, PeerRPCClient } = require('grenache-nodejs-http');
const Link = require('grenache-nodejs-link');
const OrderBook = require('./orderbook');
const { v4: uuidv4 } = require('uuid');
const crypto = require('node:crypto');
const minimist = require('minimist');

// Parse command-line arguments
const args = minimist(process.argv.slice(2));
const NUM_ORDERS = Number.parseInt(args.orders, 10) || 100; // Number of orders to submit
const ORDER_INTERVAL = Number.parseInt(args.interval, 10) || 100; // Interval between orders in ms
const CLIENT_ID_PREFIX = args.clientId || 'client';

// Define service names as top-level constants
const ORDERBOOK_SERVICE = 'orderbook_service';

// Instantiate Link
const link = new Link({
  grape: 'http://127.0.0.1:30001', // Replace with your Grape server address
});
console.log('Instantiated Link:', link);

// Start the link
link.start();

// Function to acquire a lock for an order ID
async function acquireLock(orderId) {
  return new Promise((resolve) => {
    peerClient.request(
      ORDERBOOK_SERVICE,
      { action: 'acquire_lock', orderId },
      { timeout: 5000 },
      (err, data) => {
        if (err || !data.success) {
          console.error(`Error acquiring lock for order ${orderId}:`, err);
          resolve(false);
        } else {
          console.log(`Lock acquired for order ${orderId}.`);
          resolve(true);
        }
      }
    );
  });
}

// Function to release a lock for an order ID
async function releaseLock(orderId) {
  return new Promise((resolve) => {
    peerClient.request(
      ORDERBOOK_SERVICE,
      { action: 'release', orderId },
      { timeout: 5000 },
      (err, data) => {
        if (err) {
          console.error(`Error releasing lock for order ${orderId}:`, err);
          resolve(false);
        } else {
          console.log(`Lock released for order ${orderId}.`);
          resolve(true);
        }
      }
    );
  });
}

// Function to broadcast an order update
async function broadcastOrderUpdate(order, orderIndex) {
  return new Promise((resolve) => {
    peerClient.map(
      ORDERBOOK_SERVICE,
      { type: 'update', order, orderIndex },
      { timeout: 10000 },
      (err) => {
        if (err) {
          console.error('Error broadcasting order update:', err);
          resolve(false);
        } else {
          console.log(`Order update broadcast for order ${order.id}.`);
          resolve(true);
        }
      }
    );
  });
}

// Instantiate OrderBook with lock functions
const orderBook = new OrderBook(acquireLock, releaseLock, broadcastOrderUpdate);

// Initialize PeerRPCClient
const peerClient = new PeerRPCClient(link, {});
peerClient.init();

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

// Handle incoming requests from other clients
service.on('request', async (rid, key, payload, handler) => {
  if (payload.type === 'updated') {
    orderBook.updateOrder(payload.order, payload.orderIndex);
  } else if (payload.type === 'acquire_lock') {
    const isLocked = await orderBook.lockedOrders.has(payload.orderId);
    if (!isLocked) {
      orderBook.lockedOrders.add(payload.orderId);
    }

    isLocked ? handler.reply(null, { success: true }) : handler.reply(null, { success: false });
  } else if (payload.type === 'release') {
    orderBook.lockedOrders.delete(payload.orderId);
    handler.reply(null, { success: true });
  }
});

// Start submitting orders
submitOrders(peerClient, clientId, NUM_ORDERS, ORDER_INTERVAL);

// // Optionally, display local order book for debugging
// setInterval(() => {
//   console.log(`\nOrder Book for ${clientId}:`);
//   console.log(JSON.stringify(orderBook.toJSON(), null, 2));
// }, 10000);

// Function to submit an order
async function submitOrder(peerClient, clientId, order) {
  await orderBook.addOrder(order);
  console.log(`Order ${order.id} added to local order book.`);

  // Distribute order to other clients
  peerClient.map(
    ORDERBOOK_SERVICE,
    { type: 'order', order },
    { timeout: 10000 },
    async (err) => {
      if (err) {
        console.error('Error distributing order:', err);
      } else {
        console.log(`Order ${order.id} distributed to peers`);
      }
      await orderBook.releaseLock(order.id);
    }
  );
}

// Function to submit multiple orders
function submitOrders(peerClient, clientId, numOrders, interval) {
  let ordersSubmitted = 0;
  const orderSubmission = setInterval(async () => {
    if (ordersSubmitted >= numOrders) {
      clearInterval(orderSubmission);
      // Optionally, report metrics or exit the process
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
