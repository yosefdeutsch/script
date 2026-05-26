// --- PASTE YOUR SPREADSHEET ID HERE ---
var SHEET_ID = '1JXRpPablVJQll5_RvLXBhk_HKUej6aGy1kfBtYxZluc'; 

/**
 * 1. THE UI: Builds the right-sidebar with Categories and Context Detective!
 */
function buildSidebarUI(e) {
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader()
      .setTitle("Executive Assistant")
      .setSubtitle("Smart Drafts & CRM")
      .setImageStyle(CardService.ImageStyle.CIRCLE)
      .setImageUrl("https://www.gstatic.com/images/icons/material/system/1x/auto_awesome_black_24dp.png"));

  var messageId = e.gmail.messageId;
  var message = GmailApp.getMessageById(messageId);
  var subject = message.getSubject().toLowerCase();

  // Grab the template data from the first sheet
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  var data = sheet.getDataRange().getValues();

  var categories = {};
  var suggested = [];

  // Sort the database
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var text = data[i][1];
    var driveId = data[i][2];
    var keywords = String(data[i][3]).toLowerCase(); // Column D
    var category = data[i][4] || "Uncategorized";    // Column E

    if (name) {
      var item = {name: name, text: text, driveId: driveId};
      var isMatch = false;

      // The Context Detective Logic
      if (keywords && keywords !== "undefined") {
        var keys = keywords.split(',');
        for (var k = 0; k < keys.length; k++) {
          if (subject.indexOf(keys[k].trim()) !== -1) {
            isMatch = true; break;
          }
        }
      }

      if (isMatch) {
        suggested.push(item);
      } else {
        if (!categories[category]) categories[category] = [];
        categories[category].push(item);
      }
    }
  }

  // Build "✨ Suggested" Section
  if (suggested.length > 0) {
    var sugSection = CardService.newCardSection().setHeader("✨ Suggested for this Email");
    for (var s = 0; s < suggested.length; s++) {
       sugSection.addWidget(createRowWidget(suggested[s], messageId));
    }
    card.addSection(sugSection);
  }

  // Build Collapsible Category Sections
  for (var cat in categories) {
    var catSection = CardService.newCardSection()
        .setHeader("📁 " + cat)
        .setCollapsible(true)
        .setNumUncollapsibleWidgets(0); 

    for (var c = 0; c < categories[cat].length; c++) {
       catSection.addWidget(createRowWidget(categories[cat][c], messageId));
    }
    card.addSection(catSection);
  }

  return [card.build()];
}

/**
 * HELPER FUNCTION: Builds the rows for the UI
 */
function createRowWidget(item, messageId) {
  var action = CardService.newAction()
      .setFunctionName("createGhostDraft")
      .setParameters({ "messageId": messageId, "text": item.text || "", "driveId": item.driveId || "", "templateName": item.name });

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
 * 2. THE BRAIN: Generates the draft, injects variables, finds free time, and logs to CRM.
 */
function createGhostDraft(e) {
  var messageId = e.parameters.messageId;
  var text = e.parameters.text;
  var driveId = e.parameters.driveId;
  var templateName = e.parameters.templateName;

  var message = GmailApp.getMessageById(messageId);
  var senderStr = message.getFrom();
  var subject = message.getSubject();
  
  // Extract Name for {{Name}}
  var nameMatch = senderStr.match(/^"?([^"<]+)/);
  var clientName = nameMatch ? nameMatch[1].trim().split(' ')[0] : 'there';
  text = text.replace(/{{Name}}/g, clientName);

  // Extract Calendar for {{Calendar}}
  if (text.indexOf("{{Calendar}}") !== -1) {
    var freeSlots = getNextFreeSlots();
    text = text.replace(/{{Calendar}}/g, freeSlots);
  }

  // Build final HTML with safe Folder Emoji
  var finalHtml = text + "<br><br>";
  if (driveId) {
     try {
       var file = DriveApp.getFileById(driveId);
       finalHtml += "&#128193; <b>Attached Document:</b> <a href='" + file.getUrl() + "'>" + file.getName() + "</a><br>";
     } catch (err) {}
  }

  // Create the silent draft!
  message.createDraftReply("", { htmlBody: finalHtml }); 

  // CRM Logger
  try {
    var logSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Logs');
    var cleanEmail = senderStr.match(/<([^>]+)>/) ? senderStr.match(/<([^>]+)>/)[1] : senderStr;
    logSheet.appendRow([new Date(), cleanEmail, clientName, subject, templateName]);
  } catch(err) {
    // Ignore if 'Logs' sheet isn't created yet
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText("✅ Smart Draft Created & Logged to CRM!")
      .setType(CardService.NotificationType.INFO))
    .build();
}

/**
 * 3. HELPER: The Calendar Detective
 */
function getNextFreeSlots() {
  var cal = CalendarApp.getDefaultCalendar();
  var now = new Date();
  var slots = [];
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (var i = 1; i <= 5 && slots.length < 3; i++) {
    var checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (checkDate.getDay() === 6 || checkDate.getDay() === 0) continue; 
    
    var events = cal.getEventsForDay(checkDate);
    var hoursToCheck = [10, 13, 15]; 
    
    for (var h = 0; h < hoursToCheck.length; h++) {
       var slotStart = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), hoursToCheck[h], 0, 0);
       var slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); 
       
       var conflict = events.some(function(e) {
         return !(e.getEndTime() <= slotStart || e.getStartTime() >= slotEnd);
       });
       
       if (!conflict) {
          var timeString = hoursToCheck[h] > 12 ? (hoursToCheck[h] - 12) + " PM" : hoursToCheck[h] + " AM";
          slots.push(days[slotStart.getDay()] + " at " + timeString);
          if (slots.length >= 3) break;
       }
    }
  }
  
  if (slots.length === 3) return slots[0] + ", " + slots[1] + ", or " + slots[2];
  else if (slots.length > 0) return slots.join(" or ");
  else return "sometime next week"; 
}