// client.js
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

// Initialize Link
const link = new Link({
  grape: 'http://127.0.0.1:30001',
});
console.log('Instantiated Link:', link);

// Start the link
link.start();

// Initialize PeerRPCClient to communicate with other nodes
const peerClient = new PeerRPCClient(link, {});
peerClient.init();

// Initialize OrderBook with broadcast function
const orderBook = new OrderBook(broadcastOrderUpdate);

// Function to broadcast the current hash and timestamp
async function broadcastOrderUpdate(delta) {
  // Compute the current hash after the update
  const currentHash = orderBook.getCurrentHash();
  const timestamp = new Date().toISOString();

  // Broadcast only the hash and timestamp
  peerClient.request(
    ORDERBOOK_SERVICE,
    { type: 'hash_broadcast', hash: currentHash, timestamp },
    { timeout: 10000 },
    (err, data) => {
      if (err) {
        console.error('Error broadcasting order hash:', err);
      } else {
        console.log(`Order book hash broadcasted: ${currentHash} at ${timestamp}`);
      }
    }
  );
}

// Function to request the full order book from peers
function requestFullOrderBook() {
  peerClient.request(
    ORDERBOOK_SERVICE,
    { type: 'full_sync_request' },
    { timeout: 10000 },
    (err, data) => {
      if (err) {
        console.error('Error requesting full order book:', err);
      } else {
        const { orderBookData } = data;
        synchronizeOrderBook(orderBookData);
        console.log('Order book synchronized after hash mismatch.');
      }
    }
  );
}

// Function to handle incoming hash broadcasts
function handleIncomingHash(payload, handler) {
  const { type, hash, timestamp } = payload;

  if (type !== 'hash_broadcast') {
    handler.reply(new Error('Invalid message type for hash broadcast.'));
    return;
  }

  const localHash = orderBook.getCurrentHash();

  console.log(`Received hash: ${hash} at ${timestamp}`);
  console.log(`Local hash: ${localHash}`);

  if (hash !== localHash) {
    console.log('Hash mismatch detected. Requesting full order book.');
    requestFullOrderBook();
  } else {
    console.log('Order book is up-to-date.');
  }

  handler.reply(null, { status: 'hash_received' });
}

// Initialize PeerRPCServer
const peerServer = new PeerRPCServer(link, {
  timeout: 300000,
});
peerServer.init();

// Listen for incoming requests on ORDERBOOK_SERVICE
peerServer.on('request', async (rid, key, payload, handler) => {
  const { type } = payload;

  switch (type) {
    case 'hash_broadcast':
      handleIncomingHash(payload, handler);
      break;

    case 'full_sync_request':
      handler.reply(null, { orderBookData: orderBook.toJSON() });
      break;

    case 'full_sync': {
      const { orderBookData } = payload;
      synchronizeOrderBook(orderBookData);
      console.log('Received full order book sync.');
      handler.reply(null, { status: 'full_sync_received' });
      break;
    }

    case 'delta': {
      const delta = payload.delta;
      await applyDelta(delta);
      console.log(`Received delta: ${JSON.stringify(delta)}`);
      handler.reply(null, { status: 'delta_received' });
      break;
    }

    default:
      handler.reply(new Error('Unknown request type'));
  }
});

// Announce the ORDERBOOK_SERVICE periodically
setInterval(() => {
  link.announce(ORDERBOOK_SERVICE, peerServer.transport('server').port, {});
}, 1000);

// Function to start client operations
function startClientOperations() {
  const port = 1024 + Math.floor(Math.random() * 1000);
  const service = peerServer.transport('server');
  service.listen(port);

  const clientId = `${CLIENT_ID_PREFIX}_${port}`;

  console.log(`\n=== Starting Client: ${clientId} on Port: ${port} ===`);

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
