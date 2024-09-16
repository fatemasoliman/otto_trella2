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
  
  try {
    var response = UrlFetchApp.fetch(url);
    var statusCode = response.getResponseCode();
    var contentText = response.getContentText();
    
    if (statusCode === 200) {
      var emails = JSON.parse(contentText);
      return emails.filter(function(email) {
        return email.user === userEmail;
      });
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
  var messageId = e.messageMetadata.messageId;
  var message = GmailApp.getMessageById(messageId);
  var userEmail = Session.getActiveUser().getEmail();
  
  var emailDetails = {
    subject: message.getSubject(),
    from: message.getFrom(),
    timestamp: message.getDate().toISOString(),
    body: message.getPlainBody().substring(0, 1000),
    user: userEmail,
    status: "new"
  };

  var url = SERVER_URL + "/email";
  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(emailDetails),
    'muteHttpExceptions': true
  };
  
  try {
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
    console.error('Error sending email details to OttoFill:', error);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Failed to send email details to OttoFill. Error: " + error.message))
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