function doPost(e) {
  // Put YOUR actual email address here
  var myEmail = "yosefadeutsch@gmail.com"; 
  
  try {
    var data = JSON.parse(e.postData.contents);
    var imageUrl = data.imageUrl;

    var blob;
    if (imageUrl.indexOf("base64,") > -1) {
      var parts = imageUrl.split("base64,");
      var mimeType = parts[0].split(":")[1].split(";")[0];
      var decoded = Utilities.base64Decode(parts[1]);
      blob = Utilities.newBlob(decoded, mimeType, "image." + mimeType.split("/")[1]);
    } else {
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