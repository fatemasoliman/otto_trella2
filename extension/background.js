import { GPTService } from './gpt_service.js';

let socket;
let connectedTabs = new Set();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Add this at the top of the file with other global variables
let contentScriptReady = new Set();

function reconnectWebSocket() {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
        setTimeout(() => {
            connectWebSocket();
            reconnectAttempts++;
        }, 5000 * (reconnectAttempts + 1)); // Exponential backoff
    } else {
        console.error('Max reconnection attempts reached. Please refresh the extension.');
    }
}

function connectWebSocket() {
    socket = new WebSocket('ws://ec2-13-60-225-182.eu-north-1.compute.amazonaws.com:8080');
    
    socket.onopen = function(event) {
        console.log('Connected to server');
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
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
            // Notify all connected content scripts about new emails
            notifyAllTabs({action: "updateEmails", emails: data.emails});
        } else if (data.type === 'newEmail') {
            // Add new email to storage
            chrome.storage.local.get('emails', function(result) {
                let emails = result.emails || [];
                emails.push(data.email);
                chrome.storage.local.set({ emails: emails }, function() {
                    console.log('New email added to storage');
                    // Notify all connected content scripts about new email
                    notifyAllTabs({action: "updateEmails", emails: emails});
                });
            });
        }
    };

    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };

    socket.onclose = function(event) {
        console.log('Disconnected from server. Attempting to reconnect...');
        reconnectWebSocket();
    };
}

function notifyAllTabs(message) {
    connectedTabs.forEach(tabId => {
        chrome.tabs.sendMessage(tabId, message, {}, response => {
            if (chrome.runtime.lastError) {
                console.log(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError);
                connectedTabs.delete(tabId);
            }
        });
    });
}

// Call this function when your extension starts
connectWebSocket();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in background:', request);
    if (request.action === 'authenticate') {
        // Implement your authentication logic here
        // For now, we'll just return a dummy token
        console.log('Authenticating...');
        setTimeout(() => {
            sendResponse({token: 'dummy_token_' + Date.now()});
        }, 1000);
        return true; // Indicates that the response will be sent asynchronously
    } else if (request.action === 'getEmails') {
        chrome.storage.local.get('emails', function(result) {
            sendResponse({ emails: result.emails || [] });
        });
        return true;
    } else if (request.action === 'processChatGPT') {
        console.log('Processing with ChatGPT...');
        processWithChatGPT(request.emailData)
            .then(formData => {
                console.log('ChatGPT processing complete. Sending response:', formData);
                sendResponse({formData: formData});
            })
            .catch(error => {
                console.error('Error in ChatGPT processing:', error);
                sendResponse({error: error.message});
            });
        return true; // Indicates that the response will be sent asynchronously
    } else if (request.action === 'contentScriptReady') {
        if (sender.tab && sender.tab.id) {
            contentScriptReady.add(sender.tab.id);
            console.log(`Content script ready in tab ${sender.tab.id}`);
        }
    }
});

// Update the chrome.action.onClicked listener
chrome.action.onClicked.addListener((tab) => {
    console.log('Extension icon clicked for tab:', tab.id);
    if (contentScriptReady.has(tab.id)) {
        chrome.tabs.sendMessage(tab.id, { action: 'toggleDrawer' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending toggleDrawer message:', chrome.runtime.lastError);
                injectContentScript(tab.id);
            } else {
                console.log('toggleDrawer message sent successfully, response:', response);
            }
        });
    } else {
        console.log('Content script not ready. Injecting content script...');
        injectContentScript(tab.id);
    }
});

// Add this function to inject the content script
function injectContentScript(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js', 'drawer.js']  // Add drawer.js here
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error injecting content script:', chrome.runtime.lastError);
        } else {
            console.log('Content script injected successfully');
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: 'toggleDrawer' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error sending toggleDrawer message after injection:', chrome.runtime.lastError);
                        // If there's an error, try again after a short delay
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tabId, { action: 'toggleDrawer' });
                        }, 500);
                    } else {
                        console.log('toggleDrawer message sent successfully after injection, response:', response);
                    }
                });
            }, 1000);
        }
    });
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // Instead of adding the tab here, wait for the contentScriptReady message
        console.log(`Tab ${tabId} has finished loading`);
    }
});

// Listen for tab removals
chrome.tabs.onRemoved.addListener((tabId) => {
    connectedTabs.delete(tabId);
    console.log(`Tab ${tabId} was removed`);
    contentScriptReady.delete(tabId);
});

// Reconnect WebSocket if it's closed
setInterval(() => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
        console.log('WebSocket is closed. Attempting to reconnect...');
        connectWebSocket();
    }
}, 60000); // Check every minute

// Update this function to use GPTService
async function processWithChatGPT(emailData) {
    console.log('Processing with ChatGPT. Email data:', emailData);
    
    const formFieldsDescription = emailData.formFields.map(field => 
        `${field.label || field.name} (${field.type})`
    ).join('\n');

    const prompt = `
        Please extract the following information from this email:
        Subject: ${emailData.subject}
        Body: ${emailData.body}

        Extract and format the following details to fill these form fields:
        ${formFieldsDescription}

        Respond with a JSON object where the keys are the field names and the values are the extracted information.
        If you can't find information for a field, leave it as an empty string.
    `;

    console.log('Prompt sent to OpenAI:', prompt);
    
    try {
        const response = await GPTService.getFormCompletion(prompt);
        console.log('OpenAI response:', response);
        return response;
    } catch (error) {
        console.error('Error processing with ChatGPT:', error);
        throw error;
    }
}

console.log('Background script loaded');