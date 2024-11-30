Minimum requirements

Node.js 20 or later
npm 6 or later

How to run the project

1. Install the dependencies

```bash
npm install
```

2. Start the server

You can run multiple instances of the server simply running the below command on different terminals as many time as you need.

```bash
npm start client.js
```

Or you can run the server with the following command:

```bash
npm start loadTest.js
```

3. Evaluate the results
   
I recomment you run this command and pipe the output to a file to better analyze the results.

```bash
npm start loadTest.js > results.txt
```

4. What I will improve
    . Add a use a ledger system to keep track of the transactions
    . Use some cryptographic means or an hash of the orderbook to ensure idempotency
    . Every time a new order or update is created, I will compute the hash of the orderbook and store it in a ledger
    . I will only broadcast the orderbook hash to the clients
    . Clients will be able to request the orderbook hash and compare it with the one they have
    . If the hash is different, the client will request the orderbook
    . This way, the server will only broadcast the orderbook changes
    . The client can also reconstruct the orderbook from the ledger if they have missed any update
    . I will also add a timestamp to the orderbook hash to ensure that the client has the latest orderbook