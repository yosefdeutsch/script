function sendEmailAlert(e) {
var myEmail = "tripsinbirkas@gmail.com"; 
var folderId = "1-VJV-erm-TPEITzBa_1oe4eD1vqmESec";
var subject = "New Group Sign-Up";
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
var contactStatus = "Success";
try {
var newContact = {names: [{ givenName: firstName, familyName: lastName }], emailAddresses: [{ value: userEmail }]};
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
var newGroup = People.ContactGroups.create({contactGroup: { name: groupName }});
groupResourceName = newGroup.resourceName;
}
People.ContactGroups.Members.modify({resourceNamesToAdd: [personResourceName]}, groupResourceName);
} catch (error) {
contactStatus = "Failed";
Logger.log("Contact failed: " + error.toString());
}
var driveStatus = "Success";
try {
if (userEmail) {
var folder = DriveApp.getFolderById(folderId);
folder.addViewer(userEmail);
}
} catch (error) {
driveStatus = "Failed";
Logger.log("Drive failed: " + error.toString());
}
var message = "Someone new has filled out the form:\n\nName: " + userName + "\nEmail: " + userEmail + "\n\n--- Automation Status ---\nContacts Saved: " + contactStatus + "\nDrive Access Granted: " + driveStatus;
MailApp.sendEmail(myEmail, subject, message);
}