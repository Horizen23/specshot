const http = require('http');
http.createServer((req, res) => {
  console.log('Test Server received:', req.method, req.url);
  res.writeHead(200);
  res.end('Hello from test server');
}).listen(3000, () => console.log('Test server on 3000'));
