var SERVER_URL = "http://ec2-13-51-0-115.eu-north-1.compute.amazonaws.com:8080";

function onHomepage(e) {
  return createHomepageCard();
}

function createHomepageCard() {
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle("OttoFill"));
  
  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextButton()
    .setText("Send Email to OttoFill")
    .setOnClickAction(CardService.newAction().setFunctionName("triggerOttoFill")));
  
  card.addSection(section);
  
  // Add saved emails section with a styled header
  var savedEmailsSection = CardService.newCardSection();
  
  savedEmailsSection.addWidget(CardService.newTextParagraph()
    .setText("<p align='center'><font color='#4285f4'><b>Saved Emails</b></font></p>"));
  
  // Fetch and display saved emails
  var savedEmails = fetchSavedEmails();
  console.log('Saved emails:', JSON.stringify(savedEmails));
  
  if (savedEmails.length > 0) {
    savedEmails.forEach(function(email) {
      savedEmailsSection.addWidget(CardService.newKeyValue()
        .setTopLabel(email.subject)
        .setContent(email.from)
        .setBottomLabel(`User: ${email.user || 'N/A'} | Date: ${new Date(email.timestamp).toLocaleString()}`));
    });
  } else {
    savedEmailsSection.addWidget(CardService.newTextParagraph().setText("No saved emails found."));
  }
  
  card.addSection(savedEmailsSection);
  
  return card.build();
}

function fetchSavedEmails() {
  var url = SERVER_URL + "/email";
  var userEmail = Session.getActiveUser().getEmail();
  
  console.log('Fetching saved emails for user:', userEmail);
  console.log('Request URL:', url);
  
  try {
    var options = {
      'method': 'get',
      'muteHttpExceptions': true
    };
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    var contentText = response.getContentText();
    
    console.log('Response status code:', statusCode);
    console.log('Response content:', contentText);
    
    if (statusCode === 200) {
      var emails = JSON.parse(contentText);
      console.log('Total emails received:', emails.length);
      console.log('Sample email:', JSON.stringify(emails[0])); // Log a sample email
      var userEmails = emails.filter(function(email) {
        console.log('Checking email:', JSON.stringify(email));
        console.log('Email user:', email.user, 'Current user:', userEmail);
        return email.user === userEmail;
      });
      console.log('Filtered emails for user:', userEmails.length);
      return userEmails;
    } else {
      console.error('Error fetching emails. Status code:', statusCode, 'Response:', contentText);
      return [];
    }
  } catch (error) {
    console.error('Error fetching saved emails:', error);
    return [];
  }
}

// ... (keep the rest of your functions)