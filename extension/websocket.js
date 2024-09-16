let socket;

export function connectWebSocket() {
  socket = new WebSocket('ws://ec2-13-60-225-182.eu-north-1.compute.amazonaws.com:8080');
  
  socket.onopen = function(event) {
    console.log('Connected to server');
    // Request emails immediately after connection
    socket.send(JSON.stringify({ type: 'getEmails' }));
  };

  socket.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);

    if (data.type === 'emails') {
      // Store emails in chrome.storage
      chrome.storage.local.set({ emails: data.emails }, function() {
        console.log('Emails stored');
      });
    } else if (data.type === 'newEmail') {
      // Add new email to storage
      chrome.storage.local.get('emails', function(result) {
        let emails = result.emails || [];
        emails.push(data.email);
        chrome.storage.local.set({ emails: emails }, function() {
          console.log('New email added to storage');
        });
      });
    }
  };

  socket.onerror = function(error) {
    console.error('WebSocket error:', error);
  };

  socket.onclose = function(event) {
    console.log('Disconnected from server. Trying to reconnect...');
    setTimeout(connectWebSocket, 5000); // Try to reconnect after 5 seconds
  };
}

export function keepAlive() {
  chrome.runtime.getPlatformInfo(() => {});
}

// Reconnect WebSocket if it's closed
setInterval(() => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    console.log('WebSocket is closed. Attempting to reconnect...');
    connectWebSocket();
  }
}, 60000); // Check every minute