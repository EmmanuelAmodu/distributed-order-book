Distributed Order Book Assessment

Welcome to the Distributed Order Book assessment! This README provides all the necessary information to set up, run, and test the application. Follow the steps below to get started.

Table of Contents

1. Project Overview
2. Prerequisites
3. Installation
4. Configuration
5. Running the Application
6. Testing
7. Troubleshooting
8. Additional Resources

Project Overview

The Distributed Order Book is a Node.js application that simulates a decentralized trading platform. It allows multiple clients to submit buy and sell orders, which are broadcasted to peers and maintained in a local order book. The system leverages Grenache for peer-to-peer communication.

Prerequisites

Before you begin, ensure you have the following installed on your machine:
•	Node.js (v14.x or later)
•	npm (Node Package Manager)
•	Git
•	Grenache (for peer-to-peer communication)

Install Node.js and npm

Download and install Node.js from the official website. npm is bundled with Node.js.

Install Git

Download and install Git from the official website.

Install Grenache

Grenache is essential for the peer-to-peer networking in this application.

# Install Grenache globally using npm
npm install -g grenache

Installation

Follow these steps to set up the project on your local machine.
1.	Clone the Repository

git clone https://github.com/your-username/distributed-order-book.git
cd distributed-order-book


2.	Install Dependencies
Navigate to the project directory and install the necessary Node.js packages.

npm install

Configuration

Before running the application, ensure that Grenache services are properly configured and running.

Start Grenache Router

The Grenache router facilitates communication between peers.

# Start the Grenache router on the default port (30001)
grenache-router

Configure Environment Variables

Create a .env file in the project root to configure necessary environment variables. Below is a sample configuration:

# .env

# Grenache Router URL
GRENACHE_ROUTER_URL=http://127.0.0.1:30001

# Ports for clients (ensure these ports are free)

  CLIENT_1_PORT=1139
  CLIENT_2_PORT=1398
  CLIENT_3_PORT=1716
  CLIENT_4_PORT=1825
  CLIENT_5_PORT=1934

Adjust the ports as needed, ensuring they do not conflict with other services on your machine.

Running the Application

The application consists of multiple client instances that simulate different users interacting with the order book.

Start Client Instances

Open separate terminal windows or tabs for each client and navigate to the project directory.

1. Client 1

  `PORT=1139 npm run client -- client_1`

2. Client 2

  `PORT=1398 npm run client -- client_2`

3.	Client 3

  `PORT=1716 npm run client -- client_3`

4.	Client 4

  `PORT=1825 npm run client -- client_4`

5.	Client 5

`PORT=1934 npm run client -- client_5`

Ensure each client is started with the correct port as specified in the .env file.

Available Scripts

•	Start Clients
The client script starts a client instance. Replace <client_id> with client_1, client_2, etc.

npm run client -- <client_id>


•	Start All Clients
Optionally, you can create a script to start all clients simultaneously using tools like concurrently.

Testing

Once all clients and the Grenache router are running, you can begin testing the order book functionality.

Submit Orders

Each client can submit buy and sell orders by entering JSON-formatted commands. Below are examples of how to submit orders.
1.	Buy Order

{
  "id": "unique-order-id",
  "clientId": "client_x",
  "type": "buy",
  "price": 100,
  "quantity": 10
}


2.	Sell Order

{
  "id": "unique-order-id",
  "clientId": "client_x",
  "type": "sell",
  "price": 95,
  "quantity": 5
}



Replace "unique-order-id" with a unique identifier (e.g., UUID) and "client_x" with the respective client ID.

Observe Order Book

Each client maintains a local copy of the order book. Orders submitted by any client are broadcasted to all peers and should appear in each client’s local order book.

Example Testing Steps

1.	Client 1 Submits a Buy Order

{"id":"order-001","clientId":"client_1","type":"buy","price":100,"quantity":10}


2.	Client 2 Submits a Sell Order

{"id":"order-002","clientId":"client_2","type":"sell","price":95,"quantity":5}


3.	Verify Order Book Across Clients
Check each client’s terminal to ensure both orders are present in their local order books.

Automated Testing

For automated testing, you can create scripts that send predefined orders from each client and verify the consistency of the order books across all instances.

Troubleshooting

If you encounter issues while running or testing the application, refer to the following troubleshooting tips.

Common Issues

1.	ECONNREFUSED Errors

Error broadcasting order update: Error: ERR_REQUEST_GENERIC: connect ECONNREFUSED 127.0.0.1:<PORT>

Cause: The application is attempting to connect to a Grenache peer on localhost at the specified port, but no service is listening on that port.
Solutions:
•	Ensure Grenache Router is Running: Verify that the Grenache router is active.

# Check if the router is listening on port 30001
  `lsof -i -P -n | grep LISTEN | grep 30001`

  •	Start All Client Instances: Make sure all client instances are running on their respective ports.
  •	Verify Port Configuration: Confirm that the ports specified in the .env file match the ports clients are using.
  •	Check Firewall Settings: Ensure that your firewall isn’t blocking the necessary ports.

2.	Port Conflicts
Cause: Another application is using the required port.
Solutions:
  •	Identify Conflicting Application:

    `lsof -i -P -n | grep LISTEN | grep <PORT>`

  •	Change Port Configuration: Update the .env file and client startup commands to use different ports.

3.	Service Crashes
Cause: Grenache or client instances may crash due to unhandled errors.
Solutions:
  •	Check Service Logs: Review the terminal output for error messages.
  •	Ensure Proper Dependencies: Make sure all Node.js dependencies are installed correctly.

4.	Invalid Order Formats
Cause: Orders submitted with incorrect JSON structure or missing fields.

Solutions:
  •	Validate JSON: Ensure that all required fields (id, clientId, type, price, quantity) are present and correctly formatted.
  •	Use JSON Validators: Utilize online tools or IDE extensions to validate JSON syntax.

Additional Tips
  •	Restart Services: Sometimes, simply restarting the Grenache router and all client instances can resolve connectivity issues.
  •	Update Dependencies: Ensure all Node.js packages are up-to-date.

npm update
