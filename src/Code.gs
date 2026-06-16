const PROP_PREFIX = 'delmsg_';
const REMINDER_PREFIX = 'reminder_';
const LOG_SHEET_PROP = 'logSheetId';

// ===== CONTEXTUAL CARD (opens when reading an email) =====

function onGmailMessageOpen(e) {
  const messageId = e.gmail.messageId;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  return buildMessageCard(messageId, e);
}

function buildMessageCard(messageId, e) {
  const existing = getScheduledDeletion(messageId);
  const card = CardService.newCardBuilder();
  const section = CardService.newCardSection().setHeader('Self-Destruct Email');

  if (existing) {
    const dueDate = new Date(existing.dueTime);
    section.addWidget(
      CardService.newDecoratedText()
        .setText(`Deletes: <b>${formatDate(dueDate)}</b>`)
        .setIcon(CardService.Icon.CLOCK)
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.CLOCK).setIconColor(urgencyColor(dueDate)))
    );
    section.addWidget(
      CardService.newTextButton()
        .setText('Cancel Deletion')
        .setOnClickAction(CardService.newAction().setFunctionName('cancelDeletion').setParameters({messageId: messageId}))
    );
  } else {
    section.addWidget(CardService.newTextParagraph().setText('Choose when to delete this conversation:'));
    section.addWidget(buildOptionsGrid(messageId));
    section.addWidget(
      CardService.newTextButton()
        .setText('Custom date & time…')
        .setOnClickAction(CardService.newAction().setFunctionName('showCustomPicker').setParameters({messageId: messageId}))
    );
  }

  card.addSection(section);
  return card.build();
}

function buildOptionsGrid(messageId) {
  const options = [
    {label: 'Delete Now', minutes: 0},
    {label: '15 min', minutes: 15},
    {label: '45 min', minutes: 45},
    {label: '1 hour', minutes: 60},
    {label: '3 hours', minutes: 180},
    {label: '12 hours', minutes: 720},
    {label: 'Tomorrow', minutes: 1440},
    {label: '3 days', minutes: 4320},
    {label: '1 week', minutes: 10080},
    {label: '3 weeks', minutes: 30240}
  ];

  const buttonSet = CardService.newButtonSet();
  options.forEach(opt => {
    buttonSet.addButton(
      CardService.newTextButton()
        .setText(opt.label)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('scheduleDeletion')
            .setParameters({messageId: messageId, minutes: String(opt.minutes)})
        )
    );
  });
  return buttonSet;
}

// ===== CUSTOM DATE/TIME PICKER =====

function showCustomPicker(e) {
  const messageId = e.parameters.messageId;
  const card = CardService.newCardBuilder();
  const section = CardService.newCardSection().setHeader('Custom Delete Time');

  section.addWidget(
    CardService.newTextInput()
      .setFieldName('customMinutes')
      .setTitle('Minutes from now')
      .setHint('e.g. 90 for 1.5 hours')
  );
  section.addWidget(
    CardService.newTextButton()
      .setText('Schedule')
      .setOnClickAction(
        CardService.newAction().setFunctionName('scheduleCustomDeletion').setParameters({messageId: messageId})
      )
  );

  card.addSection(section);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}

function scheduleCustomDeletion(e) {
  const minutes = parseInt(e.formInput.customMinutes, 10);
  if (isNaN(minutes) || minutes < 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Enter a valid number of minutes.'))
      .build();
  }
  e.parameters.minutes = String(minutes);
  return scheduleDeletion(e);
}

// ===== SCHEDULING LOGIC =====

function scheduleDeletion(e) {
  const messageId = e.parameters.messageId;
  const minutes = parseInt(e.parameters.minutes, 10);
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  const dueTime = minutes === 0 ? new Date() : new Date(Date.now() + minutes * 60 * 1000);
  const message = GmailApp.getMessageById(messageId);

  PropertiesService.getUserProperties().setProperty(
    PROP_PREFIX + messageId,
    JSON.stringify({
      messageId: messageId,
      dueTime: dueTime.getTime(),
      subject: message.getSubject(),
      sender: message.getFrom()
    })
  );

  ensureTriggerExists();

  if (minutes === 0) {
    processDeletions();
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Conversation deleted.'))
      .build();
  }

  // Schedule a pre-deletion reminder, 5 minutes before, if there's enough lead time
  if (minutes > 10) {
    const reminderTime = new Date(dueTime.getTime() - 5 * 60 * 1000);
    PropertiesService.getUserProperties().setProperty(
      REMINDER_PREFIX + messageId,
      JSON.stringify({messageId: messageId, reminderTime: reminderTime.getTime(), fired: false})
    );
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(`Scheduled for ${formatDate(dueTime)}`))
    .setNavigation(CardService.newNavigation().updateCard(buildMessageCard(messageId, e)))
    .build();
}

function cancelDeletion(e) {
  const messageId = e.parameters.messageId;
  PropertiesService.getUserProperties().deleteProperty(PROP_PREFIX + messageId);
  PropertiesService.getUserProperties().deleteProperty(REMINDER_PREFIX + messageId);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Deletion cancelled.'))
    .setNavigation(CardService.newNavigation().updateCard(buildMessageCard(messageId, e)))
    .build();
}

function getScheduledDeletion(messageId) {
  const raw = PropertiesService.getUserProperties().getProperty(PROP_PREFIX + messageId);
  return raw ? JSON.parse(raw) : null;
}

// ===== TRIGGER MANAGEMENT =====

function ensureTriggerExists() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(t => t.getHandlerFunction() === 'processDeletions');
  if (!exists) {
    ScriptApp.newTrigger('processDeletions').timeBased().everyMinutes(5).create();
  }
}

// ===== BACKGROUND PROCESSING (runs every 5 min) =====

function processDeletions() {
  const userProps = PropertiesService.getUserProperties();
  const props = userProps.getProperties();
  const now = Date.now();

  Object.keys(props).forEach(key => {
    if (key.startsWith(REMINDER_PREFIX)) {
      const reminder = JSON.parse(props[key]);
      if (!reminder.fired && reminder.reminderTime <= now) {
        sendReminderEmail(reminder.messageId);
        reminder.fired = true;
        userProps.setProperty(key, JSON.stringify(reminder));
      }
      return;
    }

    if (!key.startsWith(PROP_PREFIX)) return;
    const data = JSON.parse(props[key]);
    if (data.dueTime <= now) {
      try {
        const thread = GmailApp.getMessageById(data.messageId).getThread();
        logDeletion(data);
        thread.moveToTrash();
      } catch (err) {
        // message already gone
      }
      userProps.deleteProperty(key);
      userProps.deleteProperty(REMINDER_PREFIX + data.messageId);
    }
  });
}

function sendReminderEmail(messageId) {
  try {
    const data = getScheduledDeletion(messageId);
    if (!data) return;
    GmailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'Self-Destruct Reminder: Email deletes in 5 minutes',
      `The email "${data.subject}" from ${data.sender} will be deleted in 5 minutes. Open Gmail and cancel from the add-on if you want to keep it.`
    );
  } catch (err) {
    // ignore
  }
}

// ===== AUDIT LOG =====

function logDeletion(data) {
  try {
    const sheet = getOrCreateLogSheet();
    sheet.appendRow([new Date(), data.subject, data.sender, data.messageId]);
  } catch (err) {
    // logging failure shouldn't block deletion
  }
}

function getOrCreateLogSheet() {
  const props = PropertiesService.getUserProperties();
  let sheetId = props.getProperty(LOG_SHEET_PROP);
  let ss;

  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
      return ss.getSheetByName('Log');
    } catch (err) {
      // sheet was deleted, recreate
    }
  }

  ss = SpreadsheetApp.create('Self-Destruct Email Log');
  props.setProperty(LOG_SHEET_PROP, ss.getId());
  const sheet = ss.getActiveSheet().setName('Log');
  sheet.appendRow(['Deleted At', 'Subject', 'Sender', 'Message ID']);
  return sheet;
}

// ===== DASHBOARD HOMEPAGE =====

function onHomepageOpen(e) {
  const userProps = PropertiesService.getUserProperties();
  const props = userProps.getProperties();
  const scheduled = [];

  Object.keys(props).forEach(key => {
    if (key.startsWith(PROP_PREFIX)) {
      scheduled.push(JSON.parse(props[key]));
    }
  });

  scheduled.sort((a, b) => a.dueTime - b.dueTime);

  const card = CardService.newCardBuilder();
  const section = CardService.newCardSection().setHeader(`Scheduled Deletions (${scheduled.length})`);

  if (scheduled.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText('Nothing scheduled right now.'));
  } else {
    scheduled.forEach(item => {
      const dueDate = new Date(item.dueTime);
      section.addWidget(
        CardService.newDecoratedText()
          .setText(item.subject || '(no subject)')
          .setBottomLabel(`${item.sender} • ${formatDate(dueDate)}`)
          .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.CLOCK).setIconColor(urgencyColor(dueDate)))
          .setButton(
            CardService.newTextButton()
              .setText('Cancel')
              .setOnClickAction(CardService.newAction().setFunctionName('cancelFromDashboard').setParameters({messageId: item.messageId}))
          )
      );
    });
  }

  card.addSection(section);
  return card.build();
}

function cancelFromDashboard(e) {
  const messageId = e.parameters.messageId;
  PropertiesService.getUserProperties().deleteProperty(PROP_PREFIX + messageId);
  PropertiesService.getUserProperties().deleteProperty(REMINDER_PREFIX + messageId);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Cancelled.'))
    .setNavigation(CardService.newNavigation().updateCard(onHomepageOpen(e)))
    .build();
}

// ===== UTILITIES =====

function urgencyColor(dueDate) {
  const minsLeft = (dueDate.getTime() - Date.now()) / 60000;
  if (minsLeft <= 60) return '#EA4335';      // red — urgent
  if (minsLeft <= 1440) return '#FBBC04';    // yellow — soon
  return '#34A853';                          // green — far out
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEE, MMM d, h:mm a');
}
