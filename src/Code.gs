function sendEmailAlert(e) {
  // Replace with the email address where you want to receive notifications
  var myEmail = "tripsinbirkas@gmail.com"; 
  var folderId = "1-VJV-erm-TPEITzBa_1oe4eD1vqmESec";
  var subject = "New Group Sign-Up";
  
  // 1. Grabs the automatically collected email address
  var userEmail = e.response.getRespondentEmail();
  
  // 2. Looks through the answers to find just the name
  var userName = "Not provided";
  var itemResponses = e.response.getItemResponses();
  
  for (var i = 0; i < itemResponses.length; i++) {
    var title = itemResponses[i].getItem().getTitle();
    
    // Checks if the question title contains "Name" (English) or "שם" (Hebrew)
    if (title.includes("Name") || title.includes("שם")) {
      userName = itemResponses[i].getResponse();
    }
  }
  
  // 3. Splits the name into first and last name so Contacts formats it correctly
  var nameParts = userName.split(" ");
  var firstName = nameParts[0] || "Unknown";
  var lastName = nameParts.slice(1).join(" ") || "";
  
  var contactStatus = "Success";
  try {
    // 4. Creates the new contact using the People API
    var newContact = {
      names: [{ givenName: firstName, familyName: lastName }],
      emailAddresses: [{ value: userEmail }]
    };
    var createdPerson = People.People.createContact(newContact);
    var personResourceName = createdPerson.resourceName;
    
    // 5. Handles the Contact Group (Label)
    var groupName = "Group Registration";
    var groupResourceName = null;
    
    // Checks if the group already exists
    var groupsResponse = People.ContactGroups.list();
    var existingGroups = groupsResponse.contactGroups || [];
    
    for (var j = 0; j < existingGroups.length; j++) {
      if (existingGroups[j].name === groupName) {
        groupResourceName = existingGroups[j].resourceName;
        break;
      }
    }
    
    // If the group doesn't exist yet, it creates it
    if (!groupResourceName) {
      var newGroup = People.ContactGroups.create({
        contactGroup: { name: groupName }
      });
      groupResourceName = newGroup.resourceName;
    }
    
    // 6. Adds the new contact to the group
    People.ContactGroups.Members.modify({
      resourceNamesToAdd: [personResourceName]
    }, groupResourceName);
    
  } catch (error) {
    contactStatus = "Failed";
    // If the contact creation fails, it will log the error but still send you the email
    Logger.log("Contact creation failed: " + error.toString());
  }

  // --- NEW ADDITION: GOOGLE DRIVE SHARING ---
  var driveStatus = "Success";
  try {
    if (userEmail) {
      var folder = DriveApp.getFolderById(folderId);
      folder.addViewer(userEmail);
    }
  } catch (error) {
    driveStatus = "Failed";
    Logger.log("Drive sharing failed: " + error.toString());
  }
  
  // 7. Formats and sends your clean, simple notification email
  var message = "Someone new has filled out the form:\n\n";
  message += "Name: " + userName + "\n";
  message += "Email: " + userEmail + "\n\n";
  message += "--- Automation Status ---\n";
  message += "Contacts Saved: " + contactStatus + "\n";
  message += "Drive Access Granted: " + driveStatus + "\n";
  
  MailApp.sendEmail(myEmail, subject, message);
}