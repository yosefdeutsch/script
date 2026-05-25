// ============================================================
//  Gmail Action Extractor — Ultimate Edition v2
//  Pure Apps Script, no external APIs, completely free
// ============================================================

// ------------------------------------------------------------
//  HOMEPAGE — shown when not inside an email
// ------------------------------------------------------------
function onGmailHomepage(e) {
  return buildHomepageCard();
}

function buildHomepageCard() {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ Action Extractor")
      .setSubtitle("Open any email to get started")
  );

  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newImage()
      .setImageUrl("https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/bolt/default/48px.svg")
      .setAltText("Action Extractor")
  );
  section.addWidget(
    CardService.newTextParagraph().setText(
      "<b>What I do:</b><br>" +
      "✅ Extract tasks you need to action<br>" +
      "⏰ Spot deadlines & urgent items<br>" +
      "❓ Surface questions directed at you<br>" +
      "🚨 Flag important alerts<br>" +
      "🔔 Detect follow-ups needed<br><br>" +
      "👆 <b>Open any email</b> and I'll analyze it automatically."
    )
  );
  card.addSection(section);
  return card.build();
}


// ------------------------------------------------------------
//  ENTRY POINT — called when user opens an email
// ------------------------------------------------------------
function onGmailMessage(e) {
  var accessToken = e.messageMetadata.accessToken;
  var messageId   = e.messageMetadata.messageId;

  GmailApp.setCurrentMessageAccessToken(accessToken);
  var message = GmailApp.getMessageById(messageId);

  if (!message) return buildErrorCard("Could not load this email.");

  var body        = message.getPlainBody();
  var subject     = message.getSubject();
  var from        = message.getFrom();
  var date        = message.getDate();
  var thread      = message.getThread();
  var threadCount = thread ? thread.getMessageCount() : 1;

  var data        = extractActions(body);
  data.subject     = subject;
  data.from        = from;
  data.date        = date;
  data.threadCount = threadCount;

  return buildResultCard(data);
}


// ------------------------------------------------------------
//  EXTRACTION ENGINE
// ------------------------------------------------------------
function extractActions(body) {
  var lines = body.split(/\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 5; });

  var taskKeywords      = ["please", "can you", "could you", "would you", "need you to", "make sure", "don't forget", "send", "review", "complete", "submit", "update", "check", "confirm", "prepare", "schedule", "kindly", "ensure", "attach", "forward", "fill", "sign", "approve", "follow up", "look into", "handle", "arrange"];
  var deadlineKeywords  = ["by ", "due", "deadline", "eod", "end of day", "asap", "urgent", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "next week", "this week", "by end", "no later", "midnight", "noon"];
  var importantKeywords = ["important", "critical", "urgent", "high priority", "action required", "action needed", "required", "mandatory", "must", "immediately", "right away"];
  var followUpKeywords  = ["let me know", "get back to me", "waiting for", "looking forward", "keep me posted", "update me", "ping me", "reach out"];

  var tasks = [], deadlines = [], questions = [], important = [], followUps = [];

  lines.forEach(function(line) {
    var lower = line.toLowerCase();
    if (lower.match(/^(hi|hey|hello|dear|thanks|thank you|regards|best|cheers|sincerely|warm)/)) return;
    if (line.length < 15) return;

    var isQuestion  = line.indexOf("?") !== -1;
    var isDeadline  = deadlineKeywords.some(function(k) { return lower.indexOf(k) !== -1; });
    var isTask      = taskKeywords.some(function(k) { return lower.indexOf(k) !== -1; });
    var isImportant = importantKeywords.some(function(k) { return lower.indexOf(k) !== -1; });
    var isFollowUp  = followUpKeywords.some(function(k) { return lower.indexOf(k) !== -1; });

    if (isQuestion)       questions.push(line);
    else if (isImportant) important.push(line);
    else if (isDeadline) {
      var urgent = ["asap","urgent","today","eod","immediately"].some(function(k){ return lower.indexOf(k) !== -1; });
      deadlines.push({ text: line, urgent: urgent });
    }
    else if (isFollowUp) followUps.push(line);
    else if (isTask)     tasks.push(line);
  });

  var lowerBody = body.toLowerCase();
  var sentiment = "neutral";
  if (["urgent","asap","immediately"].some(function(k){ return lowerBody.indexOf(k) !== -1; })) sentiment = "urgent";
  else if (["thank","great job","well done"].some(function(k){ return lowerBody.indexOf(k) !== -1; })) sentiment = "positive";

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
//  CARD BUILDER
// ------------------------------------------------------------
function buildResultCard(data) {
  var card = CardService.newCardBuilder();

  var fromName = data.from.replace(/<.*>/, "").replace(/"/g, "").trim() || data.from;
  var sentimentIcon = data.sentiment === "urgent" ? "🔴 Urgent" : data.sentiment === "positive" ? "🟢 Positive" : "🔵 Info";

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ " + (data.subject || "Action Extractor"))
      .setSubtitle("From: " + fromName)
  );

  // Stats
  var statsSection = CardService.newCardSection();
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Overview")
      .setText(sentimentIcon + "  •  " + data.wordCount + " words  •  ~" + data.readTime + " min  •  " + data.threadCount + (data.threadCount > 1 ? " messages" : " message"))
      .setWrapText(true)
  );

  // Quick actions — open OVERLAY (no new tab)
  var quickBtns = CardService.newButtonSet();
  quickBtns.addButton(
    CardService.newTextButton()
      .setText("✉️ Reply")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onQuickReply")
          .setParameters({ from: data.from, subject: data.subject || "" })
      )
  );
  quickBtns.addButton(
    CardService.newTextButton()
      .setText("🗓️ Meeting")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onScheduleMeeting")
          .setParameters({ from: data.from, subject: data.subject || "" })
      )
  );
  quickBtns.addButton(
    CardService.newTextButton()
      .setText("📋 Summary")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onShowSummary")
          .setParameters({
            tasks:     JSON.stringify(data.tasks),
            deadlines: JSON.stringify(data.deadlines.map(function(d){ return d.text; })),
            questions: JSON.stringify(data.questions),
            followUps: JSON.stringify(data.followUps)
          })
      )
  );
  statsSection.addWidget(quickBtns);
  card.addSection(statsSection);

  // Important
  if (data.important.length > 0) {
    var impSection = CardService.newCardSection().setHeader("🚨 Important");
    data.important.forEach(function(item) {
      impSection.addWidget(CardService.newDecoratedText().setText(item).setWrapText(true));
    });
    card.addSection(impSection);
  }

  // Tasks
  if (data.tasks.length > 0) {
    var taskSection = CardService.newCardSection().setHeader("✅ Tasks for you");
    data.tasks.forEach(function(task) {
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

  // Deadlines
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

  // Questions
  if (data.questions.length > 0) {
    var qSection = CardService.newCardSection().setHeader("❓ Questions for you");
    data.questions.forEach(function(q) {
      qSection.addWidget(CardService.newDecoratedText().setText(q).setWrapText(true));
      var btnSet = CardService.newButtonSet();
      btnSet.addButton(
        CardService.newTextButton()
          .setText("✓ Yes")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onSendReply")
              .setParameters({ from: data.from, subject: data.subject || "", replyText: "Yes — regarding your question: \"" + q.slice(0,80) + "\"" })
          )
      );
      btnSet.addButton(
        CardService.newTextButton()
          .setText("✗ No")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onSendReply")
              .setParameters({ from: data.from, subject: data.subject || "", replyText: "No — regarding your question: \"" + q.slice(0,80) + "\"" })
          )
      );
      btnSet.addButton(
        CardService.newTextButton()
          .setText("✏️ Custom")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onQuickReply")
              .setParameters({ from: data.from, subject: data.subject || "" })
          )
      );
      qSection.addWidget(btnSet);
    });
    card.addSection(qSection);
  }

  // Follow-ups
  if (data.followUps.length > 0) {
    var fuSection = CardService.newCardSection().setHeader("🔔 Follow-ups");
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

  // Empty state
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
  var url = "https://calendar.google.com/calendar/r/eventedit?text=" + encodeURIComponent(e.parameters.text);
  return CardService.newActionResponseBuilder()
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl(url)
        .setOpenAs(CardService.OpenAs.OVERLAY)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

function onQuickReply(e) {
  var subject = e.parameters.subject || "";
  var re = subject.toLowerCase().startsWith("re:") ? subject : "Re: " + subject;
  var url = "https://mail.google.com/mail/?view=cm&fs=1&to=" +
    encodeURIComponent(e.parameters.from) + "&su=" + encodeURIComponent(re);
  return CardService.newActionResponseBuilder()
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl(url)
        .setOpenAs(CardService.OpenAs.OVERLAY)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

function onSendReply(e) {
  var subject = e.parameters.subject || "";
  var re = subject.toLowerCase().startsWith("re:") ? subject : "Re: " + subject;
  var url = "https://mail.google.com/mail/?view=cm&fs=1&to=" +
    encodeURIComponent(e.parameters.from) +
    "&su=" + encodeURIComponent(re) +
    "&body=" + encodeURIComponent(e.parameters.replyText);
  return CardService.newActionResponseBuilder()
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl(url)
        .setOpenAs(CardService.OpenAs.OVERLAY)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

function onScheduleMeeting(e) {
  var url = "https://calendar.google.com/calendar/r/eventedit?text=" +
    encodeURIComponent("Meeting: " + e.parameters.subject) +
    "&add=" + encodeURIComponent(e.parameters.from);
  return CardService.newActionResponseBuilder()
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl(url)
        .setOpenAs(CardService.OpenAs.OVERLAY)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

function onSetReminder(e) {
  var url = "https://calendar.google.com/calendar/r/eventedit?text=" +
    encodeURIComponent("🔔 Follow up: " + e.parameters.text);
  return CardService.newActionResponseBuilder()
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl(url)
        .setOpenAs(CardService.OpenAs.OVERLAY)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

function onShowSummary(e) {
  var tasks     = JSON.parse(e.parameters.tasks     || "[]");
  var deadlines = JSON.parse(e.parameters.deadlines || "[]");
  var questions = JSON.parse(e.parameters.questions || "[]");
  var followUps = JSON.parse(e.parameters.followUps || "[]");

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("📋 Full Summary"));

  var section = CardService.newCardSection();
  var text = "";
  if (tasks.length)     text += "✅ TASKS\n"     + tasks.map(function(t,i){ return (i+1)+". "+t; }).join("\n") + "\n\n";
  if (deadlines.length) text += "⏰ DEADLINES\n" + deadlines.map(function(t,i){ return (i+1)+". "+t; }).join("\n") + "\n\n";
  if (questions.length) text += "❓ QUESTIONS\n" + questions.map(function(t,i){ return (i+1)+". "+t; }).join("\n") + "\n\n";
  if (followUps.length) text += "🔔 FOLLOW-UPS\n"+ followUps.map(function(t,i){ return (i+1)+". "+t; }).join("\n");
  if (!text) text = "No action items found in this email.";

  section.addWidget(CardService.newTextParagraph().setText(text));
  card.addSection(section);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
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