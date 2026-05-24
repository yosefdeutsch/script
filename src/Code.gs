/**
 * --- CONFIGURATION & TRANSLATIONS ---
 */
const THEME = {
  color: "#009688", // Greenish-Bluish Teal
  icon: "https://cdn-icons-png.flaticon.com/512/3342/3342137.png"
};

// Using Unicode formatting characters to strongly suggest RTL rendering for the text itself
const RTL = '\u202B'; 
const POP = '\u202C';

const TEXT = {
  en: {
    title: "Image Sender",
    subtitle: "Share images instantly",
    urlLabel: "Image Link",
    urlHint: "Paste URL or Base64 here...",
    btnInbox: "Send to My Inbox",
    btnOther: "Send to Someone Else",
    btnLang: "🌐 Switch to עברית",
    otherTitle: "Recipient Details",
    emailLabel: "Recipient Email",
    btnSend: "Send Now",
    btnBack: "Go Back",
    success: "Success! Image sent.",
    error: "Error: ",
    invalidUrl: "Please provide a valid link.",
    invalidEmail: "Invalid email address.",
    subject: "Shared Image",
    body: "Attached is the image you shared via the Image Sender add-on."
  },
  he: {
    title: RTL + "שולח התמונות" + POP,
    subtitle: RTL + "שתף תמונות ברגע" + POP,
    urlLabel: RTL + "קישור לתמונה" + POP,
    urlHint: RTL + "הדבק קישור או Base64 כאן..." + POP,
    btnInbox: RTL + "שלח לתיבה שלי" + POP,
    btnOther: RTL + "שלח לאדם אחר" + POP,
    btnLang: "🌐 Switch to English",
    otherTitle: RTL + "פרטי הנמען" + POP,
    emailLabel: RTL + "אימייל הנמען" + POP,
    btnSend: RTL + "שלח עכשיו" + POP,
    btnBack: RTL + "חזור" + POP,
    success: RTL + "הצליח! התמונה נשלחה." + POP,
    error: RTL + "שגיאה: " + POP,
    invalidUrl: RTL + "אנא ספק קישור תקין." + POP,
    invalidEmail: RTL + "כתובת אימייל לא תקינה." + POP,
    subject: RTL + "תמונה ששותפה איתך" + POP,
    body: RTL + "מצורפת התמונה ששותפה דרך תוסף שולח התמונות." + POP
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

  // 1. Visual Header
  var header = CardService.newCardHeader()
    .setTitle(t.title)
    .setSubtitle(t.subtitle)
    .setImageStyle(CardService.ImageStyle.CIRCLE)
    .setImageUrl(THEME.icon);
  card.setHeader(header);

  // 2. Input Section
  var inputSection = CardService.newCardSection();
  var urlInput = CardService.newTextInput()
    .setFieldName("imageUrl")
    .setTitle(t.urlLabel)
    .setHint(t.urlHint);
  inputSection.addWidget(urlInput);
  card.addSection(inputSection);

  // 3. Actions Section (Stacked Vertically for cleaner UI)
  var actionSection = CardService.newCardSection();

  var selfAction = CardService.newAction().setFunctionName("processImage").setParameters({target: "self"});
  var selfBtn = CardService.newTextButton()
    .setText(t.btnInbox)
    .setOnClickAction(selfAction)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED); // Primary colored button
  
  var otherAction = CardService.newAction().setFunctionName("buildOtherCard");
  var otherBtn = CardService.newTextButton()
    .setText(t.btnOther)
    .setOnClickAction(otherAction)
    .setTextButtonStyle(CardService.TextButtonStyle.TEXT); // Secondary clean text button

  // Adding them sequentially creates a clean vertical stack
  actionSection.addWidget(selfBtn);
  actionSection.addWidget(otherBtn);
  card.addSection(actionSection);

  // 4. Fixed Footer (Pinned to the absolute bottom)
  var langAction = CardService.newAction().setFunctionName("toggleLanguage");
  var footer = CardService.newFixedFooter()
    .setPrimaryButton(CardService.newTextButton()
      .setText(t.btnLang)
      .setOnClickAction(langAction));
  card.setFixedFooter(footer);

  return card.build();
}

function buildOtherCard(e) {
  var lang = getLang();
  var t = TEXT[lang];
  var currentUrl = e.formInput.imageUrl || "";

  var card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle(t.otherTitle));

  var mainSection = CardService.newCardSection();

  // Retain the URL
  mainSection.addWidget(CardService.newTextInput().setFieldName("imageUrl").setTitle(t.urlLabel).setValue(currentUrl));

  // Recipient Input
  mainSection.addWidget(CardService.newTextInput()
    .setFieldName("recipientEmail")
    .setTitle(t.emailLabel)
    .setHint("example@mail.com"));
  
  card.addSection(mainSection);

  // Actions Section (Stacked Vertically)
  var actionSection = CardService.newCardSection();

  var sendAction = CardService.newAction().setFunctionName("processImage").setParameters({target: "other"});
  var sendBtn = CardService.newTextButton()
    .setText(t.btnSend)
    .setOnClickAction(sendAction)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED);

  var backAction = CardService.newAction().setFunctionName("goBack");
  var backBtn = CardService.newTextButton()
    .setText(t.btnBack)
    .setOnClickAction(backAction)
    .setTextButtonStyle(CardService.TextButtonStyle.TEXT);

  actionSection.addWidget(sendBtn);
  actionSection.addWidget(backBtn);
  card.addSection(actionSection);

  // Fixed Footer
  var langAction = CardService.newAction().setFunctionName("toggleLanguage");
  var footer = CardService.newFixedFooter()
    .setPrimaryButton(CardService.newTextButton()
      .setText(t.btnLang)
      .setOnClickAction(langAction));
  card.setFixedFooter(footer);

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