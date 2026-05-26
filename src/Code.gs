// --- PASTE YOUR SPREADSHEET ID HERE ---
var SHEET_ID = '1JXRpPablVJQll5_RvLXBhk_HKUej6aGy1kfBtYxZluc'; 

/**
 * This builds the beautiful right-sidebar UI when you open an email.
 */
/**
 * The UPGRADED beautiful right-sidebar UI.
 */
/**
 * THE ULTIMATE UI: Context Detective + Collapsible Categories
 */
function buildSidebarUI(e) {
  var card = CardService.newCardBuilder();
  
  // The Professional Header
  card.setHeader(CardService.newCardHeader()
      .setTitle("Ghost Draft Assistant")
      .setSubtitle("1-Click Email Replies")
      .setImageStyle(CardService.ImageStyle.CIRCLE)
      .setImageUrl("https://www.gstatic.com/images/icons/material/system/1x/auto_awesome_black_24dp.png"));

  // 1. Grab the email data to feed the Context Detective
  var messageId = e.gmail.messageId;
  var message = GmailApp.getMessageById(messageId);
  var subject = message.getSubject().toLowerCase();

  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  var data = sheet.getDataRange().getValues();

  var categories = {};
  var suggested = [];

  // 2. Sort the database
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var text = data[i][1];
    var driveId = data[i][2];
    var keywords = String(data[i][3]).toLowerCase(); // Column D
    var category = data[i][4] || "Uncategorized";    // Column E

    if (name) {
      var item = {name: name, text: text, driveId: driveId};
      var isMatch = false;

      // 3. The Context Detective Logic: Check if keywords match the subject
      if (keywords && keywords !== "undefined") {
        var keys = keywords.split(',');
        for (var k = 0; k < keys.length; k++) {
          if (subject.indexOf(keys[k].trim()) !== -1) {
            isMatch = true;
            break;
          }
        }
      }

      // Sort into "Suggested" or standard "Categories"
      if (isMatch) {
        suggested.push(item);
      } else {
        if (!categories[category]) categories[category] = [];
        categories[category].push(item);
      }
    }
  }

  // 4. Build the "✨ Suggested" Section (Only shows if there is a match!)
  if (suggested.length > 0) {
    var sugSection = CardService.newCardSection().setHeader("✨ Suggested for this Email");
    for (var s = 0; s < suggested.length; s++) {
       sugSection.addWidget(createRowWidget(suggested[s], messageId));
    }
    card.addSection(sugSection);
  }

  // 5. Build the Collapsible Category Sections
  for (var cat in categories) {
    var catSection = CardService.newCardSection()
        .setHeader("📁 " + cat)
        .setCollapsible(true) // This creates the beautiful dropdown effect!
        .setNumUncollapsibleWidgets(0); 

    for (var c = 0; c < categories[cat].length; c++) {
       catSection.addWidget(createRowWidget(categories[cat][c], messageId));
    }
    card.addSection(catSection);
  }

  return [card.build()];
}

/**
 * HELPER FUNCTION: This builds the beautiful rows so we don't repeat code.
 * (Paste this at the bottom of your Code.gs file)
 */
function createRowWidget(item, messageId) {
  var action = CardService.newAction()
      .setFunctionName("createGhostDraft")
      .setParameters({ "messageId": messageId, "text": item.text || "", "driveId": item.driveId || "" });

  var textPreview = "File Attachment Only";
  if (item.text) {
      textPreview = String(item.text).substring(0, 35);
      if (String(item.text).length > 35) textPreview += "...";
  }

  return CardService.newDecoratedText()
      .setText("<b>" + item.name + "</b>")
      .setBottomLabel(textPreview)
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
      .setButton(CardService.newTextButton().setText("Draft It").setOnClickAction(action));
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