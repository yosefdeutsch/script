// --- PASTE YOUR SPREADSHEET ID HERE ---
var SHEET_ID = 'PASTE_YOUR_ID_HERE'; 

/**
 * This builds the beautiful right-sidebar UI when you open an email.
 */
function buildSidebarUI(e) {
  var card = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("⚡ 1-Click Ghost Drafts");

  // We must grab the ID of the email you are currently reading
  var messageId = e.gmail.messageId;

  // Open your database
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  var data = sheet.getDataRange().getValues();

  // Loop through your Google Sheet to make the buttons
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var text = data[i][1];
    var driveId = data[i][2];

    if (name) {
      // Package the message ID and your template text into the button
      var action = CardService.newAction()
        .setFunctionName("createGhostDraft")
        .setParameters({ 
          "messageId": messageId, 
          "text": text || "", 
          "driveId": driveId || "" 
        });

      section.addWidget(CardService.newTextButton()
        .setText(name)
        .setOnClickAction(action));
    }
  }

  card.addSection(section);
  return [card.build()];
}

/**
 * THE HACK: This runs silently in the background when you click a button.
 */
function createGhostDraft(e) {
  var messageId = e.parameters.messageId;
  var text = e.parameters.text;
  var driveId = e.parameters.driveId;

  // Build the email body
  var finalHtml = text + "<br><br>";
  
  // If you included a Google Drive File ID, grab it and link it!
  if (driveId) {
     try {
       var file = DriveApp.getFileById(driveId);
       finalHtml += "📁 <b>Attached Document:</b> <a href='" + file.getUrl() + "'>" + file.getName() + "</a><br>";
     } catch (err) {
       // Silently ignore if the ID is blank or wrong
     }
  }

  // Find the exact email you are looking at...
  var message = GmailApp.getMessageById(messageId);
  
  // ...and silently create a draft replying to it!
  message.createDraftReply("", {
    htmlBody: finalHtml
  }); 

  // Flash a success notification on the screen so you know it worked
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText("✅ Draft created! Check your Drafts folder or click 'Reply' to see it.")
      .setType(CardService.NotificationType.INFO))
    .build();
}