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
        <button id="login-button">Sign in with Google</button>
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
      <div id="loads-container" style="display: none;"></div>
      <button id="ottofill-button" disabled>OttoFill</button>
      <button id="sign-out-button" style="display: none;">Sign Out</button>
    </div>
  `;

  document.body.appendChild(drawer);

  const tab = drawer.querySelector('#ottofill-tab');
  tab.addEventListener('mousedown', initResize);
  tab.addEventListener('dblclick', toggleDrawer);

  const ottofillButton = drawer.querySelector('#ottofill-button');
  ottofillButton.addEventListener('click', handleOttoFill);

  const loginButton = document.getElementById('login-button');
  loginButton.addEventListener('click', handleLogin);

  const signOutButton = document.getElementById('sign-out-button');
  signOutButton.addEventListener('click', handleSignOut);

  checkAuthStatus();
}

function showLoginButton() {
  document.getElementById('login-container').style.display = 'block';
  document.getElementById('email-container').style.display = 'none';
  document.getElementById('sign-out-button').style.display = 'none';
  document.getElementById('ottofill-button').style.display = 'none';
}

async function showEmailList() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('email-container').style.display = 'block';
  document.getElementById('sign-out-button').style.display = 'block';
  document.getElementById('ottofill-button').style.display = 'block';
  await fetchEmails();
}

async function handleSignOut() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'signOut' });
    if (response.success) {
      isAuthenticated = false;
      currentUser = null;
      selectedEmail = null;
      const emailList = document.getElementById('emailList');
      emailList.innerHTML = '';
      showLoginButton();
      alert('You have been signed out successfully.');
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Error signing out:', error);
    alert('An error occurred while signing out. Please try again.');
  }
}

let isAuthenticated = false;

async function checkAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
    if (response.isAuthenticated) {
      isAuthenticated = true;
      currentUser = response.email;
      await showEmailList();
    } else {
      showLoginButton();
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    showLoginButton();
  }
}

async function handleLogin() {
  console.log('Login button clicked');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'authenticateWithGoogle' });
    console.log('Authentication response received in drawer.js:', response);
    if (response && response.success) {
      console.log('Authentication successful, showing email list');
      isAuthenticated = true;
      currentUser = response.email;
      await showEmailList();
    } else {
      console.error('Authentication failed:', response ? response.error : 'Unknown error');
      alert('Authentication failed. Please try again. Error: ' + (response ? response.error : 'Unknown error'));
    }
  } catch (error) {
    console.error('Error during authentication:', error);
    alert('An error occurred during authentication. Please try again.');
  }
}

async function fetchEmails() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getEmails' });
    console.log('Fetched emails response:', response);
    if (response.emails) {
      displayEmails(response.emails);
    } else if (response.error) {
      console.error('Failed to fetch emails:', response.error);
      if (response.error.includes('Not authenticated')) {
        isAuthenticated = false;
        showLoginButton();
      } else {
        alert('Failed to fetch emails. Please try again.');
      }
    } else {
      console.error('Unexpected response when fetching emails');
      alert('An unexpected error occurred. Please try again.');
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
    alert('An error occurred while fetching emails. Please try again.');
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
    console.log(`Selecting email with id: ${id} and messageId: ${messageId}`);
    
    const emailResponse = await chrome.runtime.sendMessage({ action: 'getEmails' });
    if (emailResponse.error) {
      throw new Error(emailResponse.error);
    }
    
    if (emailResponse.emails) {
      selectedEmail = emailResponse.emails.find(email => email.id === id);
      if (!selectedEmail) {
        throw new Error('Email not found');
      }
    } else {
      throw new Error('Failed to fetch email details');
    }

    const bodyResponse = await chrome.runtime.sendMessage({ action: 'getEmailBody', messageId: messageId });
    if (bodyResponse.error) {
      throw new Error(bodyResponse.error);
    }
    
    if (bodyResponse.body) {
      selectedEmail.body = bodyResponse.body;
    } else {
      throw new Error('Failed to fetch email body');
    }

    displayEmailPreview(selectedEmail);
    document.getElementById('ottofill-button').disabled = false;
  } catch (error) {
    console.error('Error selecting email:', error);
    if (error.message.includes('Not authenticated')) {
      isAuthenticated = false;
      showLoginButton();
    } else {
      alert('Failed to load email. Please try again. Error: ' + error.message);
    }
  }
}

function displayEmailPreview(email) {
  const subjectElement = document.getElementById('preview-subject');
  const fromElement = document.getElementById('preview-from');
  const bodyElement = document.getElementById('preview-body');

  subjectElement.textContent = email.subject;
  fromElement.textContent = `From: ${email.from}`;
  
  const contentDiv = document.createElement('div');
  
  contentDiv.innerHTML = email.body;
  
  const scripts = contentDiv.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    scripts[i].parentNode.removeChild(scripts[i]);
  }
  
  const styles = contentDiv.getElementsByTagName('style');
  for (let i = styles.length - 1; i >= 0; i--) {
    styles[i].parentNode.removeChild(styles[i]);
  }
  
  const style = document.createElement('style');
  style.textContent = `
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  `;
  
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
    const listHeight = containerHeight * 0.25;
    const buttonHeight = ottofillButton.offsetHeight;
    const previewHeight = containerHeight - listHeight - buttonHeight - 30;

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
  console.log('Detected form fields:', formFields);

  try {
    const response = await sendToAssistant(selectedEmail, formFields);
    console.log('Response from assistant:', response);

    if (response.error) {
      throw new Error(response.error);
    }

    if (Array.isArray(response.formData) && response.formData.length > 0) {
      displayLoads(response.formData);
    } else {
      console.error('Unexpected response format from assistant');
      alert('Received an unexpected response format. Please try again.');
    }
  } catch (error) {
    console.error('Error processing with Assistant:', error);
    alert(`Failed to process email with Assistant. Error: ${error.message}`);
  } finally {
    ottofillButton.disabled = false;
    ottofillButton.textContent = 'OttoFill';
  }
}

function displayLoads(loads) {
  const loadsContainer = document.getElementById('loads-container');
  loadsContainer.innerHTML = '';
  loadsContainer.style.display = 'block';

  loads.forEach((load, index) => {
    const loadElement = document.createElement('div');
    loadElement.className = 'load-item';
    loadElement.innerHTML = `
      <div class="load-header">
        <h4>Load ${index + 1}</h4>
        <button class="ottofill-load-button" data-index="${index}">Ottofill this load</button>
      </div>
      <div class="load-details">
        ${Object.entries(load).map(([key, value]) => `
          <div class="load-detail">
            <span class="load-key">${key}:</span>
            <span class="load-value">${value}</span>
          </div>
        `).join('')}
      </div>
    `;
    loadsContainer.appendChild(loadElement);
  });

  // Add event listeners to the Ottofill buttons
  document.querySelectorAll('.ottofill-load-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      fillSelectedLoad(loads[index]);
    });
  });

  // Scroll to the top of the loads container
  loadsContainer.scrollTop = 0;
}

async function fillSelectedLoad(loadData) {
  const formFields = detectFormFields();
  try {
    await fillForm(loadData, formFields);
    console.log('Load filled successfully');
    alert('Load filled successfully! Check the console for any fields that may not have been visible.');
  } catch (error) {
    console.error('Error filling load:', error);
    alert(`Failed to fill load. Error: ${error.message}`);
  }
}

async function sendToAssistant(email, formFields) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'processChatGPT',
      emailData: {
        subject: email.subject,
        body: email.body,
        formFields: formFields,
        url: window.location.href
      }
    });

    if (response.error && response.error.includes('Authentication failed')) {
      handleReauthentication();
      throw new Error('Authentication failed. Please log in again.');
    }

    if (response.error) {
      throw new Error(response.error);
    }
    return response;
  } catch (error) {
    console.error('Error in sendToAssistant:', error);
    throw error;
  }
}

async function fillForm(formData, formFields) {
  console.log('Starting form fill. Form data:', formData);
  console.log('Form fields:', formFields);

  for (const [key, value] of Object.entries(formData)) {
    console.log(`Attempting to fill field ${key} with value:`, value);

    const field = formFields.find(f => String(f.label).toLowerCase() === String(key).toLowerCase());

    if (field) {
      console.log(`Matched field:`, field);

      const element = field.element;

      if (element && !element.hidden && element.style.display !== 'none' && element.type !== 'hidden') {
        console.log(`Found element for field:`, element);
        
        if (field.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
          console.warn(`Warning: Non-numeric value "${value}" for number field ${field.label}`);
        }
        if (field.label.toLowerCase().includes('date') && typeof value === 'string' && !/^\d{1,2}$/.test(value)) {
          console.warn(`Warning: Possible incorrect date format "${value}" for field ${field.label}`);
        }
        
        await fillFormField(element, value);
        console.log(`Field ${field.label} filled with value:`, value);
      } else {
        console.log(`No visible element found for field: ${field.label}`);
      }
    } else {
      console.log(`No matching field found for key: ${key}`);
    }
  }
}

async function fillFormField(element, value) {
  console.log(`Filling field:`, element);
  console.log(`With value:`, value);

  if (element.type === 'file') {
    console.log(`Ignoring file input: ${element.name || element.id}`);
    return;
  }

  if (element.tagName === 'SELECT') {
    await handleSelect(element, value);
  } else if (element.type === 'checkbox' || element.type === 'radio') {
    await handleCheckboxOrRadio(element, value);
  } else {
    element.value = value !== null && value !== undefined ? String(value) : '';
  }

  console.log(`Field value after setting:`, element.value);

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  if (!isElementInViewport(element)) {
    console.log(`Field ${element.name || element.id} is not visible in the viewport.`);
  }
}

function handleSelect(selectElement, value) {
  const stringValue = String(value).toLowerCase();
  if (stringValue === '' || stringValue === 'select first option') {
    if (selectElement.options.length > 0) {
      selectElement.selectedIndex = 0;
    }
  } else {
    const option = Array.from(selectElement.options).find(opt => 
      opt.text.toLowerCase().includes(stringValue)
    );

    if (option) {
      selectElement.value = option.value;
    } else {
      console.log(`No matching option found for ${selectElement.name || selectElement.id} with value ${value}`);
      if (selectElement.options.length > 0) {
        selectElement.selectedIndex = 0;
      }
    }
  }

  selectElement.dispatchEvent(new Event('change', { bubbles: true }));
}

function handleCheckboxOrRadio(element, value) {
  const stringValue = String(value).toLowerCase();
  const shouldBeChecked = stringValue === 'true' || stringValue === '1' || stringValue === 'yes';
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
  if (newWidth >= 300 && newWidth <= 600) {
    drawer.style.width = `${newWidth}px`;
    document.documentElement.style.property('--drawer-width', `${newWidth}px`);
  }
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', resize);
  document.removeEventListener('mouseup', stopResize);
}

function detectFormFields() {
  const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
  return Array.from(inputs)
    .filter(input => {
      const isVisible = !input.hidden && 
                        input.style.display !== 'none' && 
                        input.type !== 'hidden' &&
                        input.offsetParent !== null &&
                        input.type !== 'file';
      return isVisible;
    })
    .map((input, index) => {
      let label = '';
      if (input.labels && input.labels.length > 0) {
        label = input.labels[0].textContent.trim();
      } else if (input.getAttribute('placeholder')) {
        label = input.getAttribute('placeholder').trim();
      } else if (input.getAttribute('name')) {
        label = input.getAttribute('name').trim();
      } else if (input.getAttribute('id')) {
        label = input.getAttribute('id').trim();
      } else {
        label = 'Unlabeled field';
      }
      
      return {
        index: index + 1,
        type: input.type || 'text',
        label: label,
        id: input.id || '',
        name: input.name || '',
        element: input
      };
    });
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
  } else if (request.action === 'requireReauth') {
    handleReauthentication();
  } else if (request.action === 'userSignedOut') {
    // Handle sign out from other tabs
    currentUser = null;
    selectedEmail = null;
    showLoginButton();
  }
});

createDrawer();