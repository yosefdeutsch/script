function sendEmailAlert(e) {
  // --- 1. YOUR SETTINGS ---
  var myEmail = "tripsinbirkas@gmail.com"; 
  var folderId = "1-VJV-erm-TPEITzBa_1oe4eD1vqmESec";
  var subject = "New Group Sign-Up";
  
  var userEmail = "No email provided";
  var userName = "Not provided";

  // --- 2. STOP IF RUN MANUALLY ---
  // This is the shield that prevents the script from crashing if you click "Run" in the editor.
  if (typeof e === "undefined") {
    Logger.log("⚠️ STOP: You cannot click 'Run' to test this script. It only works when someone actually submits the Google Form.");
    return; 
  }

  // --- 3. EXTRACT FORM DATA ---
  try {
    if (e.response) {
      userEmail = e.response.getRespondentEmail() || userEmail;
      var items = e.response.getItemResponses();
      
      for (var i = 0; i < items.length; i++) {
        var title = items[i].getItem().getTitle();
        if (title.includes("Name") || title.includes("שם")) {
          userName = items[i].getResponse() || userName;
        }
      }
    }
  } catch (error) {
    Logger.log("Error extracting form data: " + error.toString());
  }
  
  var nameParts = userName.split(" ");
  var firstName = nameParts[0] || "Unknown";
  var lastName = nameParts.slice(1).join(" ") || "";

  // --- 4. GOOGLE CONTACTS AUTOMATION ---
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
    var existingGroups = People.ContactGroups.list().contactGroups || [];
    
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
    contactStatus = "Failed (" + error.message + ")";
  }

  // --- 5. GOOGLE DRIVE PROVISIONING ---
  var driveStatus = "Skipped/Failed";
  try {
    if (userEmail && userEmail !== "No email provided") {
      var folder = DriveApp.getFolderById(folderId);
      folder.addViewer(userEmail); 
      driveStatus = "Success";
    }
  } catch (error) {
    driveStatus = "Failed (" + error.message + ")";
  }

  // --- 6. SEND EMAIL NOTIFICATION ---
  try {
    var message = "Someone new has filled out the form:\n\n";
    message += "Name: " + userName + "\n";
    message += "Email: " + userEmail + "\n\n";
    
    message += "--- Automation Status ---\n";
    message += "Contacts Saved: " + contactStatus + "\n";
    message += "Drive Access Granted: " + driveStatus + "\n";
    
    MailApp.sendEmail(myEmail, subject, message);
  } catch (error) {
    Logger.log("Email failed to send: " + error.toString());
  }
}