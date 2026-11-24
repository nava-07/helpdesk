const http = require('http');

const data = JSON.stringify({
  messages: [{ role: 'user', content: 'Testing 1 2 3' }],
  systemPrompt: 'You are a concise assistant.'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/gemini/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let responseBody = '';
  res.on('data', (chunk) => responseBody += chunk);
  res.on('end', () => console.log('Response:', responseBody));
});

req.on('error', (error) => console.error(error));
req.write(data);
req.end();
