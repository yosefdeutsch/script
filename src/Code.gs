function sendEmailAlert(e) {
  // --- 1. YOUR SETTINGS ---
  var myEmail = "tripsinbirkas@gmail.com"; 
  var folderId = "1-VJV-erm-TPEITzBa_1oe4eD1vqmESec";
  var subject = "New Group Sign-Up";
  
  var userEmail = "No email provided";
  var userName = "Not provided";

  // --- 2. SAFELY EXTRACT FORM DATA ---
  try {
    // This ensures the script doesn't crash if it's run without form data
    if (e && e.response) {
      userEmail = e.response.getRespondentEmail() || userEmail;
      var itemResponses = e.response.getItemResponses();
      
      for (var i = 0; i < itemResponses.length; i++) {
        var title = itemResponses[i].getItem().getTitle();
        if (title.includes("Name") || title.includes("שם")) {
          userName = itemResponses[i].getResponse() || userName;
        }
      }
    } else {
      Logger.log("Script was run manually, not by a form trigger. 'e' is undefined.");
      return; // Stops the script safely if you accidentally click "Run" in the editor
    }
  } catch (error) {
    Logger.log("Error extracting form data: " + error.toString());
  }
  
  var nameParts = userName.split(" ");
  var firstName = nameParts[0] || "Unknown";
  var lastName = nameParts.slice(1).join(" ") || "";

  // --- 3. GOOGLE CONTACTS AUTOMATION ---
  var contactStatus = "Skipped/Failed";
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
    contactStatus = "Success";
  } catch (error) {
    Logger.log("Contact failed: " + error.toString());
    contactStatus = "Failed (" + error.message + ")";
  }

  // --- 4. GOOGLE DRIVE PROVISIONING ---
  var driveStatus = "Skipped/Failed";
  try {
    if (userEmail && userEmail !== "No email provided") {
      var folder = DriveApp.getFolderById(folderId);
      folder.addViewer(userEmail); 
      driveStatus = "Success";
    }
  } catch (error) {
    Logger.log("Drive sharing failed: " + error.toString());
    driveStatus = "Failed (" + error.message + ")";
  }

  // --- 5. SEND EMAIL NOTIFICATION ---
  try {
    var message = "Someone new has filled out the form:\n\n";
    message += "Name: " + userName + "\n";
    message += "Email: " + userEmail + "\n\n";
    
    // This tells you exactly what worked and what didn't inside the email
    message += "--- Automation Status ---\n";
    message += "Contacts Saved: " + contactStatus + "\n";
    message += "Drive Access Granted: " + driveStatus + "\n";
    
    MailApp.sendEmail(myEmail, subject, message);
  } catch (error) {
    Logger.log("Email failed to send: " + error.toString());
  }
}