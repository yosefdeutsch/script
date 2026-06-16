// ============================================================
// Gmail Add-on: Schedule to Trash
// ============================================================

// --- Entry point: called when a Gmail message is opened ---
function buildAddOn(e) {
  var messageId = e.gmail.messageId;
  var message = GmailApp.getMessageById(messageId);
  var thread = message.getThread();
  var threadId = thread.getId();
  var subject = thread.getFirstMessageSubject();

  // Truncate long subjects for display
  var displaySubject = subject.length > 40 ? subject.substring(0, 37) + '...' : subject;

  var now = new Date();

  var card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('🗑️ Schedule to Trash')
        .setSubtitle(displaySubject)
        .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/delete_grey600_24dp.png')
    );

  // ---- Quick Schedule Section ----
  var quickSection = CardService.newCardSection()
    .setHeader('⚡ Quick Schedule');

  var quickOptions = [
    { label: '15 minutes', minutes: 15 },
    { label: '45 minutes', minutes: 45 },
    { label: '1 hour',     minutes: 60 },
    { label: '3 hours',    minutes: 180 },
    { label: '6 hours',    minutes: 360 },
    { label: '12 hours',   minutes: 720 },
  ];

  quickOptions.forEach(function(opt) {
    var targetTime = new Date(now.getTime() + opt.minutes * 60 * 1000);
    var timeStr = formatTime(targetTime);
    quickSection.addWidget(
      CardService.newTextButton()
        .setText('Trash in ' + opt.label + '  (' + timeStr + ')')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('scheduleTrash')
            .setParameters({
              threadId: threadId,
              delayMinutes: String(opt.minutes),
              label: opt.label
            })
        )
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor('#E53935')
    );
  });

  // ---- Day-based Section ----
  var daySection = CardService.newCardSection()
    .setHeader('📅 Day-based');

  // Tomorrow — same time of day
  var tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  var tomorrowStr = formatDateTime(tomorrow);
  daySection.addWidget(
    CardService.newTextButton()
      .setText('Tomorrow  (' + tomorrowStr + ')')
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('scheduleTrash')
          .setParameters({
            threadId: threadId,
            delayMinutes: String(24 * 60),
            label: 'tomorrow'
          })
      )
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor('#F57C00')
  );

  var dayOptions = [
    { label: '3 days',  minutes: 3  * 24 * 60 },
    { label: '1 week',  minutes: 7  * 24 * 60 },
    { label: '2 weeks', minutes: 14 * 24 * 60 },
    { label: '3 weeks', minutes: 21 * 24 * 60 },
    { label: '1 month', minutes: 30 * 24 * 60 },
  ];

  dayOptions.forEach(function(opt) {
    var targetTime = new Date(now.getTime() + opt.minutes * 60 * 1000);
    var dateStr = formatDate(targetTime);
    daySection.addWidget(
      CardService.newTextButton()
        .setText('Trash in ' + opt.label + '  (' + dateStr + ')')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('scheduleTrash')
            .setParameters({
              threadId: threadId,
              delayMinutes: String(opt.minutes),
              label: opt.label
            })
        )
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor('#1565C0')
    );
  });

  // ---- Custom Time Section ----
  var customSection = CardService.newCardSection()
    .setHeader('⏰ Custom Time');

  customSection.addWidget(
    CardService.newTextInput()
      .setFieldName('customMinutes')
      .setTitle('Minutes from now')
      .setHint('e.g. 90')
  );

  customSection.addWidget(
    CardService.newTextButton()
      .setText('Schedule Custom Time')
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('scheduleCustomTrash')
          .setParameters({ threadId: threadId })
      )
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor('#6A1B9A')
  );

  // ---- Scheduled Jobs Section ----
  var scheduledSection = buildScheduledSection(threadId);

  card.addSection(quickSection)
      .addSection(daySection)
      .addSection(customSection)
      .addSection(scheduledSection);

  return card.build();
}


// ============================================================
// Schedule a thread for trash
// ============================================================
function scheduleTrash(e) {
  var threadId   = e.parameters.threadId;
  var delayMin   = parseInt(e.parameters.delayMinutes, 10);
  var label      = e.parameters.label;
  var targetTime = new Date(Date.now() + delayMin * 60 * 1000);

  _createTriggerAndStore(threadId, targetTime, label);

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification()
        .setText('✅ Scheduled to trash in ' + label + ' (' + formatDateTime(targetTime) + ')')
    )
    .setStateChanged(true)
    .build();
}


// Schedule with a custom number of minutes
function scheduleCustomTrash(e) {
  var threadId    = e.parameters.threadId;
  var rawMinutes  = (e.formInput && e.formInput.customMinutes) ? e.formInput.customMinutes : '0';
  var delayMin    = parseInt(rawMinutes, 10);

  if (isNaN(delayMin) || delayMin <= 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('⚠️ Please enter a valid number of minutes.')
      )
      .build();
  }

  var targetTime = new Date(Date.now() + delayMin * 60 * 1000);
  var label      = delayMin < 60
    ? delayMin + ' min'
    : Math.round(delayMin / 60 * 10) / 10 + ' hr';

  _createTriggerAndStore(threadId, targetTime, label);

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification()
        .setText('✅ Scheduled to trash in ' + label + ' (' + formatDateTime(targetTime) + ')')
    )
    .setStateChanged(true)
    .build();
}


// ============================================================
// Cancel a scheduled job
// ============================================================
function cancelScheduledTrash(e) {
  var jobKey    = e.parameters.jobKey;
  var triggerId = e.parameters.triggerId;

  // Delete the Apps Script trigger
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getUniqueId() === triggerId) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Remove from PropertiesService store
  var props = PropertiesService.getUserProperties();
  props.deleteProperty(jobKey);

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText('🚫 Scheduled trash cancelled.')
    )
    .setStateChanged(true)
    .build();
}


// ============================================================
// Trigger callback — actually moves thread to trash
// ============================================================
function executeTrash(e) {
  // The trigger passes the handler name; we stored threadId in properties
  // keyed by trigger unique ID
  var props = PropertiesService.getUserProperties();
  var allProps = props.getProperties();

  Object.keys(allProps).forEach(function(key) {
    if (key.indexOf('job_') !== 0) return;
    try {
      var job = JSON.parse(allProps[key]);
      if (job.triggerId && job.triggerId === _getCurrentTriggerId()) {
        var thread = GmailApp.getThreadById(job.threadId);
        if (thread) {
          thread.moveToTrash();
        }
        props.deleteProperty(key);
      }
    } catch (err) {
      Logger.log('Error processing job ' + key + ': ' + err);
    }
  });
}


// ============================================================
// Internal helpers
// ============================================================

function _createTriggerAndStore(threadId, targetTime, label) {
  // Create a time-based one-off trigger
  var trigger = ScriptApp.newTrigger('executeTrash')
    .timeBased()
    .at(targetTime)
    .create();

  var triggerId = trigger.getUniqueId();
  var jobKey    = 'job_' + triggerId;

  var job = {
    threadId:  threadId,
    triggerId: triggerId,
    targetMs:  targetTime.getTime(),
    label:     label
  };

  PropertiesService.getUserProperties().setProperty(jobKey, JSON.stringify(job));
}


// Scans stored jobs and finds any that match the currently firing trigger.
// Apps Script doesn't pass the trigger ID into the callback directly,
// so we match by finding triggers whose fire time has just passed.
function _getCurrentTriggerId() {
  var now = Date.now();
  var triggers = ScriptApp.getProjectTriggers();
  var props = PropertiesService.getUserProperties();
  var allProps = props.getProperties();

  // Find job keys whose targetMs is within ±2 minutes of now
  var matchId = null;
  Object.keys(allProps).forEach(function(key) {
    if (key.indexOf('job_') !== 0) return;
    try {
      var job = JSON.parse(allProps[key]);
      if (Math.abs(job.targetMs - now) < 2 * 60 * 1000) {
        matchId = job.triggerId;
      }
    } catch (err) {}
  });
  return matchId;
}


function buildScheduledSection(threadId) {
  var section = CardService.newCardSection().setHeader('🕐 Scheduled for this thread');
  var props   = PropertiesService.getUserProperties();
  var allProps = props.getProperties();
  var now     = Date.now();
  var found   = false;

  Object.keys(allProps).forEach(function(key) {
    if (key.indexOf('job_') !== 0) return;
    try {
      var job = JSON.parse(allProps[key]);
      if (job.threadId !== threadId) return;
      if (job.targetMs < now) return; // already fired / past

      found = true;
      var dt = new Date(job.targetMs);
      var row = CardService.newDecoratedText()
        .setTopLabel('Trash scheduled')
        .setText(formatDateTime(dt))
        .setButton(
          CardService.newTextButton()
            .setText('Cancel')
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('cancelScheduledTrash')
                .setParameters({ jobKey: key, triggerId: job.triggerId })
            )
        );
      section.addWidget(row);
    } catch (err) {}
  });

  if (!found) {
    section.addWidget(
      CardService.newTextParagraph().setText('No scheduled trash jobs for this thread.')
    );
  }

  return section;
}


// ============================================================
// Date/time formatting helpers (uses script timezone)
// ============================================================

function formatTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'h:mm a');
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM d');
}

function formatDateTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM d, h:mm a');
}