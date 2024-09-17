import { CONFIG } from './config.js';
import { GPTService } from './gpt_service.js';

console.log('CONFIG and GPTService loaded');

// The rest of your background.js code remains the same
let contentScriptReady = new Set();

// Gmail API setup
let gapiInitialized = false;
let gisInitialized = false;
let tokenClient;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in background:', request);
    if (request.action === 'authenticateWithGoogle') {
        authenticateWithGoogle()
            .then(response => {
                console.log('Authentication response:', response);
                sendResponse(response);
            })
            .catch(error => {
                console.error('Authentication failed:', error);
                sendResponse({success: false, error: error.message});
            });
        return true; // Indicates that the response is asynchronous
    } else if (request.action === 'getEmails') {
        fetchEmailIdsFromServer()
            .then(emails => {
                console.log('Sending emails to content script:', emails); // Add this line
                sendResponse({emails: emails});
            })
            .catch(error => sendResponse({error: error.message}));
        return true;
    } else if (request.action === 'getEmailBody') {
        console.log('Fetching email body for messageId:', request.messageId); // Add this line
        fetchEmailBodyFromGmail(request.messageId)
            .then(body => sendResponse({body: body}))
            .catch(error => {
                if (error.message === 'Not authenticated') {
                    sendResponse({error: 'reauthentication_required'});
                } else {
                    sendResponse({error: error.message});
                }
            });
        return true;
    } else if (request.action === 'processChatGPT') {
        processWithChatGPT(request.emailData)
            .then(response => {
                console.log('Sending response back to content script:', response);
                sendResponse(response);
            })
            .catch(error => {
                console.error('Error in processWithChatGPT:', error);
                sendResponse({error: error.message});
            });
        return true; // Indicates that the response is asynchronous
    } else if (request.action === 'contentScriptReady') {
        if (sender.tab && sender.tab.id) {
            contentScriptReady.add(sender.tab.id);
            console.log(`Content script ready in tab ${sender.tab.id}`);
        }
    } else if (request.action === 'login') {
        console.log('Login request received:', request);
        login(request.username, request.password)
            .then(response => {
                console.log('Login response:', response);
                sendResponse(response);
            })
            .catch(error => {
                console.error('Login error:', error);
                sendResponse({ success: false, message: error.message });
            });
        return true; // Indicates that the response is asynchronous
    } else if (request.action === 'clearEmail') {
        clearEmailOnServer(request.id)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    } else if (request.action === 'markEmailAsDone') {
        markEmailAsDoneOnServer(request.id)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('OttoFill extension installed');
});

chrome.action.onClicked.addListener((tab) => {
  injectContentScriptIfNeeded(tab.id);
});

function injectContentScriptIfNeeded(tabId) {
  chrome.tabs.sendMessage(tabId, {action: 'ping'}, response => {
    if (chrome.runtime.lastError) {
      // Content script is not injected yet, so inject it
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['drawer.js']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error injecting content script:', chrome.runtime.lastError);
        } else {
          console.log('Content script injected successfully');
          // Wait a bit for the content script to initialize
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'toggleDrawer' });
          }, 100);
        }
      });
    } else {
      // Content script is already injected, just toggle the drawer
      chrome.tabs.sendMessage(tabId, { action: 'toggleDrawer' });
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        console.log(`Tab ${tabId} has finished loading`);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    contentScriptReady.delete(tabId);
    console.log(`Tab ${tabId} was removed`);
});

async function authenticateWithGoogle() {
    console.log('Authenticating user with Google...');
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, function(token) {
            if (chrome.runtime.lastError) {
                console.error('Authentication failed:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                console.log('Authentication successful, token:', token);
                // Fetch user email
                fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                .then(response => response.json())
                .then(data => {
                    chrome.storage.local.set({ authToken: token, userEmail: data.email }, () => {
                        console.log('Token and email saved to storage');
                        resolve({ success: true, email: data.email });
                    });
                })
                .catch(error => {
                    console.error('Error fetching user info:', error);
                    reject(error);
                });
            }
        });
    });
}

async function fetchEmailIdsFromServer() {
    const { authToken, userEmail } = await chrome.storage.local.get(['authToken', 'userEmail']);
    if (!authToken || !userEmail) {
        throw new Error('Not authenticated');
    }

    try {
        console.log('Fetching emails from server...');
        const response = await fetch('http://ec2-13-51-0-115.eu-north-1.compute.amazonaws.com:8080/email', {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'User-Email': userEmail
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch email IDs from server: ${response.statusText}. Error: ${errorText}`);
        }

        const data = await response.json();
        console.log('Fetched emails:', data);
        return data; // Return the full email objects
    } catch (error) {
        console.error('Error fetching email IDs:', error);
        throw error;
    }
}

async function fetchEmailsFromGmail(messageIds) {
    const { authToken } = await chrome.storage.local.get('authToken');
    if (!authToken) {
        throw new Error('Not authenticated');
    }

    const emails = await Promise.all(messageIds.map(async (messageId) => {
        try {
            const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token might have expired, try to refresh
                    await refreshAuthToken();
                    return fetchEmailsFromGmail([messageId]); // Retry with refreshed token
                }
                console.warn(`Failed to fetch email ${messageId}: ${response.statusText}`);
                return null; // Return null for failed fetches
            }

            const data = await response.json();
            return processGmailMessage(data);
        } catch (error) {
            console.error(`Error fetching email ${messageId}:`, error);
            return null; // Return null for any errors
        }
    }));

    // Filter out null values (failed fetches)
    return emails.filter(email => email !== null);
}

async function refreshAuthToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, function(token) {
            if (chrome.runtime.lastError) {
                console.error('Failed to refresh token:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                chrome.storage.local.set({ authToken: token }, () => {
                    console.log('Token refreshed and saved');
                    resolve(token);
                });
            }
        });
    });
}

function processGmailMessage(message) {
    const headers = message.payload.headers;
    const subject = headers.find(header => header.name === 'Subject')?.value || 'No Subject';
    const from = headers.find(header => header.name === 'From')?.value || 'Unknown Sender';
    const snippet = message.snippet || '';

    return {
        id: message.id,
        subject,
        from,
        snippet,
    };
}

function decodeEmailBody(message) {
    let body = '';

    // Function to decode base64 content and handle UTF-8
    const decodeBase64 = (encoded) => {
        try {
            return decodeURIComponent(escape(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))));
        } catch (e) {
            console.error('Error decoding base64:', e);
            return atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
        }
    };

    if (message.payload.parts) {
        // Multi-part message
        for (const part of message.payload.parts) {
            if (part.mimeType === 'text/html' && part.body.data) {
                body = decodeBase64(part.body.data);
                break;
            } else if (part.mimeType === 'text/plain' && part.body.data) {
                body = `<pre>${decodeBase64(part.body.data)}</pre>`;
                break;
            } else if (part.parts) {
                // Recursive call for nested parts
                body = decodeEmailBody({ payload: part });
                if (body) break;
            }
        }
    } else if (message.payload.body.data) {
        // Single part message
        body = decodeBase64(message.payload.body.data);
    }

    // If body is HTML, keep it as is. If it's plain text, wrap in <pre> tags.
    if (body && !body.trim().startsWith('<')) {
        body = `<pre>${body}</pre>`;
    }

    // If still no body, check for attachments or other content
    if (!body) {
        const attachments = message.payload.parts ? message.payload.parts.filter(part => part.filename && part.filename.length > 0) : [];
        if (attachments.length > 0) {
            body = `<p>This email contains ${attachments.length} attachment(s).</p>`;
        } else {
            body = '<p>This email does not contain readable text content.</p>';
        }
    }

    return body || '<p>No readable content</p>';
}

async function processWithChatGPT(emailData) {
    console.log('Processing with OpenAI Assistant. Email data:', emailData);
    
    const formFieldsDescription = emailData.formFields.map((field, index) => 
        `${index + 1}. ${field.label || field.name} (${field.type})`
    ).join('\n');

    const prompt = `
        Please extract the following information from this email to fill a form on the page: ${emailData.url}

        Email Subject: ${emailData.subject}
        Email Body: ${emailData.body}

        Extract and format the following details to fill these form fields:
        ${formFieldsDescription}

        Respond with a JSON object where the keys are the field numbers (1, 2, 3, etc.) and the values are the extracted information.
        If you can't find information for a field, leave it as an empty string.

        Important: You can only have one container ID per load. If there are multiple container ID's, then respond with an array of JSON objects, where each element is a load.

        Consider the context of the page URL when extracting and formatting the information.
    `;

    console.log('Prompt sent to OpenAI Assistant:', prompt);
    
    try {
        const rawResponse = await GPTService.getFormCompletion(prompt);
        console.log('Raw OpenAI Assistant response:', rawResponse);

        // Strip out Markdown formatting
        const jsonString = rawResponse.replace(/```json\n|\n```/g, '').trim();

        // Attempt to parse the response
        let response;
        try {
            response = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('Error parsing OpenAI response:', parseError);
            return { error: 'Failed to parse OpenAI response: ' + parseError.message };
        }

        console.log('Parsed OpenAI Assistant response:', response);
        
        // Ensure the response is an object with numeric keys or an array of objects
        let formattedResponse;
        if (Array.isArray(response)) {
            formattedResponse = response;
        } else {
            formattedResponse = {};
            for (const [key, value] of Object.entries(response)) {
                const numericKey = parseInt(key, 10);
                if (!isNaN(numericKey)) {
                    formattedResponse[numericKey - 1] = value; // Adjust to 0-based index
                }
            }
        }
        
        return { formData: formattedResponse };
    } catch (error) {
        console.error('Error processing with OpenAI Assistant:', error);
        return { error: error.message || 'Unknown error occurred' };
    }
}

async function login(username, password) {
    console.log('Attempting login with:', { username, password });
    const response = await fetch('http://ec2-13-51-0-115.eu-north-1.compute.amazonaws.com:8080/auth', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
        throw new Error('Login failed');
    }

    const data = await response.json();
    console.log('Login successful, token:', data.token);
    
    // Save the token to storage
    await chrome.storage.local.set({ authToken: data.token });
    
    return { success: true, token: data.token };
}

async function fetchEmailBodyFromGmail(messageId) {
    console.log('Fetching email body for messageId:', messageId);
    if (!messageId) {
        throw new Error('Invalid messageId: ' + messageId);
    }

    async function attemptFetch(token) {
        const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (response.status === 401) {
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gmail API response:', response.status, errorText);
            throw new Error(`Failed to fetch email body from Gmail: ${response.statusText}`);
        }

        const data = await response.json();
        return decodeEmailBody(data);
    }

    try {
        const { authToken } = await chrome.storage.local.get('authToken');
        if (!authToken) {
            throw new Error('Not authenticated');
        }

        return await attemptFetch(authToken);
    } catch (error) {
        if (error.message === 'Unauthorized') {
            console.log('Token expired, refreshing...');
            const newToken = await refreshAuthToken();
            return await attemptFetch(newToken);
        }
        console.error('Error fetching email body:', error);
        throw error;
    }
}

async function clearEmailOnServer(id) {
    console.log('Attempting to clear email with id:', id);
    if (!id) {
        console.error('id is undefined or null');
        throw new Error('Invalid id');
    }
    const { authToken } = await chrome.storage.local.get('authToken');
    if (!authToken) {
        throw new Error('Not authenticated');
    }

    try {
        console.log(`Sending clear request to server for id: ${id}`);
        const response = await fetch(`http://ec2-13-51-0-115.eu-north-1.compute.amazonaws.com:8080/email/${id}/clear`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server response:', response.status, errorText);
            if (response.status === 404) {
                throw new Error('Email not found');
            }
            throw new Error(`Failed to clear email on server: ${response.statusText}. Error: ${errorText}`);
        }

        const data = await response.json();
        console.log('Server response for clear email:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Error clearing email on server:', error);
        throw error;
    }
}

async function markEmailAsDoneOnServer(id) {
    console.log('Attempting to mark email as done with id:', id);
    const { authToken } = await chrome.storage.local.get('authToken');
    if (!authToken) {
        throw new Error('Not authenticated');
    }

    try {
        console.log(`Sending mark as done request to server for id: ${id}`);
        const response = await fetch(`http://ec2-13-51-0-115.eu-north-1.compute.amazonaws.com:8080/email/${id}/done`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server response:', response.status, errorText);
            if (response.status === 404) {
                throw new Error('Email not found');
            }
            throw new Error(`Failed to mark email as done on server: ${response.statusText}. Error: ${errorText}`);
        }

        const data = await response.json();
        console.log('Server response for mark email as done:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Error marking email as done on server:', error);
        throw error;
    }
}