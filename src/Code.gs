function sendEmailAlert(e) {
  var myEmail = "tripsinbirkas@gmail.com"; 
  var folderId = "1-VJV-erm-TPEITzBa_1oe4eD1vqmESec";
  var subject = "New Group Sign-Up";
  
  var userEmail = "No email provided";
  var userName = "Not provided";

  if (typeof e === "undefined") {
    return; 
  }

  try {
    if (e.response) {
      userEmail = e.response.getRespondentEmail() || userEmail;
      var items = e.response.getItemResponses();
      
      for (var i = 0; i < items.length; i++) {
        var title = items[i].getItem().getTitle();
        if (title.indexOf("Name") !== -1 || title.indexOf("שם") !== -1) {
          userName = items[i].getResponse() || userName;
        }
      }
    }
  } catch (error) {
    // Ignore extraction errors
  }
  
  var nameParts = userName.split(" ");
  var firstName = nameParts[0] || "Unknown";
  var lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

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

  try {
    var message = "Someone new has filled out the form:\n\n";
    message += "Name: " + userName + "\n";
    message += "Email: " + userEmail + "\n\n";
    
    message += "--- Automation Status ---\n";
    message += "Contacts Saved: " + contactStatus + "\n";
    message += "Drive Access Granted: " + driveStatus + "\n";
    
    MailApp.sendEmail(myEmail, subject, message);
  } catch (error) {
    // Ignore email errors
  }
}