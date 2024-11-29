const { PeerRPCServer } = require('grenache-nodejs-http');
const Link = require('grenache-nodejs-link');

const locks = new Set();

const link = new Link({
  grape: 'http://127.0.0.1:30001',
});
link.start();

const peerServer = new PeerRPCServer(link, {
  timeout: 300000,
});
peerServer.init();

const port = 5001; // Fixed port for the lock service
const service = peerServer.transport('server');
service.listen(port);

const LOCK_SERVICE = 'lock_service';

setInterval(() => {
  link.announce(LOCK_SERVICE, service.port, {});
  console.log('Lock service link connected.');
}, 1000);

// Handle lock requests
service.on('request', (rid, key, payload, handler) => {
  console.log(`Received request: ${JSON.stringify(payload)}`);
  const { action, orderId } = payload;
  if (action === 'test') {
    handler.reply(null, { success: true, message: 'Lock service is reachable' });
  } else if (action === 'acquire') {
    if (locks.has(orderId)) {
      handler.reply(null, { success: false });
    } else {
      locks.add(orderId);
      handler.reply(null, { success: true });
    }
  } else if (action === 'release') {
    locks.delete(orderId);
    handler.reply(null, { success: true });
  } else {
    handler.reply(new Error('Unknown action'));
  }
});
