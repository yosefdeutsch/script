/**
 * Builds the homepage interface for the add-on.
 * This runs when you open the add-on from the Gmail sidebar.
 */
function buildHomepage(e) {
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle("Image to Inbox"));

  var section = CardService.newCardSection();

  // Create a text input for the URL
  var urlInput = CardService.newTextInput()
    .setFieldName("imageUrl")
    .setTitle("Paste Image URL")
    .setHint("Must be a public HTTP/HTTPS link");

  // Create a button to trigger the sending action
  var action = CardService.newAction().setFunctionName("processImage");
  var button = CardService.newTextButton()
    .setText("Send to Inbox")
    .setOnClickAction(action)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED);

  section.addWidget(urlInput);
  section.addWidget(button);

  card.addSection(section);

  return card.build();
}

/**
 * Triggered when the user clicks the "Send to Inbox" button.
 */
function processImage(e) {
  var imageUrl = e.formInput.imageUrl;

  if (!imageUrl) {
    return createNotification("Please paste a valid URL.");
  }

  try {
    // Fetch the image from the provided URL
    var response = UrlFetchApp.fetch(imageUrl);
    var blob = response.getBlob();
    
    // Get the user's own email address
    var userEmail = Session.getActiveUser().getEmail();

    // Send the email with the image attached
    MailApp.sendEmail({
      to: userEmail,
      subject: "Image from your Gmail Add-on",
      body: "Here is the image you requested from: " + imageUrl,
      attachments: [blob]
    });

    return createNotification("Success! Image sent to your inbox.");

  } catch (error) {
    // If fetching the image or sending the email fails
    return createNotification("Error: " + error.message);
  }
}

/**
 * Helper function to show small toast notifications at the bottom of the screen.
 */
function createNotification(message) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(message))
    .build();
}