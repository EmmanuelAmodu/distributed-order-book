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
const SYNC_ENABLED = args.sync !== 'false'; // Enable or disable order book sync
const CLIENT_ID_PREFIX = args.clientId || 'client';

// Define service names as top-level constants
const ORDERBOOK_SERVICE = 'orderbook_service';
const LOCK_SERVICE = 'lock_service';

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
      LOCK_SERVICE,
      { action: 'acquire', orderId },
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
      LOCK_SERVICE,
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

// Instantiate OrderBook with lock functions
let orderBook;

// Initialize PeerRPCClient
const peerClient = new PeerRPCClient(link, {});
peerClient.init();

// Test communication with lock service
peerClient.request(
  LOCK_SERVICE,
  { action: 'test' },
  { timeout: 5000 },
  async (err, data) => {
    if (err) {
      console.error('Error communicating with lock service:', err);
      process.exit(1);
    } else {
      console.log('Lock service communication successful:', data);

      // Initialize OrderBook with lock functions
      orderBook = new OrderBook(acquireLock, releaseLock);

      // Proceed with initializing the peer server and client operations
      startClientOperations();
    }
  }
);

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

  // Handle incoming requests from other clients
  service.on('request', async (rid, key, payload, handler) => {
    if (payload.type === 'order') {
      const order = payload.order;
      const lockAcquired = await orderBook.acquireLock(order.id);
      if (!lockAcquired) {
        console.log(`Failed to acquire lock for order ${order.id}`);
        handler.reply(null, { status: 'lock_failed' });
        return;
      }

      console.log(`Processing order ${order.id} from ${order.clientId}`);
      await orderBook.addOrder(order);
      await orderBook.releaseLock(order.id);
      handler.reply(null, { status: 'order_processed' });
    } else if (payload.type === 'sync') {
      handler.reply(null, { orderBook: orderBook.toJSON() });
    } else {
      handler.reply(new Error('Unknown request type'));
    }
  });

  // Start submitting orders
  submitOrders(peerClient, clientId, NUM_ORDERS, ORDER_INTERVAL);

  // Periodically sync order books if enabled
  // if (SYNC_ENABLED) {
  //   setInterval(() => {
  //     syncOrderBook();
  //   }, 15000);
  // }

  // Optionally, display local order book for debugging
  setInterval(() => {
    console.log(`\nOrder Book for ${clientId}:`);
    console.log(JSON.stringify(orderBook.toJSON(), null, 2));
  }, 10000);
}

// Function to submit an order
async function submitOrder(peerClient, clientId, order) {
  const lockAcquired = await orderBook.acquireLock(order.id);
  if (!lockAcquired) {
    console.log(`Failed to acquire lock for order ${order.id}`);
    return;
  }

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

// Function to sync order books with peers
async function syncOrderBook() {
  peerClient.map(
    ORDERBOOK_SERVICE,
    { type: 'sync' },
    { timeout: 10000 },
    async (err, data) => {
      if (err) {
        console.error('Error syncing order books:', err);
      } else {
        for (const response of data) {
          if (response?.orderBook) {
            await mergeOrderBooks(response.orderBook);
          }
        }
        console.log(`Order books synced with peers at ${new Date().toISOString()}`);
      }
    }
  );
}

// Function to merge remote order books into the local order book
async function mergeOrderBooks(remoteOrderBookData) {
  // Merge buy orders
  for (const remoteOrder of remoteOrderBookData.buys) {
    if (
      !orderBook.buys.find(
        (localOrder) => localOrder.id === remoteOrder.id
      )
    ) {
      const lockAcquired = await orderBook.acquireLock(remoteOrder.id);
      if (!lockAcquired) {
        console.log(`Could not acquire lock to merge buy order ${remoteOrder.id}. Skipping.`);
        continue;
      }

      orderBook.buys.push(remoteOrder);
      orderBook.processedOrders.add(remoteOrder.id);
      console.log(`Merged buy order from ${remoteOrder.clientId}: ${JSON.stringify(remoteOrder)}`);

      await orderBook.releaseLock(remoteOrder.id);
    }
  }

  // Merge sell orders
  for (const remoteOrder of remoteOrderBookData.sells) {
    if (
      !orderBook.sells.find(
        (localOrder) => localOrder.id === remoteOrder.id
      )
    ) {
      const lockAcquired = await orderBook.acquireLock(remoteOrder.id);
      if (!lockAcquired) {
        console.log(`Could not acquire lock to merge sell order ${remoteOrder.id}. Skipping.`);
        continue;
      }

      orderBook.sells.push(remoteOrder);
      orderBook.processedOrders.add(remoteOrder.id);
      console.log(`Merged sell order from ${remoteOrder.clientId}: ${JSON.stringify(remoteOrder)}`);

      await orderBook.releaseLock(remoteOrder.id);
    }
  }
}
