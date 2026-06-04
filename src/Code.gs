function sendEmailAlert(e) {
  var myEmail = "tripsinbirkas@gmail.com";
  var folderId = "1-VJV-erm-TPEITzBa_1oe4eD1vqmESec";
  var subject = "New Group Sign-Up";
  
  var userEmail = "No email provided";
  var userName = "Not provided";
  
  // Safety check to prevent crashing if there is no form data
  if (!e || !e.response) {
    return;
  }
  
  // 1. EXTRACT FORM DATA
  try {
    userEmail = e.response.getRespondentEmail();
    var items = e.response.getItemResponses();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var title = item.getItem().getTitle();
      // Uses safe unicode code for the Hebrew word 'שם' to prevent copy-paste errors
      if (title.indexOf("Name") !== -1 || title.indexOf("\u05e9\u05dd") !== -1) {
        userName = item.getResponse();
      }
    }
  } catch (err) {
    // Failsafe for data extraction
  }
  
  var firstName = "Unknown";
  var lastName = "";
  if (userName) {
    var nameParts = userName.split(" ");
    firstName = nameParts[0];
    if (nameParts.length > 1) {
      nameParts.shift();
      lastName = nameParts.join(" ");
    }
  }
  
  // 2. GOOGLE CONTACTS AUTOMATION
  try {
    var newContact = {
      "names": [{ "givenName": firstName, "familyName": lastName }],
      "emailAddresses": [{ "value": userEmail }]
    };
    var createdPerson = People.People.createContact(newContact);
    var personResourceName = createdPerson.resourceName;
    
    var groupName = "Group Registration";
    var groupResourceName = "";
    
    var listResponse = People.ContactGroups.list();
    var existingGroups = listResponse.contactGroups;
    if (existingGroups) {
      for (var j = 0; j < existingGroups.length; j++) {
        if (existingGroups[j].name === groupName) {
          groupResourceName = existingGroups[j].resourceName;
          break;
        }
      }
    }
    
    if (!groupResourceName) {
      var groupResource = {
        "contactGroup": {
          "name": groupName
        }
      };
      var newGroup = People.ContactGroups.create(groupResource);
      groupResourceName = newGroup.resourceName;
    }
    
    var modifyRequest = {
      "resourceNamesToAdd": [personResourceName]
    };
    People.ContactGroups.Members.modify(modifyRequest, groupResourceName);
  } catch (err) {
    // Failsafe for contacts
  }
  
  // 3. GOOGLE DRIVE PROVISIONING
  try {
    if (userEmail && folderId) {
      var folder = DriveApp.getFolderById(folderId);
      folder.addViewer(userEmail);
    }
  } catch (err) {
    // Failsafe for drive sharing
  }
  
  // 4. SEND EMAIL NOTIFICATION
  try {
    var message = "Someone new has filled out the form:\n\nName: " + userName + "\nEmail: " + userEmail;
    MailApp.sendEmail(myEmail, subject, message);
  } catch (err) {
    // Failsafe for email delivery
  }
}