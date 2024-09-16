console.log('Content script starting...');

// Function to get form field names
function getFormFields() {
    const fields = document.querySelectorAll('input[type="text"], input[type="date"], input[type="number"], select, textarea');
    return Array.from(fields).map(field => {
        let label = '';
        let name = field.name || field.id;

        // Try to find a label
        const labelElement = document.querySelector(`label[for="${field.id}"]`);
        if (labelElement) {
            label = labelElement.textContent.trim();
        } else {
            // If no label found, try to find a parent element with a text node
            let parent = field.parentElement;
            while (parent && !label) {
                const textNodes = Array.from(parent.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
                if (textNodes.length > 0) {
                    label = textNodes[0].textContent.trim();
                }
                parent = parent.parentElement;
            }
        }

        return {
            name: name,
            label: label,
            type: field.type || field.tagName.toLowerCase(),
            value: field.value
        };
    });
}

function autofillForm(formData) {
    console.log('Autofill function called with data:', formData);
    
    function findAllFieldsWithLabels() {
        const allFields = document.querySelectorAll('input[role="combobox"], input[type="text"], input[type="number"], input[type="checkbox"], textarea, input[aria-autocomplete="list"], input[role="spinbutton"], input[type="date"], input[type="time"]');
        const relevantSelectors = [];
        allFields.forEach((field, index) => {
            const container = field.closest('div');
            const name = field.name || 
                         (field.labels[0] ? field.labels[0].textContent.trim() : null) || 
                         document.querySelector(`label[for="${field.id}"]`)?.textContent.trim() ||
                         field.placeholder || 
                         field.id || 
                         field.getAttribute('aria-label') ||
                         `field_${index}`;
            relevantSelectors.push({
                input: field,
                container: container,
                type: field.type || field.tagName.toLowerCase(),
                name: name
            });
        });
        return relevantSelectors;
    }

    console.log("Interacting with fields. Inputs:", formData);
    const relevantSelectors = findAllFieldsWithLabels();
    console.log("Relevant selectors:", relevantSelectors);

    if (relevantSelectors.length > 0) {
        relevantSelectors.forEach((selector) => {
            const { input, container, name } = selector;
            if (input && formData[name] !== undefined) {
                container.click();  // Click the container to focus on the input
                setTimeout(() => {
                    const valueToType = formData[name];
                    if (input.type === 'checkbox') {
                        input.checked = valueToType.toLowerCase() === 'true';
                    } else {
                        input.value = valueToType;
                    }
                    const event = new Event('input', { bubbles: true });
                    input.dispatchEvent(event);
                    console.log(`Typed "${valueToType}" into field ${name}.`);
                    if (input.type !== 'checkbox') {
                        setTimeout(() => {
                            const optionElement = document.querySelector('.css-1jpqh9-option, [class*="option"], .css-1n7v3ny');
                            if (optionElement) {
                                optionElement.click();
                                console.log(`Clicked option element for field ${name}.`);
                            } else {
                                console.log(`No option element found to click for field ${name}.`);
                            }
                        }, 1000);
                    }
                }, 500);
            }
        });
    } else {
        console.error('No relevant selectors found.');
    }
}

class Drawer {
    constructor() {
        this.createDrawer();
        this.initializeEventListeners();
        this.selectedEmail = null;
    }

    createDrawer() {
        const drawerHTML = `
            <div id="ottofill-drawer" class="drawer">
                <div class="drawer-content">
                    <h2>OttoFill</h2>
                    <button id="login-button">Login</button>
                    <div id="user-info"></div>
                    <div id="email-list"></div>
                    <div id="email-preview"></div>
                    <button id="ottofill-button" style="display: none;">OttoFill</button>
                </div>
            </div>
            <div id="drawer-tab"></div>
        `;

        const drawerContainer = document.createElement('div');
        drawerContainer.id = 'ottofill-container';
        drawerContainer.innerHTML = drawerHTML;
        document.body.appendChild(drawerContainer);

        this.drawer = document.getElementById('ottofill-drawer');
        this.tab = document.getElementById('drawer-tab');
    }

    initializeEventListeners() {
        const loginButton = document.getElementById('login-button');
        const ottoFillButton = document.getElementById('ottofill-button');
        
        loginButton.addEventListener('click', () => this.handleLogin());
        ottoFillButton.addEventListener('click', () => this.handleOttoFill());
        this.tab.addEventListener('click', () => this.toggleDrawer());

        document.getElementById('email-list').addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                this.selectEmail(e.target.dataset.emailId);
            }
        });
    }

    toggleDrawer() {
        this.drawer.classList.toggle('open');
        this.tab.classList.toggle('open');
    }

    handleLogin() {
        console.log('Login button clicked');
        chrome.runtime.sendMessage({action: 'authenticate'}, (response) => {
            console.log('Received authentication response:', response);
            if (response && response.token) {
                console.log('Authentication successful');
                this.updateUIForLoggedInUser();
                this.fetchEmails();
            } else {
                console.error('Authentication failed:', response.error);
                alert('Login failed. Please try again.');
            }
        });
    }

    updateUIForLoggedInUser() {
        const userInfo = document.getElementById('user-info');
        const loginButton = document.getElementById('login-button');
        const ottoFillButton = document.getElementById('ottofill-button');

        userInfo.textContent = 'Logged in';
        loginButton.style.display = 'none';
        ottoFillButton.style.display = 'block';
    }

    fetchEmails() {
        chrome.runtime.sendMessage({action: 'getEmails'}, (response) => {
            if (response.emails) {
                this.displayEmails(response.emails);
            }
        });
    }

    displayEmails(emails) {
        const emailList = document.getElementById('email-list');
        emailList.innerHTML = '';
        emails.forEach(email => {
            const li = document.createElement('li');
            li.textContent = email.subject;
            li.dataset.emailId = email.id;
            emailList.appendChild(li);
        });
    }

    selectEmail(emailId) {
        chrome.runtime.sendMessage({action: 'getEmailDetails', emailId: emailId}, (response) => {
            if (response.email) {
                this.selectedEmail = response.email;
                this.updateEmailPreview(response.email);
                document.getElementById('ottofill-button').style.display = 'block';
            } else {
                console.error('Failed to get email details:', response.error);
                alert(`Failed to get email details: ${response.error}`);
            }
        });
    }

    updateEmailPreview(email) {
        const preview = document.getElementById('email-preview');
        preview.innerHTML = `
            <h3>${email.subject}</h3>
            <p>From: ${email.from}</p>
            <p>${email.body}</p>
        `;
    }

    handleOttoFill() {
        if (!this.selectedEmail) {
            alert('Please select an email first');
            return;
        }

        const formFields = getFormFields();
        chrome.runtime.sendMessage({
            action: 'processChatGPT',
            emailData: {
                subject: this.selectedEmail.subject,
                body: this.selectedEmail.body,
                formFields: formFields
            }
        }, (response) => {
            if (response.formData) {
                autofillForm(response.formData);
            } else if (response.error) {
                console.error('Error processing with ChatGPT:', response.error);
                alert('Error processing the email. Please try again.');
            }
        });
    }
}

// Create and initialize the drawer
const drawer = new Drawer();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in content script:', request);

    if (request.action === "getFormFields") {
        const formFields = getFormFields();
        console.log('Sending form fields to background:', formFields);
        sendResponse(formFields);
    } else if (request.action === "autofillForm") {
        console.log('Autofilling form with data:', request.formData);
        autofillForm(request.formData);
        sendResponse({success: true});
    } else if (request.action === "toggleDrawer") {
        drawer.toggleDrawer();
    }

    return true;
});

console.log('Content script loaded and ready');