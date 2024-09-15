// Function to get form field names
function getFormFields() {
    const fields = document.querySelectorAll('input[role="combobox"], input[type="text"], input[type="number"], input[type="checkbox"], textarea, input[aria-autocomplete="list"], input[role="spinbutton"], input[type="date"], input[type="time"]');
    return Array.from(fields).map((field, index) => {
        // Try to get the field name or label
        const name = field.name || 
                     (field.labels[0] ? field.labels[0].textContent.trim() : null) || 
                     document.querySelector(`label[for="${field.id}"]`)?.textContent.trim() ||
                     field.placeholder || 
                     field.id || 
                     field.getAttribute('aria-label');
        
        // If no name found, use the index as a fallback
        return name || `field_${index}`;
    }).filter(name => name);
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

// Inject the drawer CSS
const style = document.createElement('link');
style.rel = 'stylesheet';
style.type = 'text/css';
style.href = chrome.runtime.getURL('drawer.css');
document.head.appendChild(style);

// Inject the drawer script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('drawer.js');
script.type = 'module';
document.head.appendChild(script);

// Listen for messages from the drawer
window.addEventListener('message', function(event) {
    if (event.data.action === 'authenticate') {
        chrome.runtime.sendMessage({action: 'authenticate'}, function(response) {
            window.postMessage({ action: 'authenticationResponse', ...response }, '*');
        });
    } else if (event.data.action === 'getFormFields') {
        const formFields = getFormFields();
        window.postMessage({ action: 'formFieldsResponse', fields: formFields }, '*');
    } else if (event.data.action === 'autofillForm') {
        autofillForm(event.data.formData);
    }
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in content script:', request);

    if (request.action === "getFormFields") {
        const formFields = getFormFields();
        console.log('Sending form fields to popup:', formFields);
        sendResponse(formFields);
    } else if (request.action === "autofillForm") {
        console.log('Autofilling form with data:', request.formData);
        autofillForm(request.formData);
        sendResponse({success: true});
    }

    // Return true to indicate that the response will be sent asynchronously
    return true;
});

console.log('Content script loaded and ready');