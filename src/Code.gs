// --- PASTE YOUR SPREADSHEET ID HERE ---
var SHEET_ID = '1JXRpPablVJQll5_RvLXBhk_HKUej6aGy1kfBtYxZluc'; 

/**
 * This builds the beautiful right-sidebar UI when you open an email.
 */
/**
 * The UPGRADED beautiful right-sidebar UI.
 */
function buildSidebarUI(e) {
  var card = CardService.newCardBuilder();
  
  // 1. Add a Professional Header
  card.setHeader(CardService.newCardHeader()
      .setTitle("Ghost Draft Assistant")
      .setSubtitle("1-Click Email Replies")
      .setImageStyle(CardService.ImageStyle.CIRCLE)
      .setImageUrl("https://www.gstatic.com/images/icons/material/system/1x/auto_awesome_black_24dp.png"));

  var section = CardService.newCardSection().setHeader("⚡ Quick Templates");

  var messageId = e.gmail.messageId;
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var text = data[i][1];
    var driveId = data[i][2];

    if (name) {
      // Package the data
      var action = CardService.newAction()
        .setFunctionName("createGhostDraft")
        .setParameters({ 
          "messageId": messageId, 
          "text": text || "", 
          "driveId": driveId || "" 
        });

      // Create a short preview of the text for the bottom label (max 35 characters)
      var textPreview = "File Attachment Only";
      if (text) {
         textPreview = String(text).substring(0, 35);
         if (String(text).length > 35) textPreview += "...";
      }

      // 2. Build the upgraded Decorated Text Row
      var row = CardService.newDecoratedText()
        .setText("<b>" + name + "</b>")
        .setBottomLabel(textPreview)
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
        .setButton(CardService.newTextButton()
          .setText("Draft It")
          .setOnClickAction(action));

      section.addWidget(row);
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