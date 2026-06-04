function sendEmailAlert(e) {
  // --- 1. YOUR SETTINGS ---
  var myEmail = "tripsinbirkas@gmail.com"; 
  var folderId = "1-VJV-erm-TPEITzBa_1oe4eD1vqmESec"; // The Drive folder ID you just copied
  var sortColumn = 4; // The column number in your Sheet to sort by (1=A, 2=B, 3=C, etc.)
  var subject = "New Group Sign-Up";
  
  // --- 2. EXTRACT FORM DATA ---
  var userEmail = e.response.getRespondentEmail();
  var userName = "Not provided";
  var itemResponses = e.response.getItemResponses();
  
  for (var i = 0; i < itemResponses.length; i++) {
    var title = itemResponses[i].getItem().getTitle();
    if (title.includes("Name") || title.includes("שם")) {
      userName = itemResponses[i].getResponse();
    }
  }
  
  var nameParts = userName.split(" ");
  var firstName = nameParts[0] || "Unknown";
  var lastName = nameParts.slice(1).join(" ") || "";
  
  // --- 3. GOOGLE CONTACTS AUTOMATION ---
  try {
    var newContact = {
      names: [{ givenName: firstName, familyName: lastName }],
      emailAddresses: [{ value: userEmail }]
    };
    var createdPerson = People.People.createContact(newContact);
    var personResourceName = createdPerson.resourceName;
    
    var groupName = "Group Registration";
    var groupResourceName = null;
    var groupsResponse = People.ContactGroups.list();
    var existingGroups = groupsResponse.contactGroups || [];
    
    for (var j = 0; j < existingGroups.length; j++) {
      if (existingGroups[j].name === groupName) {
        groupResourceName = existingGroups[j].resourceName;
        break;
      }
    }
    
    if (!groupResourceName) {
      var newGroup = People.ContactGroups.create({ contactGroup: { name: groupName } });
      groupResourceName = newGroup.resourceName;
    }
    
    People.ContactGroups.Members.modify({ resourceNamesToAdd: [personResourceName] }, groupResourceName);
  } catch (error) {
    Logger.log("Contact failed: " + error.toString());
  }

  // --- 4. NEW: GOOGLE DRIVE PROVISIONING ---
  try {
    // Finds the folder and grants the user "Viewer" access
    var folder = DriveApp.getFolderById(folderId);
    folder.addViewer(userEmail); 
    // Note: Change 'addViewer' to 'addEditor' if you want them to be able to edit the files
  } catch (error) {
    Logger.log("Drive sharing failed: " + error.toString());
  }

  // --- 5. NEW: GOOGLE SHEET SORTING ---
  try {
    var form = FormApp.getActiveForm();
    var sheetId = form.getDestinationId(); // Finds the connected Sheet
    
    if (sheetId) {
      var sheet = SpreadsheetApp.openById(sheetId).getSheets()[0]; // Opens the first tab
      // Selects all data except the header row, then sorts alphabetically
      var dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
      dataRange.sort(sortColumn); 
    }
  } catch (error) {
    Logger.log("Sheet sort failed: " + error.toString());
  }
  
  // --- 6. SEND EMAIL NOTIFICATION ---
  var message = "Someone new has filled out the form:\n\n";
  message += "Name: " + userName + "\n";
  message += "Email: " + userEmail + "\n\n";
  message += "Automations triggered: Contact Saved, Drive Access Granted, Sheet Sorted.";
  
  MailApp.sendEmail(myEmail, subject, message);
}