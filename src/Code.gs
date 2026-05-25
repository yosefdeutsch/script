function doPost(e) {
  // Put YOUR actual email address here
  var myEmail = "yosefadeutsch@gmail.com"; 
  
  try {
    var data = JSON.parse(e.postData.contents);
    var imageUrl = data.imageUrl;
    var blob;

    // 1. Smarter check for Base64 Data URIs
    if (imageUrl.startsWith("data:image") && imageUrl.indexOf("base64,") > -1) {
      var parts = imageUrl.split("base64,");
      var mimeType = parts[0].split(":")[1].split(";")[0];
      var decoded = Utilities.base64Decode(parts[1]);
      blob = Utilities.newBlob(decoded, mimeType, "image." + mimeType.split("/")[1]);
    } 
    // 2. Catch URLs that are just too massive for Google's servers
    else if (imageUrl.length > 2048) {
      throw new Error("This site uses an image link that is too long for Google to process. Please try 'Copy Image Address' manually.");
    } 
    // 3. Standard fetch
    else {
      blob = UrlFetchApp.fetch(imageUrl).getBlob();
    }

    MailApp.sendEmail({
      to: myEmail,
      subject: "Image from Chrome Extension",
      body: "Here is the image you sent from the web.",
      attachments: [blob]
    });

    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Run this function manually ONE TIME in the editor 
 * to authorize the script to send emails on your behalf!
 */
function setupPermissions() {
  // Triggers the email permission prompt
  MailApp.getRemainingDailyQuota();
  
  // Triggers the external request permission prompt
  UrlFetchApp.fetch("https://www.google.com"); 
}