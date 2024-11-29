const { PeerRPCServer, PeerRPCClient } = require('grenache-nodejs-http');
const Link = require('grenache-nodejs-link');
const OrderBook = require('./orderbook');
const { v4: uuidv4 } = require('uuid');
const crypto = require('node:crypto');

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

const clientId = `client_${port}`;
const ORDERBOOK_SERVICE = 'orderbook_service';
const LOCK_SERVICE = 'lock_service';

const orderBook = new OrderBook();

setInterval(() => {
  link.announce(ORDERBOOK_SERVICE, service.port, {});
}, 1000);

// Handle incoming orders from other clients
service.on('request', (rid, key, payload, handler) => {
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
  order.id = uuidv4(); // Assign a unique ID to the order
  order.clientId = clientId;

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
        } else {
          console.log(`Order ${order.id} distributed to peers`);
        }
        releaseLock(order.id);
      }
    );
  });
}

// Test usage:

// Submit orders at random intervals
setInterval(() => {
  const order = {
    type: Math.random() > 0.5 ? 'buy' : 'sell',
    price: Math.floor(Math.random() * 100) + 1,
    quantity: Math.floor(Math.random() * 10) + 1,
  };
  console.log(`Submitting order: ${JSON.stringify(order)}`);
  submitOrder(order);
}, 5000);

// Submit orders at random intervals
setInterval(() => {
  const order = {
    type: Math.random() > 0.5 ? 'buy' : 'sell',
    price: Math.floor(Math.random() * 100) + 1,
    quantity: Math.floor(Math.random() * 10) + 1,
  };
  console.log(`Submitting order: ${JSON.stringify(order)}`);
  submitOrder(order);
}, 5000);

// // Sync order books with peers every 15 seconds
// setInterval(() => {
//   console.log('Syncing order book with peers...');
//   syncOrderBook();
// }, 15000);

// Display local order book every 10 seconds
setInterval(() => {
  console.log(`\nOrder Book for ${clientId}:`);
  console.log(JSON.stringify(orderBook.toJSON(), null, 2));
}, 10000);
