let drawerOpen = true;
let currentUser = null;
let selectedEmail = null;
let isResizing = false;
let startX;
let startWidth;

function createDrawer() {
  const drawer = document.createElement('div');
  drawer.id = 'ottofill-drawer';
  drawer.innerHTML = `
    <div id="ottofill-tab" class="drawer-tab"><img src="${chrome.runtime.getURL('logo.png')}" alt="OttoFill"></div>
    <div class="drawer-content">
      <h2 class="ottofill-header">OttoFill</h2>
      <div id="login-container">
        <button id="login-button">Log in with Gmail</button>
      </div>
      <div id="email-container" style="display: none;">
        <div id="email-list-container">
          <ul id="emailList"></ul>
        </div>
        <div id="email-preview-container">
          <h3 id="preview-subject"></h3>
          <p id="preview-from"></p>
          <div id="preview-body"></div>
        </div>
      </div>
      <button id="ottofill-button" disabled>OttoFill</button>
    </div>
  `;

  document.body.appendChild(drawer);

  const tab = drawer.querySelector('#ottofill-tab');
  tab.addEventListener('mousedown', initResize);
  tab.addEventListener('dblclick', toggleDrawer);

  const ottofillButton = drawer.querySelector('#ottofill-button');
  ottofillButton.addEventListener('click', handleOttoFill);

  const loginButton = document.getElementById('login-button');
  loginButton.addEventListener('click', authenticate);

  checkAuthentication();
}

function checkAuthentication() {
  chrome.storage.local.get(['authToken', 'userEmail'], (result) => {
    if (result.authToken && result.userEmail) {
      currentUser = result.userEmail;
      showEmailList();
    } else {
      showLoginButton();
    }
  });
}

function showLoginButton() {
  document.getElementById('login-container').style.display = 'block';
  document.getElementById('email-container').style.display = 'none';
}

function showEmailList() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('email-container').style.display = 'block';
  fetchEmails();
}

function authenticate() {
  chrome.runtime.sendMessage({ action: 'authenticateWithGoogle' }, response => {
    if (response.success) {
      currentUser = response.email;
      showEmailList();
    } else {
      alert('Authentication failed: ' + (response.error || 'Unknown error'));
    }
  });
}

async function fetchEmails() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getEmails' });
    console.log('Fetched emails response:', response);
    if (response.emails) {
      // Filter emails for the current user
      const userEmails = response.emails.filter(email => email.user === currentUser);
      displayEmails(userEmails);
    } else {
      console.error('Failed to fetch emails:', response.error);
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
  }
}

function displayEmails(emails) {
  console.log('Displaying emails:', emails);
  const emailList = document.getElementById('emailList');
  emailList.innerHTML = '';
  if (!emails || emails.length === 0) {
    emailList.innerHTML = '<li>No emails available</li>';
    return;
  }
  emails.forEach((email, index) => {
    console.log(`Processing email ${index}:`, email);
    if (email && email.id) {
      const li = document.createElement('li');
      li.setAttribute('data-email-id', email.id);
      li.setAttribute('data-message-id', email.messageId);
      li.innerHTML = `
        <span class="email-subject">${email.subject || 'No subject'}</span>
        <div class="email-actions">
          <span class="icon-button done-email-btn">✓</span>
          <span class="icon-button clear-email-btn">✕</span>
        </div>
      `;
      li.querySelector('.email-subject').addEventListener('click', () => selectEmail(email.id, email.messageId));
      li.querySelector('.done-email-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Marking as done, id:', email.id);
        markEmailAsDone(email.id);
      });
      li.querySelector('.clear-email-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Clearing email, id:', email.id);
        clearEmail(email.id);
      });
      emailList.appendChild(li);
    } else {
      console.error('Invalid email object:', email);
    }
  });
}

async function selectEmail(id, messageId) {
    try {
        // First, fetch the email details
        const emailResponse = await chrome.runtime.sendMessage({ action: 'getEmails' });
        if (emailResponse.emails) {
            selectedEmail = emailResponse.emails.find(email => email.id === id);
            if (!selectedEmail) {
                throw new Error('Email not found');
            }
        } else {
            throw new Error('Failed to fetch email details');
        }

        // Then, fetch the email body using messageId
        const bodyResponse = await chrome.runtime.sendMessage({ action: 'getEmailBody', messageId: messageId });
        if (bodyResponse.error === 'reauthentication_required') {
            alert('Your session has expired. Please sign in again.');
            await authenticate();
            // Retry fetching the email body after reauthentication
            const retryBodyResponse = await chrome.runtime.sendMessage({ action: 'getEmailBody', messageId: messageId });
            if (retryBodyResponse.body) {
                selectedEmail.body = retryBodyResponse.body;
            } else {
                throw new Error('Failed to fetch email body after reauthentication');
            }
        } else if (bodyResponse.body) {
            selectedEmail.body = bodyResponse.body;
        } else {
            throw new Error('Failed to fetch email body');
        }

        displayEmailPreview(selectedEmail);
        document.getElementById('ottofill-button').disabled = false;
    } catch (error) {
        console.error('Error selecting email:', error);
        alert('Failed to load email. Please try again.');
    }
}

function displayEmailPreview(email) {
  const subjectElement = document.getElementById('preview-subject');
  const fromElement = document.getElementById('preview-from');
  const bodyElement = document.getElementById('preview-body');

  subjectElement.textContent = email.subject;
  fromElement.textContent = `From: ${email.from}`;
  
  // Create a new div to hold the email content
  const contentDiv = document.createElement('div');
  
  // Set the innerHTML of the new div to the email body
  contentDiv.innerHTML = email.body;
  
  // Remove any potentially harmful scripts
  const scripts = contentDiv.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    scripts[i].parentNode.removeChild(scripts[i]);
  }
  
  // Remove existing style tags
  const styles = contentDiv.getElementsByTagName('style');
  for (let i = styles.length - 1; i >= 0; i--) {
    styles[i].parentNode.removeChild(styles[i]);
  }
  
  // Create a new style element
  const style = document.createElement('style');
  style.textContent = `
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  `;
  
  // Append the style and content to the body element
  bodyElement.innerHTML = '';
  bodyElement.appendChild(style);
  bodyElement.appendChild(contentDiv);

  document.getElementById('email-preview-container').style.display = 'block';
  adjustPreviewHeight();
}

function adjustPreviewHeight() {
  const emailContainer = document.getElementById('email-container');
  const previewContainer = document.getElementById('email-preview-container');
  const listContainer = document.getElementById('email-list-container');
  const ottofillButton = document.getElementById('ottofill-button');

  if (previewContainer.style.display !== 'none') {
    const containerHeight = emailContainer.offsetHeight;
    const listHeight = containerHeight * 0.25; // 25% of the container height
    const buttonHeight = ottofillButton.offsetHeight;
    const previewHeight = containerHeight - listHeight - buttonHeight - 30; // 30px for margins

    listContainer.style.height = `${listHeight}px`;
    previewContainer.style.height = `${previewHeight}px`;
  }
}

window.addEventListener('resize', adjustPreviewHeight);

let chatGPTResponse = null;
let currentLoadIndex = 0;

async function handleOttoFill() {
  if (!selectedEmail) {
    alert('Please select an email first.');
    return;
  }

  const ottofillButton = document.getElementById('ottofill-button');
  ottofillButton.disabled = true;
  ottofillButton.textContent = 'Processing...';

  const formFields = detectFormFields();
  
  try {
    const response = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, 30000); // 30 seconds timeout

      chrome.runtime.sendMessage({
        action: 'processChatGPT',
        emailData: {
          subject: selectedEmail.subject,
          body: selectedEmail.body,
          formFields: formFields,
          url: window.location.href // Add the current page URL
        }
      }, (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    console.log('Response from ChatGPT:', response);

    if (response.formData && Array.isArray(response.formData)) {
      chatGPTResponse = { loads: response.formData };
      currentLoadIndex = 0;
      showLoadSelector();
    } else if (response.formData) {
      await fillForm(response.formData);
      console.log('Form filling completed');
      alert('Form filled successfully! Check the console for any fields that may not have been visible.');
    } else if (response.error) {
      throw new Error(response.error);
    } else {
      throw new Error('Unexpected response from ChatGPT');
    }
  } catch (error) {
    console.error('Error processing with ChatGPT:', error);
    alert(`Failed to process email with ChatGPT. Error: ${error.message}`);
  } finally {
    ottofillButton.disabled = false;
    ottofillButton.textContent = 'OttoFill';
  }
}

function showLoadSelector() {
  const emailContainer = document.getElementById('email-container');
  const emailPreviewContainer = document.getElementById('email-preview-container');
  const loadSelectorContainer = document.createElement('div');
  loadSelectorContainer.id = 'load-selector-container';

  if (chatGPTResponse.loads.length > 1) {
    // Multiple loads
    loadSelectorContainer.innerHTML = `
      <h3>Select a load to fill:</h3>
      <ul id="load-list"></ul>
      <button id="fill-selected-load">Fill Selected Load</button>
    `;
    emailContainer.appendChild(loadSelectorContainer);

    const loadList = document.getElementById('load-list');
    chatGPTResponse.loads.forEach((load, index) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <input type="radio" name="load-select" id="load-${index}" ${index === 0 ? 'checked' : ''}>
        <label for="load-${index}">Load ${index + 1}</label>
      `;
      loadList.appendChild(li);
    });

    document.getElementById('fill-selected-load').addEventListener('click', fillSelectedLoad);

    // Hide email preview and expand load selector
    emailPreviewContainer.style.display = 'none';
    loadSelectorContainer.style.flex = '1';
    loadSelectorContainer.style.overflowY = 'auto';
  } else {
    // Single load
    fillForm(chatGPTResponse.loads[0]);
  }
}

function fillSelectedLoad() {
  const selectedRadio = document.querySelector('input[name="load-select"]:checked');
  if (selectedRadio) {
    const loadIndex = parseInt(selectedRadio.id.split('-')[1]);
    fillForm(chatGPTResponse.loads[loadIndex]);
    currentLoadIndex = loadIndex;
    updateLoadSelector();
  } else {
    alert('Please select a load to fill.');
  }
}

function updateLoadSelector() {
  const loadSelectorContainer = document.getElementById('load-selector-container');
  const emailPreviewContainer = document.getElementById('email-preview-container');

  if (currentLoadIndex < chatGPTResponse.loads.length - 1) {
    document.getElementById(`load-${currentLoadIndex + 1}`).checked = true;
  } else {
    // All loads have been filled
    loadSelectorContainer.remove();
    emailPreviewContainer.style.display = 'block';
    adjustPreviewHeight();
  }
}

async function fillForm(formData) {
  for (const [key, value] of Object.entries(formData)) {
    let elements = [];
    if (!isNaN(key)) {
      // If the key is a number, try to find an element with that index
      const allInputs = document.querySelectorAll('input, select, textarea');
      if (allInputs[parseInt(key) - 1]) {  // Subtract 1 because the keys start from 1
        elements = [allInputs[parseInt(key) - 1]];
      }
    } else {
      // Use the original selector for non-numeric keys
      elements = document.querySelectorAll(`input[name="${key}"], select[name="${key}"], textarea[name="${key}"], input#${key}, select#${key}, textarea#${key}`);
    }
    
    for (const element of elements) {
      await fillFormField(element, value);
    }
  }
  console.log('Form filling completed');
  alert('Form filled successfully! Check the console for any fields that may not have been visible.');
}

async function fillFormField(element, value) {
  if (element.tagName === 'SELECT') {
    await handleSelect(element, value);
  } else if (element.type === 'checkbox' || element.type === 'radio') {
    await handleCheckboxOrRadio(element, value);
  } else {
    element.value = value;
  }

  // Dispatch events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // If the element is not visible in the viewport, log a message
  if (!isElementInViewport(element)) {
    console.log(`Field ${element.name || element.id} is not visible in the viewport.`);
  }
}

function handleSelect(selectElement, value) {
  const option = Array.from(selectElement.options).find(opt => 
    opt.text.toLowerCase().includes(value.toLowerCase())
  );

  if (option) {
    selectElement.value = option.value;
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    console.log(`No matching option found for ${selectElement.name || selectElement.id} with value ${value}`);
  }
}

function handleCheckboxOrRadio(element, value) {
  const shouldBeChecked = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
  element.checked = shouldBeChecked;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function isElementInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

function detectFormFields() {
  const inputs = document.querySelectorAll('input, select, textarea');
  return Array.from(inputs).map(input => {
    let label = '';
    if (input.labels && input.labels.length > 0) {
      label = input.labels[0].textContent;
    } else if (input.getAttribute('placeholder')) {
      label = input.getAttribute('placeholder');
    } else if (input.getAttribute('name')) {
      label = input.getAttribute('name');
    } else if (input.getAttribute('id')) {
      label = input.getAttribute('id');
    } else {
      label = 'Unlabeled field';
    }
    
    return {
      type: input.type || 'text',
      label: label.trim(),
      id: input.id || '',
      name: input.name || ''
    };
  });
}

function toggleDrawer() {
  const drawer = document.getElementById('ottofill-drawer');
  drawerOpen = !drawerOpen;
  drawer.style.width = drawerOpen ? 'var(--drawer-width)' : '0';
}

function initResize(e) {
  isResizing = true;
  startX = e.clientX;
  startWidth = parseInt(document.defaultView.getComputedStyle(document.getElementById('ottofill-drawer')).width, 10);
  
  document.addEventListener('mousemove', resize);
  document.addEventListener('mouseup', stopResize);
  e.preventDefault();
}

function resize(e) {
  if (!isResizing) return;
  const drawer = document.getElementById('ottofill-drawer');
  const newWidth = startWidth + startX - e.clientX;
  if (newWidth >= 300 && newWidth <= 600) { // Updated min and max values
    drawer.style.width = `${newWidth}px`;
    document.documentElement.style.setProperty('--drawer-width', `${newWidth}px`);
  }
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', resize);
  document.removeEventListener('mouseup', stopResize);
}

async function markEmailAsDone(id) {
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'markEmailAsDone', 
      id: id 
    });
    if (response.success) {
      console.log(`Email ${id} marked as done successfully`);
      removeEmailFromList(id);
    } else {
      console.error('Failed to mark email as done:', response.error);
      alert('Failed to mark email as done. Please try again.');
    }
  } catch (error) {
    console.error('Error marking email as done:', error);
    alert('An error occurred while marking the email as done. Please try again.');
  }
}

async function clearEmail(id) {
  console.log('Clearing email with id:', id);
  if (!id) {
    console.error('id is undefined or null');
    alert('Cannot clear email: Invalid ID');
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'clearEmail', 
      id: id 
    });
    if (response.success) {
      console.log(`Email ${id} cleared successfully`);
      removeEmailFromList(id);
    } else {
      console.error('Failed to clear email:', response.error);
      alert('Failed to clear email. Please try again.');
    }
  } catch (error) {
    console.error('Error clearing email:', error);
    alert('An error occurred while clearing the email. Please try again.');
  }
}

function removeEmailFromList(id) {
  const emailList = document.getElementById('emailList');
  const emailItem = emailList.querySelector(`li[data-email-id="${id}"]`);
  if (emailItem) {
    emailItem.remove();
  }
  if (emailList.children.length === 0) {
    emailList.innerHTML = '<li>No emails available</li>';
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({status: 'ready'});
  } else if (request.action === 'toggleDrawer') {
    toggleDrawer();
  }
});

createDrawer();