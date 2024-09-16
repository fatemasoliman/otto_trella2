document.addEventListener('DOMContentLoaded', function() {
  const loginButton = document.getElementById('login-button');
  const ottoFillButton = document.getElementById('ottofill-button');
  const userInfo = document.getElementById('user-info');
  const emailList = document.getElementById('email-list');

  loginButton.addEventListener('click', handleLogin);
  ottoFillButton.addEventListener('click', handleOttoFill);

  function handleLogin() {
    chrome.runtime.sendMessage({action: 'authenticate'}, function(response) {
      if (response.token) {
        userInfo.textContent = 'Logged in';
        loginButton.style.display = 'none';
        ottoFillButton.style.display = 'block';
        fetchEmails();
      }
    });
  }

  function fetchEmails() {
    chrome.runtime.sendMessage({action: 'getEmails'}, function(response) {
      if (response.emails) {
        displayEmails(response.emails);
      }
    });
  }

  function displayEmails(emails) {
    emailList.innerHTML = '';
    emails.forEach(email => {
      const li = document.createElement('li');
      li.textContent = email.subject;
      emailList.appendChild(li);
    });
  }

  function handleOttoFill() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "getFormFields"}, function(formFields) {
        if (formFields) {
          // Process form fields with ChatGPT
          chrome.runtime.sendMessage({
            action: 'processChatGPT',
            emailData: {
              subject: "Sample Subject",
              body: "Sample Body",
              formFields: formFields
            }
          }, function(response) {
            if (response.formData) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "autofillForm",
                formData: response.formData
              });
            }
          });
        }
      });
    });
  }
});