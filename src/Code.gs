/**
 * Builds the UI when the user opens the add-on in the Compose window.
 */
function buildComposeUI(e) {
  var card = CardService.newCardBuilder();
  
  var section = CardService.newCardSection()
    .setHeader("My Quick Snippets");

  // --- Snippet 1: Technical Support ---
  section.addWidget(CardService.newTextParagraph().setText("<b>Remote Access Instructions</b>"));
  section.addWidget(CardService.newTextButton()
    .setText("Insert AnyDesk Steps")
    .setOnClickAction(CardService.newAction().setFunctionName("insertAnyDeskSnippet")));

  // --- Snippet 2: File Links ---
  section.addWidget(CardService.newTextParagraph().setText("<b>Course Materials</b>"));
  section.addWidget(CardService.newTextButton()
    .setText("Insert Module 1 Link")
    .setOnClickAction(CardService.newAction().setFunctionName("insertCourseSnippet")));

  card.addSection(section);
  return [card.build()];
}

/**
 * Action function to insert the AnyDesk text.
 */
function insertAnyDeskSnippet(e) {
  var textToInsert = "Please download and run AnyDesk so I can connect to your computer. Once it opens, reply to this email with the 9-digit address displayed on your screen.";
  
  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      .addUpdateContent(textToInsert, CardService.ContentType.TEXT)
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}

/**
 * Action function to insert the Course link text.
 */
function insertCourseSnippet(e) {
  var textToInsert = "Here is the link to access the first PDF module and video for the training: [Insert Link Here]";
  
  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      .addUpdateContent(textToInsert, CardService.ContentType.TEXT)
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}