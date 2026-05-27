function doPost(e) {
  try {
    // 1. Parse the request sent from your Render server
    const data = JSON.parse(e.postData.contents);
    const videoUrl = data.videoUrl;
    const fileName = data.fileName || "downloaded_video.mp4";

    // 2. Fetch the video directly from the URL
    const response = UrlFetchApp.fetch(videoUrl);
    const blob = response.getBlob().setName(fileName);

    // 3. Save the file to your Google Drive root folder
    const file = DriveApp.createFile(blob);

    // 4. Return a success message with the Drive file link
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: file.getId(),
      fileUrl: file.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Return an error if something goes wrong
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}