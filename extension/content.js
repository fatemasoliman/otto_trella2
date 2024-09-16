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

async function initializeContentScript() {
    console.log('Initializing content script...');
    
    // Add Lato font
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    // Load drawer.js using a script tag
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('drawer.js');
    script.type = 'module';
    script.onload = () => {
        console.log('drawer.js loaded successfully');
        if (typeof createDrawer === 'function' && typeof Drawer === 'function') {
            createDrawer();
            window.drawerInstance = new Drawer();
            console.log('Drawer instance created:', window.drawerInstance);
        } else {
            console.error('createDrawer or Drawer not found in drawer.js');
        }
    };
    script.onerror = (error) => {
        console.error('Error loading drawer.js:', error);
    };
    (document.head || document.documentElement).appendChild(script);

    chrome.storage.local.get('authToken', function(result) {
        if (result.authToken) {
            fetchEmails();
        } else {
            document.getElementById('auth-section').style.display = 'block';
        }
    });

    // Inject the drawer CSS
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.type = 'text/css';
    style.href = chrome.runtime.getURL('drawer.css');
    style.onload = () => console.log('drawer.css loaded successfully');
    style.onerror = (error) => console.error('Error loading drawer.css:', error);
    document.head.appendChild(style);

    // Listen for messages from the drawer
    window.addEventListener('message', function(event) {
        if (event.data.action === 'getEmails') {
            chrome.runtime.sendMessage({action: 'getEmails'}, function(response) {
                window.postMessage({ action: 'emailsResponse', emails: response.emails }, '*');
            });
        } else if (event.data.action === 'getFormFields') {
            const formFields = getFormFields();
            window.postMessage({ action: 'formFieldsResponse', fields: formFields }, '*');
        } else if (event.data.action === 'autofillForm') {
            autofillForm(event.data.formData);
        }
    });

    // Notify background script that content script is ready
    chrome.runtime.sendMessage({action: 'contentScriptReady'});

    console.log('Content script initialized and ready');
}

// Run initialization when the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
    initializeContentScript();
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in content script:', request);

    if (request.action === "toggleDrawer") {
        console.log('Toggle drawer requested');
        toggleDrawer();
        // Make sure to send a response
        sendResponse({success: true});
    } else if (request.action === "getFormFields") {
        const formFields = getFormFields();
        console.log('Sending form fields to background:', formFields);
        sendResponse(formFields);
    } else if (request.action === "autofillForm") {
        console.log('Autofilling form with data:', request.formData);
        autofillForm(request.formData);
        sendResponse({success: true});
    } else if (request.action === "updateEmails") {
        console.log('Updating emails in drawer');
        displayEmails(request.emails);
        sendResponse({success: true});
    }

    // Return true to indicate that the response will be sent asynchronously
    return true;
});

console.log('Content script loaded and ready');

// Add this function
function toggleDrawer() {
    console.log('toggleDrawer called in content script');
    if (window.drawerInstance) {
        window.drawerInstance.toggleDrawer();
    } else {
        console.error('Drawer instance not found');
        // If drawer instance is not found, try to create it
        if (typeof createDrawer === 'function' && typeof Drawer === 'function') {
            createDrawer();
            window.drawerInstance = new Drawer();
            window.drawerInstance.toggleDrawer();
        } else {
            console.error('createDrawer or Drawer not found. Make sure drawer.js is loaded.');
        }
    }
}