// ============================================================
// Gmail Add-on: Schedule to Trash  —  Full Featured v2
// ============================================================
//
// FEATURES:
//  - Quick schedule (15m, 45m, 1h, 3h, 6h, 12h)
//  - Day-based (tomorrow same time, 3d, 1w, 2w, 3w, 1 month)
//  - Custom minutes input
//  - Confirmation step before scheduling (no accidental clicks)
//  - Postpone existing job (+1h / +1 day) without cancel/recreate
//  - Archive instead of Trash option (per-job choice)
//  - Mark as Unread when actioned (snooze feel)
//  - Label thread as "scheduled-trash" so it's visible in sidebar
//  - Daily digest email of what was trashed automatically
//  - Homepage card: view ALL pending jobs across all threads
//  - Reliable trigger matching via trigger handler name embedding
//  - Detects if thread is already in trash
//  - Timezone auto-follows Google Calendar (works while travelling)
//  - Settings card: toggle snooze, digest, action type
// ============================================================


// ============================================================
// SETTINGS DEFAULTS
// ============================================================
var SETTINGS_DEFAULTS = {
  actionType:      'trash',   // 'trash' | 'archive'
  markUnread:      'true',    // mark as unread when actioned
  weeklyDigest:    'true',    // weekly summary of auto-trashed threads
  labelThreads:    'true',    // apply "scheduled-trash" label
};

function getSettings() {
  var props = PropertiesService.getUserProperties();
  var s = {};
  Object.keys(SETTINGS_DEFAULTS).forEach(function(k) {
    var val = props.getProperty('setting_' + k);
    s[k] = val !== null ? val : SETTINGS_DEFAULTS[k];
  });
  return s;
}

function saveSetting(key, value) {
  PropertiesService.getUserProperties().setProperty('setting_' + key, value);
}


// ============================================================
// HOMEPAGE CARD — shows all pending jobs across all threads
// ============================================================
function buildHomePage(e) {
  var card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('🗑️ Schedule to Trash')
        .setSubtitle('All pending jobs')
    );

  var props    = PropertiesService.getUserProperties();
  var allProps = props.getProperties();
  var now      = Date.now();
  var jobs     = [];

  Object.keys(allProps).forEach(function(key) {
    if (key.indexOf('job_') !== 0) return;
    try {
      var job = JSON.parse(allProps[key]);
      if (job.targetMs > now) jobs.push({ key: key, job: job });
    } catch (err) {}
  });

  jobs.sort(function(a, b) { return a.job.targetMs - b.job.targetMs; });

  var jobSection = CardService.newCardSection().setHeader('⏳ Pending Jobs (' + jobs.length + ')');

  if (jobs.length === 0) {
    jobSection.addWidget(
      CardService.newTextParagraph().setText('No jobs scheduled. Open an email to schedule one.')
    );
  } else {
    jobs.forEach(function(item) {
      var job = item.job;
      var dt  = new Date(job.targetMs);
      var action = job.action === 'archive' ? '📦 Archive' : '🗑️ Trash';
      var subject = job.subject || '(no subject)';
      var row = CardService.newDecoratedText()
        .setTopLabel(action + ' — ' + formatDateTime(dt))
        .setText(subject)
        .setWrapText(true)
        .setButton(
          CardService.newTextButton()
            .setText('Cancel')
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('cancelScheduledTrash')
                .setParameters({ jobKey: item.key })
            )
        );
      jobSection.addWidget(row);
    });
  }

  // Settings shortcut
  var settingsSection = CardService.newCardSection();
  settingsSection.addWidget(
    CardService.newTextButton()
      .setText('⚙️ Settings')
      .setOnClickAction(CardService.newAction().setFunctionName('buildSettingsCard'))
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor('#455A64')
  );

  card.addSection(jobSection).addSection(settingsSection);
  return card.build();
}


// ============================================================
// MAIN CARD — opened when viewing a Gmail thread
// ============================================================
function buildAddOn(e) {
  var messageId = e.gmail.messageId;
  var message   = GmailApp.getMessageById(messageId);
  var thread    = message.getThread();
  var threadId  = thread.getId();
  var subject   = thread.getFirstMessageSubject();
  var settings  = getSettings();

  var displaySubject = subject.length > 45 ? subject.substring(0, 42) + '...' : subject;
  var now = new Date();

  // --- Check if already in trash ---
  if (thread.isInTrash()) {
    var trashCard = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle('🗑️ Already in Trash').setSubtitle(displaySubject));
    trashCard.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText('This conversation is already in the Trash.')
      )
    );
    return trashCard.build();
  }

  // --- Count active jobs for this thread (for header badge) ---
  var props    = PropertiesService.getUserProperties();
  var allProps = props.getProperties();
  var activeCount = 0;
  Object.keys(allProps).forEach(function(key) {
    if (key.indexOf('job_') !== 0) return;
    try {
      var job = JSON.parse(allProps[key]);
      if (job.threadId === threadId && job.targetMs > Date.now()) activeCount++;
    } catch (err) {}
  });

  var subtitle = displaySubject + (activeCount > 0 ? '  •  ' + activeCount + ' job(s) pending' : '');

  var card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('🗑️ Schedule to Trash')
        .setSubtitle(subtitle)
        .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/delete_grey600_24dp.png')
    );

  var actionLabel = settings.actionType === 'archive' ? 'Archive' : 'Trash';
  var quickColor  = settings.actionType === 'archive' ? '#2E7D32' : '#E53935';

  // ---- Quick Schedule ----
  var quickSection = CardService.newCardSection().setHeader('⚡ Quick Schedule');

  var quickOptions = [
    { label: '1 hour',     minutes: 60 },
    { label: '3 hours',    minutes: 180 },
    { label: '6 hours',    minutes: 360 },
    { label: '12 hours',   minutes: 720 },
  ];

  quickOptions.forEach(function(opt) {
    var targetTime = new Date(now.getTime() + opt.minutes * 60 * 1000);
    var timeStr    = formatTime(targetTime);
    quickSection.addWidget(
      CardService.newTextButton()
        .setText(actionLabel + ' in ' + opt.label + '  (' + timeStr + ')')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('confirmSchedule')
            .setParameters({
              threadId:     threadId,
              subject:      subject,
              delayMinutes: String(opt.minutes),
              label:        opt.label,
              targetMs:     String(targetTime.getTime())
            })
        )
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(quickColor)
    );
  });

  // ---- Day-based ----
  var daySection = CardService.newCardSection().setHeader('📅 Day-based');

  var tomorrow    = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  var tomorrowStr = formatDateTime(tomorrow);
  daySection.addWidget(
    CardService.newTextButton()
      .setText('Tomorrow  (' + tomorrowStr + ')')
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('confirmSchedule')
          .setParameters({
            threadId:     threadId,
            subject:      subject,
            delayMinutes: String(24 * 60),
            label:        'tomorrow',
            targetMs:     String(tomorrow.getTime())
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
    var dateStr    = formatDate(targetTime);
    daySection.addWidget(
      CardService.newTextButton()
        .setText(actionLabel + ' in ' + opt.label + '  (' + dateStr + ')')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('confirmSchedule')
            .setParameters({
              threadId:     threadId,
              subject:      subject,
              delayMinutes: String(opt.minutes),
              label:        opt.label,
              targetMs:     String(targetTime.getTime())
            })
        )
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor('#1565C0')
    );
  });

  // ---- Custom Time ----
  var customSection = CardService.newCardSection().setHeader('⏰ Custom Time');
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
          .setParameters({ threadId: threadId, subject: subject })
      )
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor('#6A1B9A')
  );

  // ---- Scheduled Jobs for this thread ----
  var scheduledSection = buildScheduledSection(threadId);

  // ---- Settings shortcut ----
  var bottomSection = CardService.newCardSection();
  bottomSection.addWidget(
    CardService.newTextButton()
      .setText('⚙️ Settings')
      .setOnClickAction(CardService.newAction().setFunctionName('buildSettingsCard'))
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor('#455A64')
  );

  card.addSection(quickSection)
      .addSection(daySection)
      .addSection(customSection)
      .addSection(scheduledSection)
      .addSection(bottomSection);

  return card.build();
}


// ============================================================
// CONFIRMATION CARD — shown before actually scheduling
// ============================================================
function confirmSchedule(e) {
  var p          = e.parameters;
  var targetTime = new Date(parseInt(p.targetMs, 10));
  var settings   = getSettings();
  var actionWord = settings.actionType === 'archive' ? 'archive' : 'move to trash';

  var card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Confirm Schedule')
        .setSubtitle('Are you sure?')
    );

  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph()
      .setText('This will ' + actionWord + ' the conversation:\n\n"' +
        (p.subject.length > 60 ? p.subject.substring(0, 57) + '...' : p.subject) +
        '"\n\nat ' + formatDateTime(targetTime) + '.')
  );

  section.addWidget(
    CardService.newTextButton()
      .setText('✅ Yes, Schedule It')
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('scheduleTrash')
          .setParameters({
            threadId:     p.threadId,
            subject:      p.subject,
            delayMinutes: p.delayMinutes,
            label:        p.label,
            targetMs:     p.targetMs
          })
      )
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor('#E53935')
  );

  section.addWidget(
    CardService.newTextButton()
      .setText('✖ Cancel')
      .setOnClickAction(CardService.newAction().setFunctionName('goBack'))
      .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
  );

  card.addSection(section);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}

function goBack(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}


// ============================================================
// SCHEDULE — confirmed, create the job
// ============================================================
function scheduleTrash(e) {
  var p          = e.parameters;
  var threadId   = p.threadId;
  var delayMin   = parseInt(p.delayMinutes, 10);
  var label      = p.label;
  var subject    = p.subject || '';
  var targetTime = new Date(Date.now() + delayMin * 60 * 1000);
  var settings   = getSettings();

  _createTriggerAndStore(threadId, subject, targetTime, label, settings.actionType);

  // Apply "scheduled-trash" label if enabled
  if (settings.labelThreads === 'true') {
    _applyScheduledLabel(threadId);
  }

  var actionWord = settings.actionType === 'archive' ? 'archived' : 'trashed';

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification()
        .setText('✅ Will be ' + actionWord + ' at ' + formatDateTime(targetTime))
    )
    .setNavigation(CardService.newNavigation().popCard())
    .setStateChanged(true)
    .build();
}


// Custom minutes input handler
function scheduleCustomTrash(e) {
  var threadId   = e.parameters.threadId;
  var subject    = e.parameters.subject || '';
  var rawMinutes = (e.formInput && e.formInput.customMinutes) ? e.formInput.customMinutes : '0';
  var delayMin   = parseInt(rawMinutes, 10);

  if (isNaN(delayMin) || delayMin <= 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('⚠️ Enter a valid number of minutes.'))
      .build();
  }

  var label      = delayMin < 60 ? delayMin + ' min' : Math.round(delayMin / 60 * 10) / 10 + ' hr';
  var targetTime = new Date(Date.now() + delayMin * 60 * 1000);

  return confirmSchedule({
    parameters: {
      threadId:     threadId,
      subject:      subject,
      delayMinutes: String(delayMin),
      label:        label,
      targetMs:     String(targetTime.getTime())
    }
  });
}


// ============================================================
// POSTPONE — shift an existing job forward (just updates stored targetMs, no trigger changes)
// ============================================================
function postponeJob(e) {
  var jobKey       = e.parameters.jobKey;
  var extraMinutes = parseInt(e.parameters.extraMinutes, 10);
  var props        = PropertiesService.getUserProperties();

  try {
    var job       = JSON.parse(props.getProperty(jobKey));
    var newTarget = new Date(job.targetMs + extraMinutes * 60 * 1000);

    job.targetMs = newTarget.getTime();
    props.setProperty(jobKey, JSON.stringify(job));

    var extraLabel = extraMinutes >= 60 ? (extraMinutes / 60) + 'h' : extraMinutes + 'm';
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText('⏩ Postponed by ' + extraLabel + ' → now at ' + formatDateTime(newTarget)))
      .setStateChanged(true)
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('⚠️ Could not postpone: ' + err))
      .build();
  }
}


// ============================================================
// CANCEL a scheduled job
// ============================================================
function cancelScheduledTrash(e) {
  var jobKey = e.parameters.jobKey;
  var props  = PropertiesService.getUserProperties();

  // Read job to remove label before deleting
  try {
    var job = JSON.parse(props.getProperty(jobKey));
    if (job && job.threadId) _removeScheduledLabel(job.threadId);
  } catch (err) {}

  props.deleteProperty(jobKey);

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('🚫 Scheduled job cancelled.'))
    .setStateChanged(true)
    .build();
}


// ============================================================
// ONE-TIME SETUP — run this ONCE manually from the Apps Script editor:
//   1. Open script.google.com → your project
//   2. Select "setupTrigger" from the function dropdown
//   3. Click Run ▶
// This creates a single hourly trigger that runs forever.
// It will never hit Google's limit because it's just 1 trigger total.
// ============================================================
function setupTrigger() {
  // Remove any existing pollJobs triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });

  // Create the single hourly trigger
  ScriptApp.newTrigger('pollJobs')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('✅ Hourly trigger created. Jobs will fire within 1 hour of their scheduled time.');
}


// ============================================================
// POLLER — runs every hour, handles all jobs
// This is the ONLY time-based trigger needed.
// No per-job triggers are ever created, so we never hit Google's 20-trigger limit.
// ============================================================
function pollJobs() {
  var props     = PropertiesService.getUserProperties();
  var allProps  = props.getProperties();
  var settings  = getSettings();
  var now       = Date.now();
  var userEmail = Session.getActiveUser().getEmail();

  Object.keys(allProps).forEach(function(key) {
    if (key.indexOf('job_') !== 0) return;
    try {
      var job     = JSON.parse(allProps[key]);
      var changed = false;

      // --- Execute: scheduled time has passed ---
      if (now >= job.targetMs) {
        var thread = GmailApp.getThreadById(job.threadId);
        if (thread && !thread.isInTrash()) {
          if (job.markUnread) thread.markUnread();
          if (job.action === 'archive') {
            thread.moveToArchive();
          } else {
            thread.moveToTrash();
          }
          _removeScheduledLabel(job.threadId);
        }
        // Capture sender before trashing (thread still accessible here)
        var senderName = '';
        try {
          var messages = thread ? thread.getMessages() : [];
          if (messages.length > 0) senderName = messages[0].getFrom();
        } catch (err) {}
        _logToDigest(job, senderName);
        props.deleteProperty(key);
        return; // skip the save below
      }

      if (changed) {
        props.setProperty(key, JSON.stringify(job));
      }
    } catch (err) {
      Logger.log('pollJobs error on key ' + key + ': ' + err);
    }
  });

  // --- Weekly digest: send if 7 days have passed since last send ---
  _maybeSendDailyDigest(props, settings, userEmail);
}


// ============================================================
// DAILY DIGEST — called from pollJobs(), no trigger needed.
// Sends at most once per 7 days, tracked via last_digest_ms property.
// ============================================================
function _maybeSendDailyDigest(props, settings, userEmail) {
  if (settings.weeklyDigest !== 'true') return;

  var now          = Date.now();
  var lastSent     = parseInt(props.getProperty('last_digest_ms') || '0', 10);
  var oneWeek = 7 * 24 * 60 * 60 * 1000;
  if (now - lastSent < oneWeek) return; // not yet 7 days since last digest

  var digestRaw = props.getProperty('digest_log');
  if (!digestRaw) return;

  var entries = [];
  try { entries = JSON.parse(digestRaw); } catch (err) { return; }
  if (entries.length === 0) return;

  var lines = entries.map(function(entry) {
    var actionWord = entry.action === 'archive' ? 'Archived' : 'Trashed';
    var line = actionWord + ' at ' + formatDateTime(new Date(entry.targetMs)) + ':\n  Subject: ' + entry.subject;
    if (entry.sender) line += '\n  From: ' + entry.sender;
    return line;
  });

  var body =
    'Here is your weekly summary of automatically actioned emails:\n\n' +
    lines.join('\n\n') +
    '\n\n\u2014 Schedule to Trash Add-on';

  GmailApp.sendEmail(
    userEmail,
    'Weekly Digest - Schedule to Trash (' + entries.length + ' items)',
    body
  );

  props.deleteProperty('digest_log');
  props.setProperty('last_digest_ms', String(now));
}


// ============================================================
// SETTINGS CARD
// ============================================================
function buildSettingsCard(e) {
  var settings = getSettings();
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('⚙️ Settings').setSubtitle('Schedule to Trash'));

  // Action type
  var actionSection = CardService.newCardSection().setHeader('Default Action');
  actionSection.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName('actionType')
      .setTitle('When the timer fires:')
      .addItem('🗑️ Move to Trash', 'trash',   settings.actionType === 'trash')
      .addItem('📦 Archive',        'archive', settings.actionType === 'archive')
      .setOnChangeAction(
        CardService.newAction().setFunctionName('saveActionTypeSetting')
      )
  );

  // Toggles
  var toggleSection = CardService.newCardSection().setHeader('Options');
  toggleSection.addWidget(
    CardService.newDecoratedText()
      .setText('Mark as Unread on action')
      .setTopLabel('Snooze feel — email reappears as new')
      .setSwitchControl(
        CardService.newSwitch()
          .setFieldName('markUnread')
          .setValue('true')
          .setSelected(settings.markUnread === 'true')
          .setOnChangeAction(
            CardService.newAction()
              .setFunctionName('saveToggleSetting')
              .setParameters({ settingKey: 'markUnread' })
          )
      )
  );

  toggleSection.addWidget(
    CardService.newDecoratedText()
      .setText('Weekly digest email')
      .setTopLabel('Weekly summary of auto-actioned emails')
      .setSwitchControl(
        CardService.newSwitch()
          .setFieldName('weeklyDigest')
          .setValue('true')
          .setSelected(settings.weeklyDigest === 'true')
          .setOnChangeAction(
            CardService.newAction()
              .setFunctionName('saveToggleSetting')
              .setParameters({ settingKey: 'weeklyDigest' })
          )
      )
  );

  toggleSection.addWidget(
    CardService.newDecoratedText()
      .setText('Apply "scheduled-trash" label')
      .setTopLabel('Visible in Gmail sidebar for easy review')
      .setSwitchControl(
        CardService.newSwitch()
          .setFieldName('labelThreads')
          .setValue('true')
          .setSelected(settings.labelThreads === 'true')
          .setOnChangeAction(
            CardService.newAction()
              .setFunctionName('saveToggleSetting')
              .setParameters({ settingKey: 'labelThreads' })
          )
      )
  );

  // Setup instructions section
  var setupSection = CardService.newCardSection().setHeader('⚙️ One-time Setup');
  setupSection.addWidget(
    CardService.newTextParagraph()
      .setText(
        'To make jobs fire even when Gmail is closed:\n\n' +
        '1. Go to script.google.com\n' +
        '2. Open this project\n' +
        '3. Select "setupTrigger" from the function dropdown\n' +
        '4. Click Run ▶\n\n' +
        'This only needs to be done once. It creates a single hourly trigger that runs forever.'
      )
  );

  card.addSection(actionSection).addSection(toggleSection).addSection(setupSection);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}

function saveActionTypeSetting(e) {
  var val = e.formInput && e.formInput.actionType ? e.formInput.actionType : 'trash';
  saveSetting('actionType', val);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('✅ Default action set to: ' + val))
    .build();
}

function saveToggleSetting(e) {
  var key     = e.parameters.settingKey;
  var formVal = e.formInput && e.formInput[key];
  var value   = (formVal === 'true' || formVal === true) ? 'true' : 'false';
  saveSetting(key, value);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('✅ Setting saved.'))
    .build();
}




// ============================================================
// SCHEDULED JOBS SECTION (for current thread card)
// ============================================================
function buildScheduledSection(threadId) {
  var section  = CardService.newCardSection().setHeader('🕐 Scheduled for this thread');
  var props    = PropertiesService.getUserProperties();
  var allProps = props.getProperties();
  var now      = Date.now();
  var found    = false;

  Object.keys(allProps).forEach(function(key) {
    if (key.indexOf('job_') !== 0) return;
    try {
      var job = JSON.parse(allProps[key]);
      if (job.threadId !== threadId) return;
      if (job.targetMs < now) return;

      found = true;
      var dt         = new Date(job.targetMs);
      var actionIcon = job.action === 'archive' ? '📦' : '🗑️';

      var row = CardService.newDecoratedText()
        .setTopLabel(actionIcon + ' Scheduled: ' + formatDateTime(dt))
        .setText(job.label || '')
        .setWrapText(true);

      section.addWidget(row);

      // Postpone buttons
      section.addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText('+1 hour')
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('postponeJob')
                  .setParameters({ jobKey: key, extraMinutes: '60' })
              )
          )
          .addButton(
            CardService.newTextButton()
              .setText('+1 day')
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('postponeJob')
                  .setParameters({ jobKey: key, extraMinutes: String(24 * 60) })
              )
          )
          .addButton(
            CardService.newTextButton()
              .setText('Cancel')
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('cancelScheduledTrash')
                  .setParameters({ jobKey: key })
              )
          )
      );
    } catch (err) {}
  });

  if (!found) {
    section.addWidget(
      CardService.newTextParagraph().setText('No scheduled jobs for this thread.')
    );
  }

  return section;
}


// ============================================================
// INTERNAL HELPERS
// ============================================================

function _createTriggerAndStore(threadId, subject, targetTime, label, action) {
  // No per-job trigger created. The single pollJobs() trigger handles everything.
  var jobId    = 'job_' + Utilities.getUuid();
  var settings = getSettings();
  var job = {
    threadId:   threadId,
    subject:    subject,
    targetMs:   targetTime.getTime(),
    label:      label,
    action:     action || 'trash',
    markUnread: settings.markUnread === 'true',
  };
  PropertiesService.getUserProperties().setProperty(jobId, JSON.stringify(job));
  return jobId;
}

// _scheduleWarningEmail removed — handled by pollJobs()

function _applyScheduledLabel(threadId) {
  try {
    var label = GmailApp.getUserLabelByName('scheduled-trash');
    if (!label) label = GmailApp.createLabel('scheduled-trash');
    var thread = GmailApp.getThreadById(threadId);
    if (thread) label.addToThread(thread);
  } catch (err) {
    Logger.log('_applyScheduledLabel error: ' + err);
  }
}

function _removeScheduledLabel(threadId) {
  try {
    var label = GmailApp.getUserLabelByName('scheduled-trash');
    if (!label) return;
    var thread = GmailApp.getThreadById(threadId);
    if (thread) label.removeFromThread(thread);
  } catch (err) {
    Logger.log('_removeScheduledLabel error: ' + err);
  }
}

function _logToDigest(job, sender) {
  var props = PropertiesService.getUserProperties();
  var existing = [];
  try { existing = JSON.parse(props.getProperty('digest_log') || '[]'); } catch (err) {}
  existing.push({ subject: job.subject, targetMs: job.targetMs, action: job.action, sender: sender || '' });
  props.setProperty('digest_log', JSON.stringify(existing));
}


// ============================================================
// TIMEZONE (auto-follows Google Calendar — works while travelling)
// ============================================================

function getUserTimezone() {
  return CalendarApp.getDefaultCalendar().getTimeZone();
}

function formatTime(date) {
  return Utilities.formatDate(date, getUserTimezone(), 'h:mm a');
}

function formatDate(date) {
  return Utilities.formatDate(date, getUserTimezone(), 'MMM d');
}

function formatDateTime(date) {
  return Utilities.formatDate(date, getUserTimezone(), 'MMM d, h:mm a');
}