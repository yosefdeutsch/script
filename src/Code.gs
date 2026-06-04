function sendEmailAlert(e) {
  var myEmail = "tripsinbirkas@gmail.com";
  var folderId = "1-VJV-erm-TPEITzBa_1oe4eD1vqmESec";
  var subject = "New Group Sign-Up";
  
  var userEmail = "No email provided";
  var userName = "Not provided";
  
  // Safety check to ensure it doesn't crash if opened manually
  if (!e || !e.response) {
    return;
  }
  
  // 1. EXTRACT NAME AND EMAIL FROM FORM
  try {
    userEmail = e.response.getRespondentEmail() || userEmail;
    var items = e.response.getItemResponses();
    for (var i = 0; i < items.length; i++) {
      var title = items[i].getItem().getTitle();
      if (title.indexOf("Name") !== -1 || title.indexOf("\u05e9\u05dd") !== -1) {
        userName = items[i].getResponse() || userName;
      }
    }
  } catch (err) {
    // Fallback if data extraction fails
  }
  
  // 2. NATIVE GOOGLE DRIVE SHARING
  var driveStatus = "Not processed";
  try {
    if (userEmail && userEmail !== "No email provided") {
      var folder = DriveApp.getFolderById(folderId);
      folder.addViewer(userEmail);
      driveStatus = "Success";
    }
  } catch (err) {
    driveStatus = "Error: " + err.message;
  }
  
  // 3. SEND THE EMAIL NOTIFICATION
  try {
    var message = "Someone new has filled out the form:\n\n" +
                  "Name: " + userName + "\n" +
                  "Email: " + userEmail + "\n\n" +
                  "Drive Folder Share Status: " + driveStatus;
                  
    MailApp.sendEmail(myEmail, subject, message);
  } catch (err) {
    // Fallback if email system fails
  }
}