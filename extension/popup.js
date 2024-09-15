import GPTService from './gpt_service.js';

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded');

    const authenticateButton = document.getElementById('authenticate');
    const emailList = document.getElementById('email-list');
    const emailContentView = document.getElementById('email-content-view');
    const emailSubject = document.getElementById('email-subject');
    const emailFrom = document.getElementById('email-from');
    const emailBody = document.getElementById('email-body');
    const formFieldsContainer = document.getElementById('form-fields-container');
    const fillFormButton = document.getElementById('fill-form-with-otto');

    const toggleTextInputButton = document.getElementById('toggle-text-input');
    const textInputWrapper = document.getElementById('text-input-wrapper');
    const customTextInput = document.getElementById('custom-text-input');
    const emailListContainer = document.getElementById('email-list-container');

    toggleTextInputButton.addEventListener('click', function() {
        if (textInputWrapper.style.display === 'none') {
            textInputWrapper.style.display = 'flex';
            emailListContainer.style.display = 'none';
            this.textContent = 'Show emails';
        } else {
            textInputWrapper.style.display = 'none';
            emailListContainer.style.display = 'block';
            this.textContent = 'Paste email here';
        }
    });
    
    function showAuthButton() {
        authenticateButton.style.display = 'block';
        emailList.innerHTML = '<p>Please sign in to view your emails.</p>';
    }

    function hideAuthButton() {
        authenticateButton.style.display = 'none';
    }

    fillFormButton.addEventListener('click', function() {
        const selectedEmail = document.querySelector('.email-item.selected');
        if (selectedEmail) {
            const emailBody = selectedEmail.getAttribute('data-body');
            fillFormWithGPT(emailBody);
        } else if (customTextInput.value.trim()) {
            fillFormWithGPT(customTextInput.value.trim());
        } else {
            console.log('No email selected and no custom text entered');
            alert('Please select an email or paste an email in the text area first.');
        }
    });

    function getAuthToken() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['access_token', 'token_expiry', 'refresh_token'], function(items) {
                const currentTime = Date.now();
    
                if (items.access_token && currentTime < items.token_expiry) {
                    // Token is valid, resolve with the existing token
                    resolve(items.access_token);
                } else if (items.refresh_token) {
                    // Token is expired, refresh it
                    refreshAccessToken(items.refresh_token)
                        .then(newToken => resolve(newToken))
                        .catch(error => reject('Failed to refresh token: ' + error));
                } else {
                    // No valid token or refresh token, need to re-authenticate
                    chrome.runtime.sendMessage({action: 'getToken'}, function(response) {
                        if (response && response.token) {
                            saveAuthToken(response.token);
                            resolve(response.token);
                        } else {
                            reject(response ? response.error : 'Failed to get token');
                        }
                    });
                }
            });
        });
    }
    
    function refreshAccessToken(refreshToken) {
        return new Promise((resolve, reject) => {
            fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    'client_id': 'YOUR_CLIENT_ID',
                    'client_secret': 'YOUR_CLIENT_SECRET',
                    'refresh_token': refreshToken,
                    'grant_type': 'refresh_token'
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.access_token) {
                    saveAuthToken(data.access_token, data.expires_in);
                    resolve(data.access_token);
                } else {
                    reject(data.error || 'Failed to refresh token');
                }
            })
            .catch(error => {
                reject('Error refreshing token: ' + error.message);
            });
        });
    }
    
    function saveAuthToken(token, expiresIn = 3600) {
        const expirationTime = Date.now() + expiresIn * 1000;
        chrome.storage.local.set({
            'access_token': token,
            'token_expiry': expirationTime
        });
    }
    
    function fetchEmails(token) {
        console.log('Fetching emails...');
        if (!emailList) {
            console.error('Email list element not found');
            return;
        }
    
        emailList.innerHTML = '<p>Loading emails...</p>';
        console.log('Sending request to Gmail API...');
    
        const query = 'to:ports-requests@trella.app';
        fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(response => {
            if (response.status === 401) {
                // Token might be expired, try to refresh it
                return refreshAccessToken(token).then(newToken => {
                    return fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`, {
                        headers: {
                            'Authorization': 'Bearer ' + newToken
                        }
                    });
                });
            }
            return response;
        })
        .then(response => response.json())
        .then(data => {
            console.log('Parsed Gmail API response:', data);
            emailList.innerHTML = '';
            if (data.messages && data.messages.length > 0) {
                console.log(`Found ${data.messages.length} emails`);
                data.messages.forEach(message => {
                    console.log('Fetching details for message:', message.id);
                    fetchEmailDetails(token, message.id);
                });
            } else {
                console.log('No emails found');
                emailList.innerHTML = '<p>No emails found.</p>';
            }
        })
        .catch(error => {
            console.error('Error fetching emails:', error);
            emailList.innerHTML = `<p>Error fetching emails: ${error.message}</p>`;
        });
    }

function decodeBase64(encoded) {
    return decodeURIComponent(escape(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))));
}

function addEmailToList(id, subject, from, body, timestamp) {
    console.log(`Adding email to list: ${subject}`);
    const emailItem = document.createElement('div');
    emailItem.className = 'email-item';
    emailItem.setAttribute('data-body', body);
    emailItem.innerHTML = `
        <strong>${subject}</strong><br>
        <span class="email-from">${from}</span><br>
        <span class="email-timestamp">${timestamp}</span>
    `;

    emailItem.addEventListener('click', function() {
        document.querySelectorAll('.email-item').forEach(item => item.classList.remove('selected'));
        this.classList.add('selected');
        showEmailContent(subject, from, body, timestamp);
        if (formFieldsContainer) {
            formFieldsContainer.style.display = 'block';
        }
    });

    emailList.appendChild(emailItem);
    console.log('Email added to list');
}
function getEmailBody(payload) {
    console.log('Parsing email payload:', payload);

    if (payload.parts) {
        console.log('Email has parts');
        return getBodyFromParts(payload.parts);
    } else if (payload.body) {
        console.log('Email has body directly');
        return decodeBody(payload.body);
    }

    console.log('No recognizable body structure found');
    return 'No body content found';
}

function getBodyFromParts(parts) {
    let htmlPart = parts.find(part => part.mimeType === 'text/html');
    if (htmlPart) {
        console.log('Found HTML part');
        return decodeBody(htmlPart.body);
    }

    let plainTextPart = parts.find(part => part.mimeType === 'text/plain');
    if (plainTextPart) {
        console.log('Found plain text part');
        return decodeBody(plainTextPart.body);
    }

    // If no text parts found, recursively check for nested parts
    for (let part of parts) {
        if (part.parts) {
            console.log('Checking nested parts');
            let nestedBody = getBodyFromParts(part.parts);
            if (nestedBody !== 'No body content found') {
                return nestedBody;
            }
        }
    }

    return 'No body content found';
}

function decodeBody(body) {
    if (body.data) {
        console.log('Decoding body data');
        return decodeBase64(body.data);
    } else if (body.attachmentId) {
        console.log('Body is an attachment, not supported in this version');
        return 'Body is an attachment. Cannot display.';
    }
    return 'No body content found';
}

function decodeBase64(encoded) {
    try {
        return decodeURIComponent(escape(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (error) {
        console.error('Error decoding base64:', error);
        return 'Error decoding email content';
    }
}

function fetchEmailDetails(token, messageId) {
    console.log(`Fetching details for email ${messageId}`);
    fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
        headers: {
            'Authorization': 'Bearer ' + token
        }
    })
    .then(response => {
        if (response.status === 401) {
            // Token might be expired, try to refresh it
            return refreshAccessToken(token).then(newToken => {
                return fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
                    headers: {
                        'Authorization': 'Bearer ' + newToken
                    }
                });
            });
        }
        return response;
    })
    .then(response => response.json())
    .then(data => {
        console.log(`Received details for email ${messageId}:`, data);
        const subject = data.payload.headers.find(header => header.name.toLowerCase() === 'subject')?.value || 'No Subject';
        const from = data.payload.headers.find(header => header.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
        const body = getEmailBody(data.payload);
        const timestamp = new Date(parseInt(data.internalDate)).toLocaleString();
        addEmailToList(messageId, subject, from, body, timestamp);
    })
    .catch(error => {
        console.error(`Error fetching email details for ${messageId}:`, error);
    });
}

function showEmailContent(subject, from, body, timestamp) {
    console.log('Showing email content:', { subject, from, timestamp });
    console.log('Body preview:', body.substring(0, 100));  // Log first 100 characters of body

    emailSubject.textContent = subject;
    emailFrom.textContent = `From: ${from}`;
    emailBody.innerHTML = `
        <p style="margin-top: -20px; font-size: 0.8em;">Date: ${timestamp}</p>
        <div class="email-body-content" style="margin-top: -10px; line-height: 1.2; white-space: pre-wrap; word-wrap: break-word;">${body}</div>
    `;
    emailContentView.style.display = 'block';
}




    authenticateButton.addEventListener('click', function() {
        console.log('Authenticate button clicked');
        chrome.runtime.sendMessage({action: 'authenticate'}, function(response) {
            console.log('Received authentication response:', response);
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
            }
            if (response && response.token) {
                console.log('Authentication successful, hiding button and fetching emails');
                hideAuthButton();
                fetchEmails(response.token);
            } else {
                console.error('Authentication failed:', response ? response.error : 'Unknown error');
                emailList.innerHTML = `<p>Authentication failed: ${response ? response.error : 'Unknown error'}</p>`;
            }
        });
    });

    function requestFormFields() {
        console.log('Requesting form fields from content script via background');
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({action: "getFormFields"}, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('Error:', chrome.runtime.lastError);
                    resolve([]);
                } else {
                    console.log('Received form fields:', response);
                    resolve(response || []);
                }
            });
        });
    }

    async function fillFormWithGPT(emailBody) {
        try {
            const formFields = await requestFormFields();
            console.log('Form fields for GPT analysis:', formFields);
    
            if (formFields.length === 0) {
                console.log('No form fields available. Skipping GPT analysis.');
                alert('No form fields detected on the current page. Please make sure you are on the correct page with the form.');
                return;
            }
    
            const completedFields = await GPTService.getFormCompletion(emailBody, formFields);
            console.log('GPT analysis result:', completedFields);
    
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "autofillForm",
                    formData: completedFields
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('Error autofilling form:', chrome.runtime.lastError);
                        alert('An error occurred while autofilling the form. Please try again or fill the form manually.');
                    } else if (response && response.success) {
                        console.log('Form autofilled successfully');
                        alert('Form has been autofilled based on the email content.');
                    } else {
                        console.error('Autofill response not successful:', response);
                        alert('Unable to autofill the form. Please try again or fill the form manually.');
                    }
                });
            });
        } catch (error) {
            console.error('Error in fillFormWithGPT:', error);
            alert('An error occurred while processing the email. Please try again or fill the form manually.');
        }
    }

    function init() {
        console.log('Initializing popup');
        getAuthToken()
            .then(token => {
                console.log('Got auth token:', token ? 'Yes' : 'No');
                if (token) {
                    if (authenticateButton) authenticateButton.style.display = 'none';
                    fetchEmails(token);
                } else {
                    if (authenticateButton) authenticateButton.style.display = 'block';
                }
            })
            .catch(error => {
                console.error('Error getting token:', error);
                if (authenticateButton) authenticateButton.style.display = 'block';
            });
    }

    init();
});