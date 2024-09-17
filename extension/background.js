import { CONFIG } from './config.js';
import { GPTService } from './gpt_service.js';

console.log('CONFIG and GPTService loaded');

// The rest of your background.js code remains the same
let contentScriptReady = new Set();

// Gmail API setup
let gapiInitialized = false;
let gisInitialized = false;
let tokenClient;

// Add this new function at the beginning of the file
function ensureContentScriptLoaded(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {action: 'ping'}, response => {
      if (chrome.runtime.lastError) {
        console.log('Content script not loaded, attempting to inject');
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['drawer.js']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error injecting content script:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            console.log('Content script injected successfully');
            setTimeout(resolve, 100);
          }
        });
      } else {
        console.log('Content script already loaded');
        resolve();
      }
    });
  });
}

// Modify the existing chrome.runtime.onMessage listener
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
        console.log('Sending emails to content script:', emails);
        sendResponse({emails: emails});
      })
      .catch(error => sendResponse({error: error.message}));
    return true;
  } else if (request.action === 'getEmailBody') {
    console.log('Fetching email body for messageId:', request.messageId);
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

// Modify the chrome.action.onClicked listener
chrome.action.onClicked.addListener((tab) => {
  ensureContentScriptLoaded(tab.id)
    .then(() => {
      chrome.tabs.sendMessage(tab.id, { action: 'toggleDrawer' });
    })
    .catch(error => {
      console.error('Failed to ensure content script is loaded:', error);
    });
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
  await clearAuthToken(); // Clear existing token
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (chrome.runtime.lastError) {
        console.error('Authentication failed:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        console.log('Authentication successful, token received');
        // Fetch user email
        fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('User info received:', data);
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
    
    const formFieldsDescription = emailData.formFields.map(field => 
        `${field.index}. ${field.label || field.name} (${field.type})`
    ).join('\n');

    const prompt = `
        Please extract the following information from this email to fill a form on the page: ${emailData.url}

        Email Subject: ${emailData.subject}
        Email Body: ${emailData.body}

        Extract and format the following details to fill these form fields:
        ${formFieldsDescription}

        You are an assistant for a logistics service provider specializing in Import/Export in Egypt. Your job is to create new loads (also known as bookings) by taking an email thread and the relevant form fields as an input and extracting the relevant data.
Some values may not be present in the email, if not found, leave blank. 
The shipper is the entity that is requesting the booking or the load. this is usually a freight forwarder or shipping line or other logistics service provider  that is requesting the load on behalf of their customer. 

Always leave the broker field blank

The container ID is a unique sequence made up of 4 letters and 7 numbers. If there are multiple container IDs, separate them with a space. The number of trucks should be equal to less than the number of containers. 

For shipper, truck type, commodity, shipping line, container type, your answer can only be one of the following values in the lists below. 

You can only have one container type and truck type per load.  If there are multiple container types or truck types, then respond with an array of JSON objects, where each element is a load. 

For export loads, the gate out date is 24 hours before the pickup date and the gate in date is 24 hours after. For import loads, the gate in date is 24 hours before the pickup date and the gate out date is 24 hours after. Identify if the load is import/export from the provided URL. 


Here's a list of possible commodities, do not respond with a commodity that is not in this list: Agricultural Waste,Barrels,Batteries,Beauty Products,Beet,Bitumen,Building Material,Cables,Carton,Cement,Ceramics,Chemicals,Coal,Corn,Crushed Stones,Dates,Deadhaul - empty,Detergents,Dolomite Powder,Electrical Appliances,Empty Containers,Equipment,Fertilizers,Fiber glasses,Fizzy Drinks,FMCG,Fridges,Frozen Food,Fruits,Glass,Grapes,Gravel,Gypsum,Iron Dust,Iron Ore,Iron Oxide,Iron Rolls,MDF,Medical equipments,Medications,Metal,Oils,Paper,Paper Bags,Parcels,Pipes,Plastics,Polymer Bags,Potatoes,Powder Paint,Raw Material,Salt,Sand,Silica Sand,Slag,Soya Bean Seeds,Spare Parts,Steel bars,Steel Products,Sugar,Sulphur,Sunflower Seeds,Textiles,Tires,Vegetables,Water,Wheat,Wood

here's a list of possible container types:  20 Dry,20 Dry Heavy,40 Dry,45 Dry,Dry 2x20,Dry 40 High Cube,Flat 20,Flat 40,Open Top 20,Open Top 40,Reefer 20,Reefer 2x20,Reefer 40,Refeer 40 High Cube


here's a list of possible shippers,  do not respond with a shipper that is not in this list: ACMA for Chemicals & Mining,Al Hussein International - Ports,ALKATHER LOGISTICS,All in Shipping Services,Aramex,ARKAS,Arma Food Industries,Arma Oils,Arma Soap & Detergents,Arma Soaps and Detegrents,Art ceramic,Ascom,Ascom Carbonate & Chemical Manufacturing,Barakat Shipping Co,Barakat Shipping Co.,Belmarine Egypt Ltd.,Blue Ocean Logistics,Ceramica Cleopatra,Ceva Egypt,City Logistics Solutions,Creative For Shipping and Logistics,Demo Shipper 2,Demo Shipper - 44,DHL,DHL Food logistics Egypt,Directions Ltd.,Dispatch Global Logistics,DP WORLD,Eddygypt Giordano Poultry Plast.,EGCT,Egyptian International Shipping Agencies & Services(EISAS),Egytrans,El Araby Co. For Cooking Appliances,EL ARABY CO FOR ENGINEERING INDUSTRIES,El Araby Co. For Trading & Manufac,El Araby Group,El Rashidi El Mizan Confectionery,ESG,Everest Egypt,Farm Fruits For Agricultural Investment,First choice for export fruits & vegetables,Flex P Films,ForeFront Trading and Export,FreePL Ports,Fruit Valley Company For Agricultural Investment,GIZA SEEDS & HERBS,Global Link,Globelink,Green Egypt Co. For Agricultural Investment,Hamburg SUD,Hapag Lloyd Egypt,Hero,ICAPP,International shipping agency,Karl Gross,Lasheen Plast,Lasheen Plastics Industries,LATT,LATT Logistics Cairo,LATT Logistics - Cairo,LG Electronics Egypt S.A.E,Lina For Land Reclamation,Link Cargo,Maersk A/S,Maersk Logistics and Services Egypt LTD,Maersk L&S Egypt Free Zone,Mansour Chevrolet Ports,Mantra Automotive Co.,MESCO,MIL,M.I.L,Milmar Shipping Company,Misr Polymers Industries,Modern bitumode (SIKA),Modern Paper for Industry,MSK,Nautic Logistics,Neptune Global Logistics,Nowlun,Pack N Move,Pack-tec,Pan Marine Logistics Services,RGS-Middle East Carbon,RoMarine,Royal Logistics Services,Royal Med,Seafrigo,SHL Elmarwa,Sidra Line Egypt,Sigma For Logistics Services,SoudanCo,Speedway,Star Shine Logistics,Suez Gulf Logistics,Teconja Egypt,test_demo,THE ARAB DAIRY PRODUCTS CO PANDA,The House,Top logistics,Total Cargo Logistics,Transmar,United Farms,United Farms - Ports,United for developed Industries,United Seas Logistics,Venus Cargo,wakalex ports,Wall Street Egypt,Wessam Shipping Line & Logistics

Here's a list of possible shipping lines,  do not respond with a shipping line that is not in this list: Admiral Shipping Line,APL,Arab shipping ,Arkas,B&G,CMA,COSCO,EFC,EVERGREEN,Hamburg Sud,Hapag-Lloyd,HLC,Inchcape,JAC,Kadmar,LATT,LBH,Maersk,Marina,Medcon,Messina,MLH,MSC,Ocean Express,ONE,OOCL,PIL,Rodymar,Safmarine ,Sealand,Tarros,Transmar,Turkon Line,Wan hai,YML,ZIM

Choose the closest match in this list, do not choose options for commodity or truck types outside of this list 

Return an array of JSONs


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

    if (response.status === 401 || response.status === 403) {
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
    if (error.message === 'Unauthorized' || error.message === 'Not authenticated') {
      console.log('Token expired or invalid, clearing and requesting re-authentication');
      await clearAuthToken();
      // Notify the content script to prompt for re-authentication
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "requireReauth"});
      });
      throw new Error('Reauthentication required');
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

function clearAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['authToken', 'userEmail'], () => {
      console.log('Auth token and user email cleared');
      resolve();
    });
  });
}

// You can call this function before attempting to authenticate again
// await clearAuthToken();
// Then call your authenticateWithGoogle function