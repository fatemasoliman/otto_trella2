const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Add this route handler for the root path
app.get('/', (req, res) => {
  console.log('Handling GET request on /');
  res.send('Hello from OttoFill server!');
});

// Add this GET route to fetch all emails
app.get('/email', (req, res) => {
  console.log('Received GET request to fetch all emails');
  res.status(200).json(emails);
});

// In-memory storage for emails (replace with a database in production)
let emails = [];

// Endpoint to receive emails from Google Workspace add-on
app.post('/email', (req, res) => {
  console.log('Received request:', req.body);
  const { subject, from, timestamp, body } = req.body;
  const newEmail = { subject, from, timestamp, body };
  emails.push(newEmail);
  console.log('Received new email:', newEmail);
  res.status(200).send('Email received');

  // Notify all connected WebSocket clients about the new email
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'newEmail', email: newEmail }));
    }
  });
});

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    console.log('Received:', data);

    if (data.type === 'getEmails') {
      ws.send(JSON.stringify({ type: 'emails', emails: emails }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

// Add middleware to log requests
app.use((req, res, next) => {
  console.log(`Received ${req.method} request on ${req.path}`);
  next();
});