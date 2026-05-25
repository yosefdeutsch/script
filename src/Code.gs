var SHEET_ID = '1JXRpPablVJQll5_RvLXBhk_HKUej6aGy1kfBtYxZluc'; // <--- PUT YOUR ID HERE

function buildComposeUI(e) {
  var card = CardService.newCardBuilder();
  
  // THE CONTEXT DETECTIVE: Read the draft subject
  var subject = "";
  if (e.gmail && e.gmail.draftMetadata && e.gmail.draftMetadata.subject) {
    subject = e.gmail.draftMetadata.subject.toLowerCase();
  }

  // --- FEATURE 1: SMART CALENDAR ---
  var calSection = CardService.newCardSection().setHeader("📅 Smart Actions");
  calSection.addWidget(CardService.newTextButton()
    .setText("Insert My Free Time (Next 3 Days)")
    .setOnClickAction(CardService.newAction().setFunctionName("insertCalendarSlots")));
  card.addSection(calSection);

  // --- READ THE DATABASE ---
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  var data = sheet.getDataRange().getValues();

  var contextSection = CardService.newCardSection().setHeader("🎯 Suggested for this Email");
  var allSection = CardService.newCardSection().setHeader("🗄️ All Snippets & Files");
  var hasSuggestions = false;

  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var text = data[i][1];
    var driveId = data[i][2];
    var keywords = data[i][3] ? data[i][3].toString().toLowerCase() : "";

    if (!name) continue;

    // Build the action for this button
    var action = CardService.newAction()
      .setFunctionName("insertVaultSnippet")
      .setParameters({ "text": text || "", "driveId": driveId || "" });

    var button = CardService.newTextButton().setText(name).setOnClickAction(action);
    
    // Check if keywords match the email subject
    var isMatch = false;
    if (keywords && subject) {
       var kwArray = keywords.split(",");
       for (var k = 0; k < kwArray.length; k++) {
         if (subject.indexOf(kwArray[k].trim()) > -1) {
            isMatch = true;
            break;
         }
       }
    }

    if (isMatch) {
       contextSection.addWidget(button);
       hasSuggestions = true;
    }
    allSection.addWidget(button);
  }

  if (hasSuggestions) card.addSection(contextSection);
  card.addSection(allSection);

  return [card.build()];
}

/**
 * FEATURE 2: THE VAULT (Inserts Text + Drive Links)
 */
function insertVaultSnippet(e) {
  var text = e.parameters.text;
  var driveId = e.parameters.driveId;
  var finalHtml = text + "<br><br>";
  
  if (driveId) {
     try {
       var file = DriveApp.getFileById(driveId);
       var url = file.getUrl();
       var name = file.getName();
       finalHtml += "📁 <b>Attached Document:</b> <a href='" + url + "'>" + name + "</a><br>";
     } catch (err) {
       finalHtml += "<i>(⚠️ Could not fetch Drive file. Please check the ID in your Sheet.)</i>";
     }
  }

  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      .addUpdateContent(finalHtml, CardService.ContentType.MUTABLE_HTML)
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}

/**
 * FEATURE 3: SMART CALENDAR ALGORITHM
 */
function insertCalendarSlots(e) {
  var cal = CalendarApp.getDefaultCalendar();
  var now = new Date();
  var html = "Here are a few times I am available over the coming days:<ul>";
  var slotsFound = 0;

  // Look ahead up to 4 days, max 4 slots
  for (var d = 1; d <= 4 && slotsFound < 4; d++) { 
    var date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    if (date.getDay() === 6 || date.getDay() === 0) continue; // Skip weekends
    
    var workStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0, 0); // 9 AM
    var workEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17, 0, 0);  // 5 PM
    
    var events = cal.getEvents(workStart, workEnd);
    var currentCheck = workStart;
    
    for (var i = 0; i < events.length; i++) {
      var evStart = events[i].getStartTime();
      var evEnd = events[i].getEndTime();
      
      // If there is at least a 1-hour gap
      if (evStart.getTime() - currentCheck.getTime() >= 60 * 60 * 1000) {
         html += "<li>" + date.toDateString() + " at " + currentCheck.getHours() + ":00</li>";
         slotsFound++;
      }
      if (evEnd > currentCheck) currentCheck = evEnd;
    }
    
    // Check for a gap after the last event of the day
    if (workEnd.getTime() - currentCheck.getTime() >= 60 * 60 * 1000 && slotsFound < 4) {
       html += "<li>" + date.toDateString() + " at " + currentCheck.getHours() + ":00</li>";
       slotsFound++;
    }
  }
  
  if (slotsFound === 0) html += "<li><i>My calendar is booked solid for the next few days. Please suggest a time!</i></li>";
  html += "</ul>";

  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      .addUpdateContent(html, CardService.ContentType.MUTABLE_HTML)
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}