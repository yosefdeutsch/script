const PROP_PREFIX = 'delmsg_';

function onGmailMessageOpen(e) {
  const messageId = e.gmail.messageId;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  const existing = getScheduledDeletion(messageId);

  const card = CardService.newCardBuilder();
  const section = CardService.newCardSection().setHeader('Self-Destruct Email');

  if (existing) {
    const dueDate = new Date(existing.dueTime);
    section.addWidget(
      CardService.newTextParagraph()
        .setText(`⏰ Scheduled to delete: <b>${formatDate(dueDate)}</b>`)
    );
    section.addWidget(
      CardService.newTextButton()
        .setText('Cancel Deletion')
        .setOnClickAction(CardService.newAction().setFunctionName('cancelDeletion').setParameters({messageId: messageId}))
    );
  } else {
    section.addWidget(CardService.newTextParagraph().setText('Choose when to delete this conversation:'));
    section.addWidget(buildOptionsGrid(messageId));
  }

  card.addSection(section);
  return card.build();
}

function buildOptionsGrid(messageId) {
  const options = [
    {label: 'Now', minutes: 0},
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

function scheduleDeletion(e) {
  const messageId = e.parameters.messageId;
  const minutes = parseInt(e.parameters.minutes, 10);
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  const dueTime = minutes === 0 ? new Date() : new Date(Date.now() + minutes * 60 * 1000);

  PropertiesService.getUserProperties().setProperty(
    PROP_PREFIX + messageId,
    JSON.stringify({messageId: messageId, dueTime: dueTime.getTime()})
  );

  ensureTriggerExists();

  if (minutes === 0) {
    processDeletions();
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Conversation deleted.'))
      .build();
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(`Scheduled for ${formatDate(dueTime)}`))
    .setNavigation(CardService.newNavigation().updateCard(buildConfirmationCard(dueTime, messageId)))
    .build();
}

function buildConfirmationCard(dueTime, messageId) {
  const card = CardService.newCardBuilder();
  const section = CardService.newCardSection();
  section.addWidget(CardService.newTextParagraph().setText(`⏰ Will delete: <b>${formatDate(dueTime)}</b>`));
  section.addWidget(
    CardService.newTextButton()
      .setText('Cancel Deletion')
      .setOnClickAction(CardService.newAction().setFunctionName('cancelDeletion').setParameters({messageId: messageId}))
  );
  card.addSection(section);
  return card.build();
}

function cancelDeletion(e) {
  const messageId = e.parameters.messageId;
  PropertiesService.getUserProperties().deleteProperty(PROP_PREFIX + messageId);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Deletion cancelled.'))
    .setNavigation(CardService.newNavigation().updateCard(onGmailMessageOpen(e)))
    .build();
}

function getScheduledDeletion(messageId) {
  const raw = PropertiesService.getUserProperties().getProperty(PROP_PREFIX + messageId);
  return raw ? JSON.parse(raw) : null;
}

function ensureTriggerExists() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(t => t.getHandlerFunction() === 'processDeletions');
  if (!exists) {
    ScriptApp.newTrigger('processDeletions').timeBased().everyMinutes(5).create();
  }
}

function processDeletions() {
  const props = PropertiesService.getUserProperties().getProperties();
  const now = Date.now();

  Object.keys(props).forEach(key => {
    if (!key.startsWith(PROP_PREFIX)) return;
    const data = JSON.parse(props[key]);
    if (data.dueTime <= now) {
      try {
        const thread = GmailApp.getMessageById(data.messageId).getThread();
        thread.moveToTrash();
      } catch (err) {
        // message already gone, etc.
      }
      PropertiesService.getUserProperties().deleteProperty(key);
    }
  });
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEE, MMM d, h:mm a');
}