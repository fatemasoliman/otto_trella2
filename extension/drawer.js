import { GPTService } from './gpt_service.js';
import { AuthService } from './auth_service.js';

console.log('drawer.js starting...');

function createDrawer() {
  console.log('Creating drawer...');
  const container = document.createElement('div');
  container.id = 'ai-extension-container';
  
  const drawer = document.createElement('div');
  drawer.id = 'ottofill-drawer';
  drawer.className = 'drawer';
  
  // Add basic styling to ensure visibility
  drawer.style.position = 'fixed';
  drawer.style.top = '0';
  drawer.style.right = '-300px'; // Start off-screen
  drawer.style.width = '300px';
  drawer.style.height = '100%';
  drawer.style.backgroundColor = 'white';
  drawer.style.boxShadow = '-2px 0 5px rgba(0,0,0,0.2)';
  drawer.style.transition = 'right 0.3s ease-in-out';
  drawer.style.zIndex = '9999999'; // Ensure it's on top of other elements
  
  const content = document.createElement('div');
  content.className = 'drawer-content';
  content.textContent = 'Drawer Content'; // Add some visible content
  
  drawer.appendChild(content);
  container.appendChild(drawer);
  document.body.appendChild(container);
  console.log('Drawer created and added to DOM');

  // Add a visible tab
  const tab = document.createElement('div');
  tab.id = 'drawer-tab';
  tab.style.position = 'fixed';
  tab.style.top = '50%';
  tab.style.right = '0';
  tab.style.width = '30px';
  tab.style.height = '60px';
  tab.style.backgroundColor = 'blue';
  tab.style.cursor = 'pointer';
  tab.style.zIndex = '9999999';
  tab.onclick = () => window.drawerInstance.toggleDrawer();
  document.body.appendChild(tab);
  console.log('Drawer tab created and added to DOM');
}

class Drawer {
  constructor() {
    console.log('Drawer constructor called');
    console.log('Initializing Drawer...');
    this.drawer = document.getElementById('ottofill-drawer');
    if (!this.drawer) {
      console.error('Drawer element not found. Creating it now.');
      createDrawer();
      this.drawer = document.getElementById('ottofill-drawer');
    }
    this.authService = new AuthService(); // New instance
    this.gptService = new GPTService(); // Assuming this exists
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Add event listeners for drawer interactions if needed
    const loginButton = document.getElementById('login-button');
    loginButton.addEventListener('click', () => this.handleLogin());
  }

  async handleLogin() {
    try {
      const user = await this.authService.authenticate();
      if (user) {
        this.updateUIForLoggedInUser(user);
        this.fetchUserEmails(user.id);
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  }

  updateUIForLoggedInUser(user) {
    // Update UI to show logged-in state
    const userInfo = document.getElementById('user-info');
    userInfo.textContent = `Logged in as: ${user.email}`;
  }

  async fetchUserEmails(userId) {
    try {
      const emails = await this.gptService.fetchEmails(userId);
      this.displayEmails(emails);
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    }
  }

  displayEmails(emails) {
    const emailList = document.getElementById('email-list');
    emailList.innerHTML = '';
    emails.forEach(email => {
      const li = document.createElement('li');
      li.textContent = email.subject;
      emailList.appendChild(li);
    });
  }

  toggleDrawer() {
    console.log('toggleDrawer called');
    console.log('Toggling drawer...');
    if (this.drawer.style.right === '0px') {
      this.drawer.style.right = '-300px';
      console.log('Drawer closed');
    } else {
      this.drawer.style.right = '0px';
      console.log('Drawer opened');
    }
  }

  // Add other methods as needed
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in drawer.js:', request);
  if (request.action === 'toggleDrawer') {
    console.log('Toggle drawer requested');
    if (!window.drawerInstance) {
      console.log('Creating new Drawer instance');
      window.drawerInstance = new Drawer();
    }
    window.drawerInstance.toggleDrawer();
  }
});

// Create drawer immediately when the script loads
createDrawer();

console.log('drawer.js loaded and ready');

// Expose Drawer and createDrawer to the global scope
window.Drawer = Drawer;
window.createDrawer = createDrawer;