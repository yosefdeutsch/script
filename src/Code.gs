// ============================================================
//  Gmail Action Extractor — Ultimate Edition
//  Pure Apps Script, no external APIs, completely free
// ============================================================

// ------------------------------------------------------------
//  ENTRY POINT
// ------------------------------------------------------------
function onGmailMessage(e) {
  var accessToken = e.messageMetadata.accessToken;
  var messageId   = e.messageMetadata.messageId;

  GmailApp.setCurrentMessageAccessToken(accessToken);
  var message = GmailApp.getMessageById(messageId);

  if (!message) return buildErrorCard("Could not load this email.");

  var body    = message.getPlainBody();
  var subject = message.getSubject();
  var from    = message.getFrom();
  var date    = message.getDate();
  var thread  = message.getThread();
  var threadCount = thread ? thread.getMessageCount() : 1;

  var data = extractActions(body);
  data.subject     = subject;
  data.from        = from;
  data.date        = date;
  data.threadCount = threadCount;
  data.messageId   = messageId;
  data.body        = body;

  return buildResultCard(data);
}


// ------------------------------------------------------------
//  EXTRACTION ENGINE
// ------------------------------------------------------------
function extractActions(body) {
  var lines = body.split(/\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 5; });

  var taskKeywords     = ["please", "can you", "could you", "would you", "need you to", "make sure", "don't forget", "send", "review", "complete", "submit", "update", "check", "confirm", "prepare", "schedule", "kindly", "ensure", "attach", "forward", "fill", "sign", "approve", "follow up", "look into", "handle", "arrange"];
  var deadlineKeywords = ["by ", "due", "deadline", "eod", "end of day", "asap", "urgent", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "next week", "this week", "by end", "no later", "midnight", "noon", "morning", "afternoon"];
  var importantKeywords= ["important", "critical", "urgent", "high priority", "action required", "action needed", "required", "mandatory", "must", "immediately", "right away", "as soon as possible"];
  var followUpKeywords = ["let me know", "get back to me", "waiting for", "looking forward", "keep me posted", "update me", "ping me", "reach out"];

  var tasks     = [];
  var deadlines = [];
  var questions = [];
  var important = [];
  var followUps = [];

  lines.forEach(function(line) {
    var lower = line.toLowerCase();

    // Skip greetings/sign-offs
    if (lower.match(/^(hi|hey|hello|dear|thanks|thank you|regards|best|cheers|sincerely|warm)/)) return;
    if (line.length < 15) return;

    var isQuestion  = line.indexOf("?") !== -1;
    var isDeadline  = deadlineKeywords.some(function(k) { return lower.indexOf(k) !== -1; });
    var isTask      = taskKeywords.some(function(k) { return lower.indexOf(k) !== -1; });
    var isImportant = importantKeywords.some(function(k) { return lower.indexOf(k) !== -1; });
    var isFollowUp  = followUpKeywords.some(function(k) { return lower.indexOf(k) !== -1; });

    if (isQuestion) {
      questions.push(line);
    } else if (isImportant) {
      important.push(line);
    } else if (isDeadline) {
      var urgent = lower.indexOf("asap") !== -1 || lower.indexOf("urgent") !== -1 ||
                   lower.indexOf("today") !== -1 || lower.indexOf("eod") !== -1 ||
                   lower.indexOf("immediately") !== -1;
      deadlines.push({ text: line, urgent: urgent });
    } else if (isFollowUp) {
      followUps.push(line);
    } else if (isTask) {
      tasks.push(line);
    }
  });

  // Sentiment: detect if email is positive, neutral, or needs attention
  var lowerBody = body.toLowerCase();
  var sentiment = "neutral";
  if (lowerBody.indexOf("urgent") !== -1 || lowerBody.indexOf("asap") !== -1 || lowerBody.indexOf("immediately") !== -1) {
    sentiment = "urgent";
  } else if (lowerBody.indexOf("thank") !== -1 || lowerBody.indexOf("great job") !== -1 || lowerBody.indexOf("well done") !== -1) {
    sentiment = "positive";
  }

  // Word count & read time
  var wordCount = body.split(/\s+/).filter(Boolean).length;
  var readTime  = Math.max(1, Math.round(wordCount / 200));

  return {
    tasks:     tasks.slice(0, 4),
    deadlines: deadlines.slice(0, 3),
    questions: questions.slice(0, 4),
    important: important.slice(0, 2),
    followUps: followUps.slice(0, 2),
    sentiment: sentiment,
    wordCount: wordCount,
    readTime:  readTime
  };
}


// ------------------------------------------------------------
//  CARD BUILDER — Ultimate layout
// ------------------------------------------------------------
function buildResultCard(data) {
  var card = CardService.newCardBuilder();

  // ── Header with sender info ──
  var fromName = data.from.replace(/<.*>/, "").trim() || data.from;
  var dateStr  = data.date ? Utilities.formatDate(data.date, Session.getScriptTimeZone(), "MMM d, h:mm a") : "";
  var sentimentIcon = data.sentiment === "urgent" ? "🔴 Urgent" : data.sentiment === "positive" ? "🟢 Positive" : "🔵 Info";

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ " + (data.subject || "Action Extractor"))
      .setSubtitle("From: " + fromName)
  );

  // ── Stats bar ──
  var statsSection = CardService.newCardSection();
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Email stats")
      .setText(sentimentIcon + "  •  " + data.wordCount + " words  •  ~" + data.readTime + " min read  •  " + data.threadCount + " message" + (data.threadCount > 1 ? "s" : "") + " in thread")
      .setWrapText(true)
  );

  // Quick action buttons row
  var quickBtns = CardService.newButtonSet();
  quickBtns.addButton(
    CardService.newTextButton()
      .setText("📋 Copy all")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onCopyAll")
          .setParameters({
            tasks:     JSON.stringify(data.tasks),
            deadlines: JSON.stringify(data.deadlines.map(function(d) { return d.text; })),
            questions: JSON.stringify(data.questions)
          })
      )
  );
  quickBtns.addButton(
    CardService.newTextButton()
      .setText("✉️ Quick reply")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onQuickReply")
          .setParameters({ from: data.from, subject: data.subject || "" })
      )
  );
  quickBtns.addButton(
    CardService.newTextButton()
      .setText("🗓️ Schedule")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onScheduleMeeting")
          .setParameters({ from: data.from, subject: data.subject || "" })
      )
  );
  statsSection.addWidget(quickBtns);
  card.addSection(statsSection);

  // ── Important alerts ──
  if (data.important.length > 0) {
    var impSection = CardService.newCardSection().setHeader("🚨 Important");
    data.important.forEach(function(item) {
      impSection.addWidget(
        CardService.newDecoratedText()
          .setText(item)
          .setWrapText(true)
      );
    });
    card.addSection(impSection);
  }

  // ── Tasks ──
  if (data.tasks.length > 0) {
    var taskSection = CardService.newCardSection().setHeader("✅ Tasks for you");
    data.tasks.forEach(function(task, i) {
      taskSection.addWidget(
        CardService.newDecoratedText()
          .setText(task)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton()
              .setText("📅 Add")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onAddToCalendar")
                  .setParameters({ text: task.slice(0, 100) })
              )
          )
      );
    });
    card.addSection(taskSection);
  }

  // ── Deadlines ──
  if (data.deadlines.length > 0) {
    var dlSection = CardService.newCardSection().setHeader("⏰ Deadlines");
    data.deadlines.forEach(function(dl) {
      dlSection.addWidget(
        CardService.newDecoratedText()
          .setText((dl.urgent ? "⚠️ " : "📆 ") + dl.text)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton()
              .setText("Calendar")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onAddToCalendar")
                  .setParameters({ text: dl.text.slice(0, 100) })
              )
          )
      );
    });
    card.addSection(dlSection);
  }

  // ── Questions ──
  if (data.questions.length > 0) {
    var qSection = CardService.newCardSection().setHeader("❓ Questions for you");
    data.questions.forEach(function(q) {
      var btnSet = CardService.newButtonSet();
      btnSet.addButton(
        CardService.newTextButton()
          .setText("✓ Yes")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onSendReply")
              .setParameters({ from: data.from, subject: data.subject || "", replyText: "Yes, " + q })
          )
      );
      btnSet.addButton(
        CardService.newTextButton()
          .setText("✗ No")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onSendReply")
              .setParameters({ from: data.from, subject: data.subject || "", replyText: "No, " + q })
          )
      );
      btnSet.addButton(
        CardService.newTextButton()
          .setText("✏️ Reply")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onQuickReply")
              .setParameters({ from: data.from, subject: data.subject || "" })
          )
      );
      qSection.addWidget(CardService.newDecoratedText().setText(q).setWrapText(true));
      qSection.addWidget(btnSet);
    });
    card.addSection(qSection);
  }

  // ── Follow-ups ──
  if (data.followUps.length > 0) {
    var fuSection = CardService.newCardSection().setHeader("🔔 Follow-ups needed");
    data.followUps.forEach(function(fu) {
      fuSection.addWidget(
        CardService.newDecoratedText()
          .setText(fu)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton()
              .setText("Remind me")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onSetReminder")
                  .setParameters({ text: fu.slice(0, 100) })
              )
          )
      );
    });
    card.addSection(fuSection);
  }

  // ── Empty state ──
  if (data.tasks.length === 0 && data.deadlines.length === 0 &&
      data.questions.length === 0 && data.important.length === 0 && data.followUps.length === 0) {
    card.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText("✅ No action items — this email is just FYI.")
      )
    );
  }

  return card.build();
}

function buildErrorCard(msg) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("⚡ Action Extractor"))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText("⚠️ " + msg)
      )
    )
    .build();
}


// ------------------------------------------------------------
//  ACTION HANDLERS
// ------------------------------------------------------------
function onAddToCalendar(e) {
  var url = "https://calendar.google.com/calendar/r/eventedit?text=" +
    encodeURIComponent(e.parameters.text);
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink().setUrl(url))
    .build();
}

function onQuickReply(e) {
  var subject = e.parameters.subject || "";
  var re = subject.toLowerCase().indexOf("re:") === 0 ? subject : "Re: " + subject;
  var url = "https://mail.google.com/mail/?view=cm&fs=1&to=" +
    encodeURIComponent(e.parameters.from) +
    "&su=" + encodeURIComponent(re);
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink().setUrl(url))
    .build();
}

function onSendReply(e) {
  var subject = e.parameters.subject || "";
  var re = subject.toLowerCase().indexOf("re:") === 0 ? subject : "Re: " + subject;
  var url = "https://mail.google.com/mail/?view=cm&fs=1&to=" +
    encodeURIComponent(e.parameters.from) +
    "&su=" + encodeURIComponent(re) +
    "&body=" + encodeURIComponent(e.parameters.replyText);
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink().setUrl(url))
    .build();
}

function onScheduleMeeting(e) {
  var url = "https://calendar.google.com/calendar/r/eventedit?text=" +
    encodeURIComponent("Meeting: " + e.parameters.subject) +
    "&add=" + encodeURIComponent(e.parameters.from);
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink().setUrl(url))
    .build();
}

function onSetReminder(e) {
  var url = "https://calendar.google.com/calendar/r/eventedit?text=" +
    encodeURIComponent("🔔 Follow up: " + e.parameters.text);
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink().setUrl(url))
    .build();
}

function onCopyAll(e) {
  var tasks     = JSON.parse(e.parameters.tasks     || "[]");
  var deadlines = JSON.parse(e.parameters.deadlines || "[]");
  var questions = JSON.parse(e.parameters.questions || "[]");

  var parts = [];
  if (tasks.length)     parts.push("TASKS:\n"     + tasks.map(function(t,i){ return (i+1)+". "+t; }).join("\n"));
  if (deadlines.length) parts.push("DEADLINES:\n" + deadlines.map(function(t,i){ return (i+1)+". "+t; }).join("\n"));
  if (questions.length) parts.push("QUESTIONS:\n" + questions.map(function(t,i){ return (i+1)+". "+t; }).join("\n"));

  var summary = parts.join("\n\n") || "No action items found.";

  // Show in a notification (clipboard not available in Apps Script — open a URL to display)
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Copied! " + (tasks.length + deadlines.length + questions.length) + " items found."))
    .build();
}


// ------------------------------------------------------------
//  TEST
// ------------------------------------------------------------
function testExtraction() {
  var body = "Hi team,\n\nPlease send the final design files by Friday EOD — this is urgent.\nCould you review the attached brief before our call?\nAre you joining the kickoff meeting Thursday at 3pm?\nLet me know if you need anything else.\n\nBest,\nSarah";
  var result = extractActions(body);
  Logger.log(JSON.stringify(result, null, 2));
}