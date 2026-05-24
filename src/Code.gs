/**
 * Builds the persistent sidebar UI.
 */
function buildHomepage(e) {
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle("Save Video to Drive"));

  var section = CardService.newCardSection();

  var urlInput = CardService.newTextInput()
      .setFieldName("videoUrl")
      .setTitle("Paste direct video link here (e.g., ends in .mp4)");

  var action = CardService.newAction().setFunctionName("saveVideoToDrive");

  var button = CardService.newTextButton()
      .setText("Download to Drive")
      .setOnClickAction(action);

  section.addWidget(urlInput);
  section.addWidget(button);
  card.addSection(section);

  return card.build();
}

/**
 * Triggered when the user clicks the "Download" button.
 */
function saveVideoToDrive(e) {
  var originalUrl = e.formInput.videoUrl;

  if (!originalUrl) {
    return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Please enter a URL first."))
        .build();
  }

  try {
    // 1. Send the link to the free Cobalt API to extract the raw video
    var cobaltEndpoint = "https://api.cobalt.tools/";
    
    var payload = {
      "url": originalUrl
    };

    var options = {
      "method": "post",
      "contentType": "application/json",
      "headers": {
        "Accept": "application/json"
      },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true // Allows us to read error messages if it fails
    };

    var response = UrlFetchApp.fetch(cobaltEndpoint, options);
    var json = JSON.parse(response.getContentText());

    // Check if Cobalt successfully found the video
    if (json.status === "error") {
       return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Cobalt Error: " + json.text))
        .build();
    }

    // 2. Cobalt gives us a direct download URL (json.url). Let's fetch the actual video file.
    var videoDownloadUrl = json.url;
    var videoResponse = UrlFetchApp.fetch(videoDownloadUrl);
    var blob = videoResponse.getBlob();

    // 3. Save it to the root of the user's Google Drive
    var file = DriveApp.createFile(blob);

    // 4. Show a success message
    return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Success! Saved to Drive: " + file.getName()))
        .build();

  } catch (error) {
    return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Failed: " + error.message))
        .build();
  }
}