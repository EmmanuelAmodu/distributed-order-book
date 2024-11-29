const { spawn } = require('node:child_process');
const path = require('node:path');

const NUM_CLIENTS = 5; // Number of client instances to start
const ORDERS_PER_CLIENT = 200; // Number of orders each client will submit
const ORDER_INTERVAL = 50; // Interval between orders in ms

const clients = [];
let clientsCompleted = 0;
const startTime = Date.now();

console.log(`Starting load test with ${NUM_CLIENTS} clients...`);

for (let i = 0; i < NUM_CLIENTS; i++) {
  setTimeout(() => {
    const clientId = `client_${i + 1}`;
    const clientProcess = spawn('node', [
      'client.js',
      '--orders',
      ORDERS_PER_CLIENT,
      '--interval',
      ORDER_INTERVAL,
      '--clientId',
      clientId,
    ], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Pipe client output to the parent process's console
    clientProcess.stdout.on('data', (data) => {
      const message = data.toString();
      console.log(`[${clientId}]: ${message}`);
    });

    clientProcess.stderr.on('data', (data) => {
      console.error(`[${clientId} ERROR]: ${data}`);
    });

    clientProcess.on('close', (code) => {
      clientsCompleted++;
      console.log(`${clientId} exited with code ${code}`);
      if (clientsCompleted === NUM_CLIENTS) {
        const endTime = Date.now();
        console.log(`Load test completed in ${(endTime - startTime) / 1000} seconds.`);
        // No need to terminate lock service as it's removed
      }
    });

    clients.push(clientProcess);
  }, i * 1000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Terminating all client processes...');
  for (const client of clients) {
    client.kill('SIGINT');
  }
  process.exit();
});
