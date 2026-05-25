// --- PASTE YOUR SPREADSHEET ID HERE ---
var SHEET_ID = '1JXRpPablVJQll5_RvLXBhk_HKUej6aGy1kfBtYxZluc'; 

/**
 * Builds the UI by reading the Google Sheet
 */
function buildComposeUI(e) {
  var card = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("My Dynamic Snippets");

  // Open the sheet and get all the data
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  var data = sheet.getDataRange().getValues();

  // Loop through the rows (starting at index 1 to skip the header row)
  for (var i = 1; i < data.length; i++) {
    var buttonName = data[i][0]; // Column A
    var snippetText = data[i][1]; // Column B

    // If the row has data, create a button for it
    if (buttonName && snippetText) {
      var action = CardService.newAction()
        .setFunctionName("insertDynamicSnippet")
        .setParameters({ "textToInject": snippetText });

      section.addWidget(CardService.newTextButton()
        .setText(buttonName)
        .setOnClickAction(action));
    }
  }

  card.addSection(section);
  return [card.build()];
}

/**
 * Action function that inserts whatever text was passed from the button.
 */
function insertDynamicSnippet(e) {
  // Grab the text associated with the button that was clicked
  var textToInsert = e.parameters.textToInject;
  
  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      // Notice we changed this to HTML so you can use bolding/links!
      .addUpdateContent(textToInsert, CardService.ContentType.MUTABLE_HTML) 
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}