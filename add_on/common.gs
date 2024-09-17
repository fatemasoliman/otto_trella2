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
        .setBottomLabel(new Date(email.timestamp).toLocaleString()));
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
      'muteHttpExceptions': true,
      'headers': {
        'user-email': userEmail
      }
    };
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    var contentText = response.getContentText();
    
    console.log('Response status code:', statusCode);
    console.log('Response content:', contentText);
    
    if (statusCode === 200) {
      var emails = JSON.parse(contentText);
      console.log('Total emails received:', emails.length);
      return emails;
    } else {
      console.error('Error fetching emails. Status code:', statusCode, 'Response:', contentText);
      return [];
    }
  } catch (error) {
    console.error('Error fetching saved emails:', error);
    return [];
  }
}

function triggerOttoFill(e) {
  console.log('triggerOttoFill called with event:', JSON.stringify(e));
  
  // Check if messageMetadata exists and has a messageId
  if (!e.messageMetadata || !e.messageMetadata.messageId) {
    console.error('No valid messageId found in the event object');
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Error: Unable to retrieve message ID"))
      .build();
  }

  var messageId = e.messageMetadata.messageId;
  console.log('Retrieved messageId:', messageId);

  try {
    var message = GmailApp.getMessageById(messageId);
    if (!message) {
      throw new Error('Unable to retrieve message with ID: ' + messageId);
    }

    var userEmail = Session.getActiveUser().getEmail();
    
    var emailDetails = {
      subject: message.getSubject(),
      from: message.getFrom(),
      timestamp: message.getDate().toISOString(),
      body: message.getPlainBody().substring(0, 1000),
      user: userEmail,
      status: "new",  // Set the initial status to "new"
      messageId: messageId
    };

    var url = SERVER_URL + "/email";
    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(emailDetails),
      'muteHttpExceptions': true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    var contentText = response.getContentText();
    
    if (statusCode === 200) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Email details sent to OttoFill successfully!"))
        .setNavigation(CardService.newNavigation().updateCard(createHomepageCard()))
        .build();
    } else {
      throw new Error('Unexpected status code: ' + statusCode + '. Response: ' + contentText);
    }
  } catch (error) {
    console.error('Error in triggerOttoFill:', error);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Failed to send email details to OttoFill. Error: " + error.message))
      .build();
  }
}

function addToOttoQueue(e) {
  console.log('addToOttoQueue called with event:', JSON.stringify(e));
  
  var messageId;
  if (e.gmail && e.gmail.messageId) {
    // Called from universal action
    messageId = e.gmail.messageId;
  } else if (e.messageMetadata && e.messageMetadata.messageId) {
    // Called from contextual trigger
    messageId = e.messageMetadata.messageId;
  } else if (e.parameters && e.parameters.messageId) {
    // Called from card action
    messageId = e.parameters.messageId;
  } else {
    console.error('No valid messageId found in the event object');
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Error: Unable to retrieve message ID"))
      .build();
  }

  console.log('Retrieved messageId:', messageId);

  try {
    var message = GmailApp.getMessageById(messageId);
    if (!message) {
      throw new Error('Unable to retrieve message with ID: ' + messageId);
    }

    var userEmail = Session.getActiveUser().getEmail();
    
    var emailDetails = {
      subject: message.getSubject(),
      from: message.getFrom(),
      timestamp: message.getDate().toISOString(),
      body: message.getPlainBody().substring(0, 1000),
      user: userEmail,
      status: "new",
      messageId: messageId
    };

    var url = SERVER_URL + "/email";
    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(emailDetails),
      'muteHttpExceptions': true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    var contentText = response.getContentText();
    
    if (statusCode === 200) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Message added to Otto Queue successfully!"))
        .build();
    } else {
      throw new Error('Unexpected status code: ' + statusCode + '. Response: ' + contentText);
    }
  } catch (error) {
    console.error('Error in addToOttoQueue:', error);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Failed to add message to Otto Queue. Error: " + error.message))
      .build();
  }
}

function viewSavedEmails(e) {
  var userEmail = Session.getActiveUser().getEmail();
  var url = SERVER_URL + "/email";
  
  try {
    var response = UrlFetchApp.fetch(url);
    var statusCode = response.getResponseCode();
    var contentText = response.getContentText();
    
    if (statusCode === 200) {
      var emails = JSON.parse(contentText);
      var userEmails = emails.filter(function(email) {
        return email.user === userEmail;
      });
      
      var card = CardService.newCardBuilder();
      card.setHeader(CardService.newCardHeader().setTitle("Saved Emails"));
      
      var section = CardService.newCardSection();
      
      if (userEmails.length > 0) {
        userEmails.forEach(function(email) {
          section.addWidget(CardService.newKeyValue()
            .setTopLabel(email.subject)
            .setContent(email.from)
            .setBottomLabel(new Date(email.timestamp).toLocaleString()));
        });
      } else {
        section.addWidget(CardService.newTextParagraph().setText("No saved emails found for " + userEmail));
      }
      
      card.addSection(section);
      
      return card.build();
    } else {
      throw new Error('Unexpected status code: ' + statusCode + '. Response: ' + contentText);
    }
  } catch (error) {
    console.error('Error retrieving saved emails:', error);
    return CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle("Error"))
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText("Failed to retrieve saved emails. Error: " + error.message)))
      .build();
  }
}

function onGmailMessage(e) {
  console.log('onGmailMessage triggered:', JSON.stringify(e));

  var accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  var messageId = e.gmail.messageId;

  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle("OttoFill Actions"));

  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextButton()
    .setText("Add to Otto Queue")
    .setOnClickAction(CardService.newAction().setFunctionName("addToOttoQueue").setParameters({messageId: messageId})));

  card.addSection(section);

  return card.build();
}

function onGmailMessageOpen(e) {
  console.log('onGmailMessageOpen triggered:', JSON.stringify(e));

  var accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  var messageId = e.gmail.messageId;

  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle("OttoFill"));

  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextButton()
    .setText("Add to Otto Queue")
    .setOnClickAction(CardService.newAction().setFunctionName("addToOttoQueue").setParameters({messageId: messageId})));

  card.addSection(section);

  return card.build();
}