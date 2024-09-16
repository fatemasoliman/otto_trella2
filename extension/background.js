import { GPTService } from './gpt_service.js';

let contentScriptReady = new Set();

// Gmail API setup
let gapiInitialized = false;
let gisInitialized = false;
let tokenClient;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in background:', request);
    if (request.action === 'authenticate') {
        console.log('Starting authentication process');
        authenticateUser()
            .then(token => {
                console.log('Authentication successful, token:', token);
                chrome.storage.local.set({ authToken: token }, () => {
                    console.log('Token saved to storage');
                    sendResponse({token: token});
                });
            })
            .catch(error => {
                console.error('Authentication failed:', error);
                sendResponse({error: error.message});
            });
        return true; // Indicates that the response is asynchronous
    } else if (request.action === 'getEmails') {
        fetchEmailsFromServer()
            .then(emails => sendResponse({emails: emails}))
            .catch(error => sendResponse({error: error.message}));
        return true;
    } else if (request.action === 'getEmailDetails') {
        fetchEmailDetailsFromGmail(request.emailId)
            .then(email => sendResponse({email: email}))
            .catch(error => sendResponse({error: error.message}));
        return true;
    } else if (request.action === 'processChatGPT') {
        processWithChatGPT(request.emailData)
            .then(formData => sendResponse({formData: formData}))
            .catch(error => sendResponse({error: error.message}));
        return true;
    } else if (request.action === 'contentScriptReady') {
        if (sender.tab && sender.tab.id) {
            contentScriptReady.add(sender.tab.id);
            console.log(`Content script ready in tab ${sender.tab.id}`);
        }
    }
});

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

function injectContentScript(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error injecting content script:', chrome.runtime.lastError);
        } else {
            console.log('Content script injected successfully');
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: 'toggleDrawer' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error sending toggleDrawer message after injection:', chrome.runtime.lastError);
                    } else {
                        console.log('toggleDrawer message sent successfully after injection, response:', response);
                    }
                });
            }, 10000);
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

async function authenticateUser() {
    console.log('Authenticating user...');
    await initializeGoogleAuth();
    return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp) => {
            if (resp.error !== undefined) {
                reject(resp);
            }
            resolve(resp.access_token);
        };
        tokenClient.requestAccessToken({prompt: 'consent'});
    });
}

async function initializeGoogleAuth() {
    if (!gapiInitialized) {
        await new Promise((resolve, reject) => {
            gapi.load('client', {callback: resolve, onerror: reject});
        });
        await gapi.client.init({
            apiKey: YOUR_API_KEY,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'],
        });
        gapiInitialized = true;
    }

    if (!gisInitialized) {
        await new Promise((resolve, reject) => {
            gapi.load('client', {callback: resolve, onerror: reject});
        });
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: YOUR_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/gmail.readonly',
            callback: '', // defined later
        });
        gisInitialized = true;
    }
}

async function fetchEmailsFromServer() {
    const { authToken } = await chrome.storage.local.get('authToken');
    if (!authToken) {
        throw new Error('Not authenticated');
    }

    const response = await fetch('http://ec2-13-51-0-115.eu-north-1.compute.amazonaws.com:8080/email', {
        headers: {
            'Authorization': `Bearer ${authToken}`,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch emails');
    }

    const emails = await response.json();
    return emails.map(email => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        timestamp: email.timestamp,
        messageId: email.messageId  // Changed from gmailId to messageId
    }));
}

async function fetchEmailDetailsFromGmail(messageId) {
    await initializeGoogleAuth();
    const response = await gapi.client.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
    });

    return processGmailMessage(response.result);
}

function processGmailMessage(message) {
    const headers = message.payload.headers;
    const subject = headers.find(header => header.name === 'Subject').value;
    const from = headers.find(header => header.name === 'From').value;
    const body = decodeBody(message.payload);

    return {
        subject,
        from,
        body
    };
}

function decodeBody(payload) {
    if (payload.body.data) {
        return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    } else if (payload.parts) {
        return payload.parts
            .filter(part => part.mimeType === 'text/plain')
            .map(part => atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')))
            .join('\n');
    }
    return '';
}

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