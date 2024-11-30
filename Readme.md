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