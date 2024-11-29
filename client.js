const { PeerRPCServer, PeerRPCClient } = require('grenache-nodejs-http');
const Link = require('grenache-nodejs-link');
const OrderBook = require('./orderbook');
const { v4: uuidv4 } = require('uuid');
const crypto = require('node:crypto');
const minimist = require('minimist');

// Get command-line arguments
const args = minimist(process.argv.slice(2));
const NUM_ORDERS = args.orders || 100; // Number of orders to submit
const ORDER_INTERVAL = args.interval || 100; // Interval between orders in ms
const SYNC_ENABLED = args.sync !== 'false'; // Enable or disable order book sync
const CLIENT_ID_PREFIX = args.clientId || 'client';

const link = new Link({
  grape: 'http://127.0.0.1:30001',
});
link.start();

const peerServer = new PeerRPCServer(link, {
  timeout: 300000,
});
peerServer.init();

const peerClient = new PeerRPCClient(link, {});
peerClient.init();

const port = 1024 + crypto.randomInt(0, 1000); // Random port between 1024 and 2024
const service = peerServer.transport('server');
service.listen(port);

const clientId = `${CLIENT_ID_PREFIX}_${port}`;
const ORDERBOOK_SERVICE = 'orderbook_service';
const LOCK_SERVICE = 'lock_service';

const orderBook = new OrderBook();

setInterval(() => {
  link.announce(ORDERBOOK_SERVICE, service.port, {});
}, 1000);

// Handle incoming requests from other clients
service.on('request', (rid, key, payload, handler) => {
  console.log(`Received request: ${JSON.stringify(payload)}`);
  if (payload.type === 'order') {
    const order = payload.order;
    acquireLock(order.id, (err, lockAcquired) => {
      if (err || !lockAcquired) {
        console.log(`Failed to acquire lock for order ${order.id}`);
        handler.reply(null, { status: 'lock_failed' });
        return;
      }

      console.log(`Processing order ${order.id} from ${order.clientId}`);
      orderBook.addOrder(order);
      releaseLock(order.id);
      handler.reply(null, { status: 'order processed' });
    });
  } else if (payload.type === 'sync') {
    handler.reply(null, { orderBook: orderBook.toJSON() });
  } else {
    handler.reply(new Error('Unknown request type'));
  }
});

// Function to acquire a lock for an order
function acquireLock(orderId, callback) {
  peerClient.request(
    LOCK_SERVICE,
    { action: 'acquire', orderId },
    { timeout: 5000 },
    (err, data) => {
      if (err) {
        callback(err);
      } else {
        callback(null, data.success);
      }
    }
  );
}

// Function to release a lock for an order
function releaseLock(orderId) {
  peerClient.request(
    LOCK_SERVICE,
    { action: 'release', orderId },
    { timeout: 5000 },
    (err) => {
      if (err) {
        console.error(`Error releasing lock for order ${orderId}:`, err);
      }
    }
  );
}

// Function to submit an order
function submitOrder(order) {
  acquireLock(order.id, (err, lockAcquired) => {
    if (err || !lockAcquired) {
      console.log(`Failed to acquire lock for order ${order.id}`);
      return;
    }

    orderBook.addOrder(order);

    // Distribute order to other clients
    peerClient.map(
      ORDERBOOK_SERVICE,
      { type: 'order', order },
      { timeout: 10000 },
      (err) => {
        if (err) {
          console.error('Error distributing order:', err);
        }
        releaseLock(order.id);
      }
    );
  });
}

// Function to submit multiple orders
function submitOrders(numOrders, interval) {
  let ordersSubmitted = 0;
  const orderSubmission = setInterval(() => {
    if (ordersSubmitted >= numOrders) {
      clearInterval(orderSubmission);
      // Optionally, report metrics or exit the process
      return;
    }
    const order = {
      id: uuidv4(),
      clientId: clientId,
      type: Math.random() > 0.5 ? 'buy' : 'sell',
      price: Math.floor(Math.random() * 100) + 1,
      quantity: Math.floor(Math.random() * 10) + 1,
    };
    submitOrder(order);
    ordersSubmitted++;
  }, interval);
}

// Function to sync order books with peers
function syncOrderBook() {
  peerClient.map(
    ORDERBOOK_SERVICE,
    { type: 'sync' },
    { timeout: 10000 },
    (err, data) => {
      if (err) {
        console.error('Error syncing order books:', err);
      } else {
        for (const response of data) {
          if (response?.orderBook) {
            mergeOrderBooks(orderBook, response.orderBook);
          }
        }
        console.log(`Order books synced with peers at ${new Date().toISOString()}`);
      }
    }
  );
}

// Function to merge remote order books into the local order book
function mergeOrderBooks(localOrderBook, remoteOrderBookData) {
  // Merge buy orders
  for (const remoteOrder of remoteOrderBookData.buys) {
    if (
      !localOrderBook.buys.find(
        (localOrder) => localOrder.id === remoteOrder.id
      )
    ) {
      localOrderBook.buys.push(remoteOrder);
      localOrderBook.processedOrders.add(remoteOrder.id);
    }
  }

  // Merge sell orders
  for (const remoteOrder of remoteOrderBookData.sells) {
    if (
      !localOrderBook.sells.find(
        (localOrder) => localOrder.id === remoteOrder.id
      )
    ) {
      localOrderBook.sells.push(remoteOrder);
      localOrderBook.processedOrders.add(remoteOrder.id);
    }
  }
}

// Start submitting orders
submitOrders(NUM_ORDERS, ORDER_INTERVAL);

// Periodically sync order books if enabled
if (SYNC_ENABLED) {
  setInterval(() => {
    syncOrderBook();
  }, 15000);
}

// Optionally, display local order book for debugging
setInterval(() => {
  console.log(`\nOrder Book for ${clientId}:`);
  console.log(JSON.stringify(orderBook.toJSON(), null, 2));
}, 10000);
