Source: https://nodejs.org/api/http.html#serverclosecallback (v26.12.1)

### `server.close([callback])`

<!-- YAML
added: v0.1.90
changes:
  - version:
      - v19.0.0
    pr-url: https://github.com/nodejs/node/pull/43522
    description: The method closes idle connections before returning.

-->

* `callback` {Function}

Stops the server from accepting new connections and closes all connections
connected to this server which are not sending a request or waiting for
a response.
See [`net.Server.close()`][].

```js
const http = require('node:http');

const server = http.createServer({ keepAliveTimeout: 60000 }, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    data: 'Hello World!',
  }));
});

server.listen(8000);
// Close the server after 10 seconds
setTimeout(() => {
  server.close(() => {
    console.log('server on port 8000 closed successfully');
  });
}, 10000);
```

### `server.closeAllConnections()`

<!-- YAML
added: v18.2.0
-->

Closes all established HTTP(S) connections connected to this server, including
active connections connected to this server which are sending a request or
waiting for a response. This does _not_ destroy sockets upgraded to a different
protocol, such as WebSocket or HTTP/2.

> This is a forceful way of closing all connections and should be used with
> caution. Whenever using this in conjunction with `server.close`, calling this
> _after_ `server.close` is recommended as to avoid race conditions where new
> connections are created between a call to this and a call to `server.close`.

```js
const http = require('node:http');

const server = http.createServer({ keepAliveTimeout: 60000 }, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    data: 'Hello World!',
  }));
});

server.listen(8000);
// Close the server after 10 seconds
setTimeout(() => {
  server.close(() => {
    console.log('server on port 8000 closed successfully');
  });
  // Closes all connections, ensuring the server closes successfully
  server.closeAllConnections();
}, 10000);
```

### `server.closeIdleConnections()`

<!-- YAML
added: v18.2.0
-->

Closes all connections connected to this server which are not sending a request
or waiting for a response.

> Starting with Node.js 19.0.0, there's no need for calling this method in
> conjunction with `server.close` to reap `keep-alive` connections. Using it
> won't cause any harm though, and it can be useful to ensure backwards
> compatibility for libraries and applications that need to support versions
> older than 19.0.0. Whenever using this in conjunction with `server.close`,
> calling this _after_ `server.close` is recommended as to avoid race
> conditions where new connections are created between a call to this and a
> call to `server.close`.

```js
const http = require('node:http');

const server = http.createServer({ keepAliveTimeout: 60000 }, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    data: 'Hello World!',
  }));
});

server.listen(8000);
// Close the server after 10 seconds
setTimeout(() => {
  server.close(() => {
    console.log('server on port 8000 closed successfully');
  });
  // Closes idle connections, such as keep-alive connections. Server will close
  // once remaining active connections are terminated
  server.closeIdleConnections();
}, 10000);
```

