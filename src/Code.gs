// 1. Builds the visual interface for the Gmail sidebar
function buildAddOn(e) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Save Video to Drive"));

  var section = CardService.newCardSection();

  var urlInput = CardService.newTextInput()
    .setFieldName("videoUrl")
    .setTitle("Video URL (required)");

  var nameInput = CardService.newTextInput()
    .setFieldName("fileName")
    .setTitle("File Name (optional)");

  var action = CardService.newAction().setFunctionName("handleDownload");
  var button = CardService.newTextButton()
    .setText("Download to Drive")
    .setOnClickAction(action)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED);

  section.addWidget(urlInput);
  section.addWidget(nameInput);
  section.addWidget(button);
  
  card.addSection(section);
  return card.build();
}

// 2. Handles the button click in Gmail
function handleDownload(e) {
  var url = e.formInput.videoUrl;
  var name = e.formInput.fileName || "downloaded_video.mp4";

  if (!url) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Please enter a valid URL."))
      .build();
  }

  // Call our core download function
  var result = processVideoDownload(url, name);

  if (result.success) {
    // Build a success screen with a link to open the file
    var openLink = CardService.newOpenLink().setUrl(result.fileUrl);
    var viewButton = CardService.newTextButton()
      .setText("Open in Drive")
      .setOpenLink(openLink);

    var successSection = CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText("✅ Successfully saved to your Drive!"))
      .addWidget(viewButton);

    var successCard = CardService.newCardBuilder().addSection(successSection).build();

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(successCard))
      .build();
  } else {
    // Show a popup notification if it fails
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Error: " + result.error))
      .build();
  }
}

// 3. Keeps the API working for your Render Server
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = processVideoDownload(data.videoUrl, data.fileName || "downloaded_video.mp4");
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 4. The Core Download Logic (Used by both Gmail and Render)
function processVideoDownload(videoUrl, fileName) {
  try {
    const response = UrlFetchApp.fetch(videoUrl);
    const blob = response.getBlob().setName(fileName);
    const file = DriveApp.createFile(blob);
    
    return { success: true, fileId: file.getId(), fileUrl: file.getUrl() };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
function forceAuth() {
  // This forces Google to ask for file CREATION permissions specifically
  DriveApp.createFile("auth_test.txt", "You can delete this file.");
  UrlFetchApp.fetch("https://www.google.com");
}