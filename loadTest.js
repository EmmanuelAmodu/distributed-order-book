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
  const clientId = `client_${i + 1}`;
  const clientProcess = spawn('node', [
    'client.js',
    '--orders',
    ORDERS_PER_CLIENT,
    '--interval',
    ORDER_INTERVAL,
    '--sync',
    'false', // Disable sync during load test to focus on order processing
    '--clientId',
    clientId,
  ]);

  clientProcess.stdout.on('data', (data) => {
    // Optionally, write logs to files or process them
    console.log(`[${clientId}]: ${data}`);
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
    }
  });

  clients.push(clientProcess);
}
