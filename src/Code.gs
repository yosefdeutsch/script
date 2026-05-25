/**
 * Builds the UI when the user opens the add-on in the Compose window.
 */
function buildComposeUI(e) {
  var card = CardService.newCardBuilder();
  
  var section = CardService.newCardSection()
    .setHeader("My Quick Snippets");

  // --- Your New Custom Button ---
  section.addWidget(CardService.newTextParagraph().setText("<b>Meetings</b>"));
  section.addWidget(CardService.newTextButton()
    .setText("Insert Calendly Link") // What the button says
    .setOnClickAction(CardService.newAction().setFunctionName("insertMeetingLink"))); // The function it runs

  card.addSection(section);
  return [card.build()];
}

/**
 * Action function to insert your meeting link.
 */
function insertMeetingLink(e) {
  // Put whatever text you want inside the quotes below!
  var textToInsert = "I'd love to discuss this further. You can pick a time on my calendar here: https://calendly.com/your-link";
  
  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      .addUpdateContent(textToInsert, CardService.ContentType.TEXT)
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}