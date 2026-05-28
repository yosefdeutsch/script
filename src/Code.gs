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
    let finalDownloadUrl = videoUrl;
    let finalFileName = fileName || "downloaded_video.mp4";
    
    // We use this flag if Render is sending us the raw video directly (m3u8)
    let isDirectStream = false; 
    let finalBlob = null;

    // 1. YOUTUBE LOGIC
    if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      const renderApiUrl = "https://cloud-video-bot.onrender.com/api/extract-youtube"; 
      const renderResponse = UrlFetchApp.fetch(renderApiUrl, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ url: videoUrl }),
        muteHttpExceptions: true
      });

      const renderData = JSON.parse(renderResponse.getContentText());
      if (!renderData.success) return { success: false, error: renderData.error };
      
      finalDownloadUrl = renderData.rawVideoUrl;
      if (!fileName) finalFileName = renderData.title + ".mp4"; 
    }
    
    // 2. M3U8 LOGIC
    else if (videoUrl.includes(".m3u8")) {
      const renderApiUrl = "https://cloud-video-bot.onrender.com/api/convert-m3u8";
      
      // Call Render and wait for it to stitch and send back the actual video file
      const renderResponse = UrlFetchApp.fetch(renderApiUrl, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ url: videoUrl }),
        muteHttpExceptions: true
      });

      if (renderResponse.getResponseCode() !== 200) {
        return { success: false, error: "Render failed to convert m3u8 stream." };
      }

      finalBlob = renderResponse.getBlob().setName(finalFileName);
      isDirectStream = true;
    }

    // 3. FINAL SAVE TO DRIVE
    let file;
    if (isDirectStream) {
      // If it was m3u8, Render already handed us the video blob
      file = DriveApp.createFile(finalBlob);
    } else {
      // If it was YouTube or a normal mp4, Apps Script downloads it now
      const response = UrlFetchApp.fetch(finalDownloadUrl);
      const blob = response.getBlob().setName(finalFileName);
      file = DriveApp.createFile(blob);
    }
    
    return { success: true, fileId: file.getId(), fileUrl: file.getUrl() };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}