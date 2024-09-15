chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message in background script:', request);
  if (request.action === 'authenticate') {
    authenticate()
      .then(token => {
        console.log('Authentication successful, token:', token);
        sendResponse({ token: token });
      })
      .catch(error => {
        console.error('Authentication failed:', error);
        if (error && error.message) {
          console.error('Detailed error:', error.message);
        }
        sendResponse({ error: error.message || 'Unknown error occurred' });
      });
    return true; // Indicates that the response will be sent asynchronously
  }
});

function authenticate() {
  console.log('Authenticate function called');
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (chrome.runtime.lastError) {
        console.error('getAuthToken error:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        console.log('getAuthToken result:', token ? 'Token received' : 'No token');
        resolve(token);
      }
    });
  });
}

function connectWebSocket() {
  const socket = new WebSocket('wss://your-env-name.elasticbeanstalk.com');
  
  socket.onopen = function(event) {
    console.log('Connected to server');
  };

  socket.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.message) {
      console.log('Received message from server:', data.message);
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "updateUI", message: data.message});
      });
    }
  };

  socket.onerror = function(error) {
    console.error('WebSocket error:', error);
  };

  socket.onclose = function(event) {
    console.log('Disconnected from server');
    setTimeout(connectWebSocket, 5000);
  };

  return socket;
}

let socket;

function ensureConnection() {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    socket = connectWebSocket();
  }
}

// Try to connect immediately
ensureConnection();

// Attempt to reconnect every 30 seconds
setInterval(ensureConnection, 30000);

// Function to fetch emails from the server
function fetchEmails() {
  return fetch('http://ec2-13-60-225-182.eu-north-1.compute.amazonaws.com:8080/email')
    .then(response => response.json())
    .catch(error => {
      console.error('Error fetching emails:', error);
      return [];
    });
}

// Function to update the extension's UI with fetched emails
function updateUI(emails) {
  chrome.runtime.sendMessage({ action: 'updateEmails', emails: emails });
}

// Fetch emails periodically (e.g., every 30 seconds)
function startEmailFetching() {
  fetchEmails().then(updateUI);
  setInterval(() => {
    fetchEmails().then(updateUI);
  }, 30000);
}

// Start fetching emails when the extension is loaded
startEmailFetching();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getEmails') {
    fetchEmails().then(emails => {
      sendResponse({ emails: emails });
    });
    return true; // Indicates that the response is asynchronous
  }
});