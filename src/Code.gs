// --- PASTE YOUR SPREADSHEET ID HERE ---
var SHEET_ID = '1JXRpPablVJQll5_RvLXBhk_HKUej6aGy1kfBtYxZluc'; 

/**
 * 1. THE UI: Builds the right-sidebar with your buttons.
 */
function buildSidebarUI(e) {
  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader()
      .setTitle("Executive Assistant")
      .setSubtitle("Smart Drafts & CRM")
      .setImageStyle(CardService.ImageStyle.CIRCLE)
      .setImageUrl("https://www.gstatic.com/images/icons/material/system/1x/auto_awesome_black_24dp.png"));

  var section = CardService.newCardSection().setHeader("⚡ Quick Templates");
  var messageId = e.gmail.messageId;
  
  // We look at your first tab for the templates (Sheet1)
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var text = data[i][1];
    var driveId = data[i][2];

    if (name) {
      var action = CardService.newAction()
        .setFunctionName("createGhostDraft")
        .setParameters({ "messageId": messageId, "text": text || "", "driveId": driveId || "", "templateName": name });

      var row = CardService.newDecoratedText()
        .setText("<b>" + name + "</b>")
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
        .setButton(CardService.newTextButton().setText("Draft It").setOnClickAction(action));

      section.addWidget(row);
    }
  }
  card.addSection(section);
  return [card.build()];
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
  
  // --- MASSIVE FEATURE 1: Smart Variable Injector (Name) ---
  // Extracts the first name from the "From:" line (e.g., "John Doe <john@email.com>" -> "John")
  var nameMatch = senderStr.match(/^"?([^"<]+)/);
  var clientName = nameMatch ? nameMatch[1].trim().split(' ')[0] : 'there';
  
  // Swap {{Name}} in your text with the real name
  text = text.replace(/{{Name}}/g, clientName);

  // --- MASSIVE FEATURE 2: Zero-Touch Calendar ---
  // If your template uses {{Calendar}}, find 3 open slots in the next few days
  if (text.indexOf("{{Calendar}}") !== -1) {
    var freeSlots = getNextFreeSlots();
    text = text.replace(/{{Calendar}}/g, freeSlots);
  }

  // --- BUILD THE HTML BODY ---
  var finalHtml = text + "<br><br>";
  if (driveId) {
     try {
       var file = DriveApp.getFileById(driveId);
       finalHtml += "&#128193; <b>Attached Document:</b> <a href='" + file.getUrl() + "'>" + file.getName() + "</a><br>";
     } catch (err) {}
  }

  // Create the silent draft!
  message.createDraftReply("", { htmlBody: finalHtml }); 

  // --- MASSIVE FEATURE 3: Silent CRM Logger ---
  try {
    var logSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Logs');
    var cleanEmail = senderStr.match(/<([^>]+)>/) ? senderStr.match(/<([^>]+)>/)[1] : senderStr;
    // Logs: Date, Email Address, Client Name, Subject, Template Used
    logSheet.appendRow([new Date(), cleanEmail, clientName, subject, templateName]);
  } catch(err) {
    // Ignore if the Logs sheet isn't set up right yet
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText("✅ Smart Draft Created & Logged to CRM!")
      .setType(CardService.NotificationType.INFO))
    .build();
}

/**
 * 3. HELPER: The Calendar Detective
 * Scans your default calendar to find 3 open 1-hour blocks on upcoming weekdays.
 */
function getNextFreeSlots() {
  var cal = CalendarApp.getDefaultCalendar();
  var now = new Date();
  var slots = [];
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Look ahead up to 5 days to find 3 empty slots
  for (var i = 1; i <= 5 && slots.length < 3; i++) {
    var checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (checkDate.getDay() === 6 || checkDate.getDay() === 0) continue; // Skip weekends
    
    var events = cal.getEventsForDay(checkDate);
    // Check popular meeting times: 10 AM, 1 PM, and 3 PM
    var hoursToCheck = [10, 13, 15]; 
    
    for (var h = 0; h < hoursToCheck.length; h++) {
       var slotStart = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), hoursToCheck[h], 0, 0);
       var slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); // 1 hour later
       
       // Does this slot overlap with any events on your calendar?
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
  
  // Format the output beautifully for your email
  if (slots.length === 3) {
    return slots[0] + ", " + slots[1] + ", or " + slots[2];
  } else if (slots.length > 0) {
    return slots.join(" or ");
  } else {
    return "sometime next week"; // Fallback if you are completely booked!
  }
}