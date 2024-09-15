import { GPTService } from './gpt_service.js';

class Drawer {
  constructor() {
    this.isOpen = false;
    this.drawerElement = null;
    this.tabElement = null;
    this.gptService = new GPTService();
    this.createDrawer();
    this.createTab();
    this.initializeEventListeners();
  }

  createDrawer() {
    this.drawerElement = document.createElement('div');
    this.drawerElement.id = 'extension-drawer';
    
    // Create a shadow root
    const shadow = this.drawerElement.attachShadow({mode: 'open'});
    
    // Create a style element for the shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      /* Copy the contents of drawer.css here */
    `;
    
    // Create the drawer content
    const content = document.createElement('div');
    content.id = 'drawer-content';
    content.innerHTML = `
      <button id="authenticate">Authenticate with Gmail</button>
      <button id="toggle-text-input">Paste email here</button>
      <div id="email-list-container">
        <div id="email-list"></div>
      </div>
      <div id="text-input-wrapper" style="display: none;">
        <textarea id="custom-text-input" placeholder="Paste email here"></textarea>
      </div>
      <div id="email-content-view" style="display: none;">
        <h3 id="email-subject"></h3>
        <p id="email-from"></p>
        <div id="email-body"></div>
      </div>
      <div id="form-fields-container" style="display: none;">
        <button id="fill-form-with-otto">Fill Form with Otto</button>
      </div>
    `;
    
    // Append the style and content to the shadow root
    shadow.appendChild(style);
    shadow.appendChild(content);
    
    document.body.appendChild(this.drawerElement);
  }

  createTab() {
    this.tabElement = document.createElement('div');
    this.tabElement.id = 'drawer-tab';
    this.tabElement.addEventListener('click', () => this.toggleDrawer());
    document.body.appendChild(this.tabElement);
  }

  toggleDrawer() {
    this.isOpen = !this.isOpen;
    this.drawerElement.classList.toggle('open', this.isOpen);
    this.tabElement.classList.toggle('open', this.isOpen);
  }

  initializeEventListeners() {
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

    authenticateButton.addEventListener('click', this.handleAuthentication.bind(this));
    fillFormButton.addEventListener('click', this.handleFillForm.bind(this));
    toggleTextInputButton.addEventListener('click', this.handleToggleTextInput.bind(this));

    this.init();
  }

  handleAuthentication() {
    console.log('Authenticate button clicked');
    // Send a message to the content script
    window.postMessage({ action: 'authenticate' }, '*');
  }

  handleFillForm() {
    const selectedEmail = document.querySelector('.email-item.selected');
    const customTextInput = document.getElementById('custom-text-input');
    if (selectedEmail) {
      const emailBody = selectedEmail.getAttribute('data-body');
      this.fillFormWithGPT(emailBody);
    } else if (customTextInput.value.trim()) {
      this.fillFormWithGPT(customTextInput.value.trim());
    } else {
      console.log('No email selected and no custom text entered');
      alert('Please select an email or paste an email in the text area first.');
    }
  }

  handleToggleTextInput() {
    const textInputWrapper = document.getElementById('text-input-wrapper');
    const emailListContainer = document.getElementById('email-list-container');
    const toggleTextInputButton = document.getElementById('toggle-text-input');

    if (textInputWrapper.style.display === 'none') {
      textInputWrapper.style.display = 'flex';
      emailListContainer.style.display = 'none';
      toggleTextInputButton.textContent = 'Show emails';
    } else {
      textInputWrapper.style.display = 'none';
      emailListContainer.style.display = 'block';
      toggleTextInputButton.textContent = 'Paste email here';
    }
  }

  hideAuthButton() {
    document.getElementById('authenticate').style.display = 'none';
  }

  async fetchEmails(token) {
    // Implement email fetching logic here
    // This should be similar to your previous fetchEmails function
  }

  async fillFormWithGPT(emailBody) {
    // Implement form filling logic here
    // This should be similar to your previous fillFormWithGPT function
  }

  init() {
    // Implement initialization logic here
    // This should be similar to your previous init function
  }

  // Add other necessary methods from your previous popup.js here
}

// Create and initialize the drawer
const drawer = new Drawer();

// Listen for messages from the content script
window.addEventListener('message', (event) => {
  if (event.data.action === 'authenticationResponse') {
    console.log('Received authentication response:', event.data);
    if (event.data.token) {
      console.log('Authentication successful, hiding button and fetching emails');
      drawer.hideAuthButton();
      drawer.fetchEmails(event.data.token);
    } else {
      console.error('Authentication failed:', event.data.error || 'Unknown error');
      document.getElementById('email-list').innerHTML = `<p>Authentication failed: ${event.data.error || 'Unknown error'}</p>`;
    }
  }
});

export { drawer };