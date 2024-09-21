var SERVER_URL = "http://ec2-13-51-0-115.eu-north-1.compute.amazonaws.com:8080";

function onHomepage(e) {
  console.log("onHomepage called");
  return createHomepageCard();
}

function createHomepageCard() {
  console.log("Creating homepage card");
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle("OttoFill"));
  
  var actionSection = CardService.newCardSection();
  actionSection.addWidget(CardService.newTextButton()
    .setText("Add to Queue")
    .setOnClickAction(CardService.newAction().setFunctionName("addToOttoQueue")));
  
  card.addSection(actionSection);
  
  var savedEmailsSection = createSavedEmailsSection();
  card.addSection(savedEmailsSection);
  
  return card.build();
}

function createSavedEmailsSection() {
  console.log("Creating saved emails section");
  var savedEmailsSection = CardService.newCardSection()
    .setHeader("Saved Emails");
  
  try {
    var savedEmails = fetchSavedEmails();
    console.log("Fetched saved emails:", savedEmails);
    if (savedEmails && savedEmails.length > 0) {
      savedEmails.forEach(function(email) {
        savedEmailsSection.addWidget(CardService.newKeyValue()
          .setTopLabel(email.subject || 'No Subject')
          .setContent(email.from || 'Unknown Sender')
          .setBottomLabel(email.timestamp ? new Date(email.timestamp).toLocaleString() : 'Unknown Date')
          .setOnClickAction(CardService.newAction()
            .setFunctionName("previewEmail")
            .setParameters({emailId: email.messageId})));
      });
    } else {
      savedEmailsSection.addWidget(CardService.newTextParagraph().setText("No saved emails found."));
    }
  } catch (error) {
    console.error('Error in createSavedEmailsSection:', error);
    savedEmailsSection.addWidget(CardService.newTextParagraph().setText("Error loading saved emails. Please try again later."));
  }
  
  return savedEmailsSection;
}

function previewEmail(e) {
  var emailId = e.parameters.emailId;
  var email = GmailApp.getMessageById(emailId);
  
  if (!email) {
    return createErrorCard("Unable to retrieve email details.");
  }
  
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle("Email Preview"));
  
  var previewSection = CardService.newCardSection();
  previewSection.addWidget(CardService.newKeyValue()
    .setTopLabel("From")
    .setContent(email.getFrom()));
  previewSection.addWidget(CardService.newKeyValue()
    .setTopLabel("Subject")
    .setContent(email.getSubject()));
  previewSection.addWidget(CardService.newKeyValue()
    .setTopLabel("Date")
    .setContent(email.getDate().toLocaleString()));
  previewSection.addWidget(CardService.newTextParagraph()
    .setText(email.getPlainBody().substring(0, 500) + "..."));
  
  card.addSection(previewSection);
  
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}

function fetchSavedEmails() {
  var userEmail = Session.getActiveUser().getEmail();
  var url = SERVER_URL + "/email";
  
  console.log("Fetching saved emails for user:", userEmail);
  
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
    
    console.log('Fetch response - Status Code:', statusCode, 'Content:', contentText);
    
    if (statusCode === 200) {
      var emails = JSON.parse(contentText);
      console.log('Parsed emails:', emails);
      return emails;
    } else {
      console.error('Error fetching emails. Status code:', statusCode, 'Response:', contentText);
      return [];
    }
  } catch (error) {
    console.error('Error in fetchSavedEmails:', error);
    return [];
  }
}

function addToOttoQueue(e) {
  console.log("addToOttoQueue called", e);
  var threadId = e.gmail ? e.gmail.threadId : 
                 e.messageMetadata ? e.messageMetadata.threadId : 
                 e.parameters ? e.parameters.threadId : null;
  
  if (!threadId) {
    console.error("No thread ID found");
    return createErrorCard("Unable to retrieve thread ID");
  }

  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) {
      throw new Error('Unable to retrieve thread');
    }

    var firstMessage = thread.getMessages()[0]; // Get the first message in the thread
    var messageId = firstMessage.getId();

    var emailDetails = {
      subject: firstMessage.getSubject(),
      from: firstMessage.getFrom(),
      timestamp: firstMessage.getDate().toISOString(),
      body: firstMessage.getPlainBody().substring(0, 1000),
      user: Session.getActiveUser().getEmail(),
      status: "new",
      messageId: messageId
    };

    var response = UrlFetchApp.fetch(SERVER_URL + "/email", {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(emailDetails),
      'muteHttpExceptions': true
    });

    if (response.getResponseCode() === 200) {
      console.log("Message added to queue successfully");
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Message added to Queue successfully!"))
        .setNavigation(CardService.newNavigation().updateCard(createHomepageCard()))
        .build();
    } else {
      throw new Error('Unexpected response from server');
    }
  } catch (error) {
    console.error("Error in addToOttoQueue:", error);
    return createErrorCard("Failed to add message to Queue: " + error.message);
  }
}

function onGmailMessage(e) {
  var accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle("OttoFill Actions"));

  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextButton()
    .setText("Add to Queue")
    .setOnClickAction(CardService.newAction().setFunctionName("addToOttoQueue").setParameters({threadId: e.gmail.threadId})));

  card.addSection(section);

  return card.build();
}

function onGmailMessageOpen(e) {
  return onGmailMessage(e);
}

function createSuccessCard(message) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(message))
    .setNavigation(CardService.newNavigation().updateCard(createHomepageCard()))
    .build();
}

function createErrorCard(message) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(message))
    .build();
}