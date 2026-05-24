/**
 * --- CONFIGURATION & TRANSLATIONS ---
 */
const THEME = {
  color: "#009688", // Greenish-Bluish Teal
  icon: "https://cdn-icons-png.flaticon.com/512/3342/3342137.png"
};

const TEXT = {
  en: {
    title: "Image Sender",
    subtitle: "Share images instantly",
    urlLabel: "Image Link",
    urlHint: "Paste URL or Base64 here...",
    btnInbox: "Send to My Inbox",
    btnOther: "Send to Someone Else",
    btnLang: "🌐 עברית",
    otherTitle: "Recipient Details",
    emailLabel: "Recipient Email",
    btnSend: "Send Now",
    btnBack: "Go Back",
    processing: "Processing image...",
    success: "Success! Image sent.",
    error: "Error: ",
    invalidUrl: "Please provide a valid link.",
    invalidEmail: "Invalid email address.",
    subject: "Shared Image",
    body: "Attached is the image you shared via the Image Sender add-on."
  },
  he: {
    title: "שולח התמונות",
    subtitle: "שתף תמונות ברגע",
    urlLabel: "קישור לתמונה",
    urlHint: "הדבק קישור או Base64 כאן...",
    btnInbox: "שלח לתיבת הדואר שלי",
    btnOther: "שלח לאדם אחר",
    btnLang: "🌐 English",
    otherTitle: "פרטי הנמען",
    emailLabel: "אימייל הנמען",
    btnSend: "שלח עכשיו",
    btnBack: "חזור",
    processing: "מעבד תמונה...",
    success: "הצליח! התמונה נשלחה.",
    error: "שגיאה: ",
    invalidUrl: "אנא ספק קישור תקין.",
    invalidEmail: "כתובת אימייל לא תקינה.",
    subject: "תמונה ששותפה איתך",
    body: "מצורפת התמונה ששותפה דרך תוסף שולח התמונות."
  }
};

/**
 * --- UI BUILDERS ---
 */

function getLang() {
  return PropertiesService.getUserProperties().getProperty('LANG') || 'en';
}

function buildHomepage(e) {
  return createMainCard(e);
}

function createMainCard(e) {
  var lang = getLang();
  var t = TEXT[lang];
  var card = CardService.newCardBuilder();

  // Visual Header
  var header = CardService.newCardHeader()
    .setTitle(t.title)
    .setSubtitle(t.subtitle)
    .setImageStyle(CardService.ImageStyle.CIRCLE)
    .setImageUrl(THEME.icon);
  card.setHeader(header);

  var section = CardService.newCardSection();

  // URL Input
  var urlInput = CardService.newTextInput()
    .setFieldName("imageUrl")
    .setTitle(t.urlLabel)
    .setHint(t.urlHint);
  section.addWidget(urlInput);

  // Send to Self (Primary Action)
  var selfAction = CardService.newAction().setFunctionName("processImage").setParameters({target: "self"});
  var selfBtn = CardService.newTextButton()
    .setText(t.btnInbox)
    .setOnClickAction(selfAction)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED);
  section.addWidget(selfBtn);

  // Send to Other (Secondary Action)
  var otherAction = CardService.newAction().setFunctionName("buildOtherCard");
  var otherBtn = CardService.newTextButton()
    .setText(t.btnOther)
    .setOnClickAction(otherAction);
  section.addWidget(otherBtn);

  // Language Toggle at bottom
  var langAction = CardService.newAction().setFunctionName("toggleLanguage");
  var langBtn = CardService.newDecoratedText()
    .setText(t.btnLang)
    .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
    .setOnClickAction(langAction);
  section.addWidget(langBtn);

  card.addSection(section);
  return card.build();
}

function buildOtherCard(e) {
  var lang = getLang();
  var t = TEXT[lang];
  var currentUrl = e.formInput.imageUrl || "";

  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle(t.otherTitle));

  var section = CardService.newCardSection();

  // Retain the URL
  section.addWidget(CardService.newTextInput().setFieldName("imageUrl").setTitle(t.urlLabel).setValue(currentUrl));

  // Recipient Input
  var emailInput = CardService.newTextInput()
    .setFieldName("recipientEmail")
    .setTitle(t.emailLabel)
    .setHint("example@mail.com");
  section.addWidget(emailInput);

  // Send Button
  var sendAction = CardService.newAction().setFunctionName("processImage").setParameters({target: "other"});
  section.addWidget(CardService.newTextButton()
    .setText(t.btnSend)
    .setOnClickAction(sendAction)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED));

  // Back Button
  section.addWidget(CardService.newTextButton()
    .setText(t.btnBack)
    .setOnClickAction(CardService.newAction().setFunctionName("goBack")));

  card.addSection(section);
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card.build())).build();
}

/**
 * --- LOGIC & ENGINE ---
 */

function toggleLanguage() {
  var props = PropertiesService.getUserProperties();
  props.setProperty('LANG', getLang() === 'en' ? 'he' : 'en');
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(createMainCard()))
    .build();
}

function goBack() {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().popCard()).build();
}

function processImage(e) {
  var lang = getLang();
  var t = TEXT[lang];
  var imageUrl = e.formInput.imageUrl;
  var target = e.parameters.target;
  var recipient = Session.getActiveUser().getEmail();

  if (!imageUrl) return createNotification(t.invalidUrl);

  if (target === "other") {
    recipient = e.formInput.recipientEmail;
    if (!recipient || recipient.indexOf("@") === -1) return createNotification(t.invalidEmail);
  }

  try {
    var blob;
    // Check for Base64 Data
    if (imageUrl.indexOf("base64,") > -1) {
      var parts = imageUrl.split("base64,");
      var mimeType = parts[0].split(":")[1].split(";")[0];
      var decoded = Utilities.base64Decode(parts[1]);
      blob = Utilities.newBlob(decoded, mimeType, "attachment." + mimeType.split("/")[1]);
    } else {
      // Standard URL
      blob = UrlFetchApp.fetch(imageUrl).getBlob();
    }

    MailApp.sendEmail({
      to: recipient,
      subject: t.subject,
      body: t.body,
      attachments: [blob]
    });

    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(t.success))
      .setNavigation(CardService.newNavigation().popToRoot())
      .build();

  } catch (err) {
    return createNotification(t.error + err.message);
  }
}

function createNotification(msg) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(msg))
    .build();
}