// ============================================================
//  Gmail Action Extractor — AI Edition (Gemini, free tier)
//  Understands emails, not just keywords
// ============================================================

// ▸ PASTE YOUR GEMINI API KEY HERE
var GEMINI_API_KEY = "AIzaSyAIP5edFM8u-PdYYSAKqO7PtgBCuxu0hJQ";
var GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=";


// ------------------------------------------------------------
//  HOMEPAGE — shown when not inside an email
// ------------------------------------------------------------
function onGmailHomepage(e) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ Action Extractor")
      .setSubtitle("AI-powered email assistant")
  );
  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph().setText(
      "👆 <b>Open any email</b> and I'll read it and tell you exactly:\n\n" +
      "✅  What you need to do\n" +
      "⏰  Any deadlines mentioned\n" +
      "❓  Questions asked of you\n" +
      "🚨  Anything urgent or important\n" +
      "🔔  What needs a follow-up\n\n" +
      "Powered by Google Gemini AI — free."
    )
  );
  card.addSection(section);
  return card.build();
}


// ------------------------------------------------------------
//  ENTRY POINT
// ------------------------------------------------------------
function onGmailMessage(e) {
  var accessToken = e.messageMetadata.accessToken;
  var messageId   = e.messageMetadata.messageId;

  GmailApp.setCurrentMessageAccessToken(accessToken);
  var message = GmailApp.getMessageById(messageId);
  if (!message) return buildErrorCard("Could not load this email.");

  // Check cache first — avoids repeat API calls for same email
  var cache = CacheService.getUserCache();
  var cached = cache.get("email_" + messageId);
  var data;

  if (cached) {
    data = JSON.parse(cached);
  } else {
    var body        = message.getPlainBody().slice(0, 3000);
    var subject     = message.getSubject();
    var from        = message.getFrom();
    data = analyzeWithAI(subject, from, body);
    if (!data.error) {
      cache.put("email_" + messageId, JSON.stringify(data), 3600); // cache 1 hour
    }
  }

  if (data.error) return buildErrorCard(data.error);

  data.subject     = message.getSubject();
  data.from        = message.getFrom();
  data.threadCount = message.getThread() ? message.getThread().getMessageCount() : 1;
  data.wordCount   = message.getPlainBody().split(/\s+/).filter(Boolean).length;

  return buildResultCard(data);
}


// ------------------------------------------------------------
//  GEMINI AI CALL
//  Asks Gemini to truly understand the email and extract meaning
// ------------------------------------------------------------
function analyzeWithAI(subject, from, body) {
  var prompt = [
    "You are a personal email assistant. Read the email below carefully and understand what is actually being said.",
    "Then extract the following in plain human language — as if explaining to the recipient what they need to know.",
    "",
    "Return ONLY a valid JSON object, no markdown, no explanation.",
    "",
    "JSON structure:",
    "{",
    '  "summary": "2-3 sentences explaining what this email is actually about and what the sender wants",',
    '  "sentiment": "urgent|positive|neutral|negative",',
    '  "tasks": [',
    '    { "text": "Clear description of something the recipient needs to do", "priority": "high|medium|low" }',
    "  ],",
    '  "deadlines": [',
    '    { "text": "What needs to happen", "when": "specific time or date mentioned", "urgent": true|false }',
    "  ],",
    '  "questions": [',
    '    { "text": "The actual question being asked of the recipient", "suggestedReplies": ["short option 1", "short option 2"] }',
    "  ],",
    '  "important": ["anything flagged as critical, urgent, or high priority"],',
    '  "followUps": ["things the recipient should follow up on or respond to"]',
    "}",
    "",
    "Be specific and human. Don't just copy sentences from the email — interpret what the sender actually wants.",
    "If a category has nothing relevant, use an empty array.",
    "",
    "--- EMAIL ---",
    "From: " + from,
    "Subject: " + subject,
    "",
    body
  ].join("\n");

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(GEMINI_URL + GEMINI_API_KEY, options);
    var json     = JSON.parse(response.getContentText());

    if (json.error) return { error: json.error.message };

    var rawText = json.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json|```/g, "").trim();
    return JSON.parse(rawText);

  } catch (err) {
    return { error: "Could not analyze email: " + err.message };
  }
}


// ------------------------------------------------------------
//  CARD BUILDER
// ------------------------------------------------------------
function buildResultCard(data) {
  var card = CardService.newCardBuilder();
  var fromName = data.from.replace(/<.*>/, "").replace(/"/g, "").trim() || data.from;
  var sentimentIcon = { urgent: "🔴", positive: "🟢", negative: "🟠", neutral: "🔵" }[data.sentiment] || "🔵";

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ " + (data.subject || "Action Extractor"))
      .setSubtitle("From: " + fromName)
  );

  // Summary section
  var summarySection = CardService.newCardSection().setHeader(sentimentIcon + " What this email is about");
  summarySection.addWidget(
    CardService.newTextParagraph().setText(data.summary || "No summary available.")
  );

  var quickBtns = CardService.newButtonSet();
  quickBtns.addButton(
    CardService.newTextButton().setText("✉️ Reply")
      .setOnClickAction(CardService.newAction().setFunctionName("onQuickReply")
        .setParameters({ from: data.from, subject: data.subject || "" }))
  );
  quickBtns.addButton(
    CardService.newTextButton().setText("🗓️ Meeting")
      .setOnClickAction(CardService.newAction().setFunctionName("onScheduleMeeting")
        .setParameters({ from: data.from, subject: data.subject || "" }))
  );
  quickBtns.addButton(
    CardService.newTextButton().setText("📋 All items")
      .setOnClickAction(CardService.newAction().setFunctionName("onShowSummary")
        .setParameters({
          tasks:     JSON.stringify((data.tasks||[]).map(function(t){ return t.text; })),
          deadlines: JSON.stringify((data.deadlines||[]).map(function(d){ return d.when ? d.text+" — "+d.when : d.text; })),
          questions: JSON.stringify((data.questions||[]).map(function(q){ return q.text; })),
          followUps: JSON.stringify(data.followUps||[])
        }))
  );
  summarySection.addWidget(quickBtns);
  card.addSection(summarySection);

  // Important
  if (data.important && data.important.length > 0) {
    var impSection = CardService.newCardSection().setHeader("🚨 Important");
    data.important.forEach(function(item) {
      impSection.addWidget(CardService.newDecoratedText().setText(item).setWrapText(true));
    });
    card.addSection(impSection);
  }

  // Tasks
  if (data.tasks && data.tasks.length > 0) {
    var taskSection = CardService.newCardSection().setHeader("✅ What you need to do");
    data.tasks.forEach(function(task) {
      var icon = task.priority === "high" ? "🔴 " : task.priority === "medium" ? "🟡 " : "🟢 ";
      taskSection.addWidget(
        CardService.newDecoratedText()
          .setText(icon + task.text)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton().setText("📅 Add")
              .setOnClickAction(CardService.newAction().setFunctionName("onAddToCalendar")
                .setParameters({ text: task.text.slice(0, 100) }))
          )
      );
    });
    card.addSection(taskSection);
  }

  // Deadlines
  if (data.deadlines && data.deadlines.length > 0) {
    var dlSection = CardService.newCardSection().setHeader("⏰ Deadlines");
    data.deadlines.forEach(function(dl) {
      var label = (dl.urgent ? "⚠️ " : "📆 ") + dl.text + (dl.when ? "  —  " + dl.when : "");
      dlSection.addWidget(
        CardService.newDecoratedText()
          .setText(label)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton().setText("Calendar")
              .setOnClickAction(CardService.newAction().setFunctionName("onAddToCalendar")
                .setParameters({ text: (dl.text + (dl.when ? " by " + dl.when : "")).slice(0, 100) }))
          )
      );
    });
    card.addSection(dlSection);
  }

  // Questions
  if (data.questions && data.questions.length > 0) {
    var qSection = CardService.newCardSection().setHeader("❓ Questions for you");
    data.questions.forEach(function(q) {
      qSection.addWidget(CardService.newDecoratedText().setText(q.text).setWrapText(true));
      var btnSet = CardService.newButtonSet();
      (q.suggestedReplies || ["Yes", "No"]).forEach(function(reply) {
        btnSet.addButton(
          CardService.newTextButton().setText(reply)
            .setOnClickAction(CardService.newAction().setFunctionName("onSendReply")
              .setParameters({ from: data.from, subject: data.subject || "", replyText: reply }))
        );
      });
      btnSet.addButton(
        CardService.newTextButton().setText("✏️ Custom")
          .setOnClickAction(CardService.newAction().setFunctionName("onQuickReply")
            .setParameters({ from: data.from, subject: data.subject || "" }))
      );
      qSection.addWidget(btnSet);
    });
    card.addSection(qSection);
  }

  // Follow-ups
  if (data.followUps && data.followUps.length > 0) {
    var fuSection = CardService.newCardSection().setHeader("🔔 Follow-ups");
    data.followUps.forEach(function(fu) {
      fuSection.addWidget(
        CardService.newDecoratedText()
          .setText(fu)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton().setText("Remind me")
              .setOnClickAction(CardService.newAction().setFunctionName("onSetReminder")
                .setParameters({ text: fu.slice(0, 100) }))
          )
      );
    });
    card.addSection(fuSection);
  }

  // Empty state
  if ((!data.tasks||data.tasks.length===0) && (!data.deadlines||data.deadlines.length===0) &&
      (!data.questions||data.questions.length===0) && (!data.important||data.important.length===0)) {
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
    .addSection(CardService.newCardSection().addWidget(
      CardService.newTextParagraph().setText("⚠️ " + msg)
    ))
    .build();
}


// ------------------------------------------------------------
//  ACTION HANDLERS
// ------------------------------------------------------------
function onAddToCalendar(e) {
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://calendar.google.com/calendar/r/eventedit?text=" + encodeURIComponent(e.parameters.text))
      .setOpenAs(CardService.OpenAs.OVERLAY)
      .setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onQuickReply(e) {
  var subject = e.parameters.subject || "";
  var re = subject.toLowerCase().indexOf("re:") === 0 ? subject : "Re: " + subject;
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(e.parameters.from) + "&su=" + encodeURIComponent(re))
      .setOpenAs(CardService.OpenAs.OVERLAY)
      .setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onSendReply(e) {
  var subject = e.parameters.subject || "";
  var re = subject.toLowerCase().indexOf("re:") === 0 ? subject : "Re: " + subject;
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(e.parameters.from) + "&su=" + encodeURIComponent(re) + "&body=" + encodeURIComponent(e.parameters.replyText))
      .setOpenAs(CardService.OpenAs.OVERLAY)
      .setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onScheduleMeeting(e) {
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://calendar.google.com/calendar/r/eventedit?text=" + encodeURIComponent("Meeting: " + e.parameters.subject) + "&add=" + encodeURIComponent(e.parameters.from))
      .setOpenAs(CardService.OpenAs.OVERLAY)
      .setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onSetReminder(e) {
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://calendar.google.com/calendar/r/eventedit?text=" + encodeURIComponent("🔔 Follow up: " + e.parameters.text))
      .setOpenAs(CardService.OpenAs.OVERLAY)
      .setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onShowSummary(e) {
  var tasks     = JSON.parse(e.parameters.tasks     || "[]");
  var deadlines = JSON.parse(e.parameters.deadlines || "[]");
  var questions = JSON.parse(e.parameters.questions || "[]");
  var followUps = JSON.parse(e.parameters.followUps || "[]");

  var text = "";
  if (tasks.length)     text += "✅ TASKS\n"      + tasks.map(function(t,i){ return (i+1)+". "+t; }).join("\n") + "\n\n";
  if (deadlines.length) text += "⏰ DEADLINES\n"  + deadlines.map(function(t,i){ return (i+1)+". "+t; }).join("\n") + "\n\n";
  if (questions.length) text += "❓ QUESTIONS\n"  + questions.map(function(t,i){ return (i+1)+". "+t; }).join("\n") + "\n\n";
  if (followUps.length) text += "🔔 FOLLOW-UPS\n" + followUps.map(function(t,i){ return (i+1)+". "+t; }).join("\n");
  if (!text) text = "No action items found.";

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("📋 Full Summary"))
    .addSection(CardService.newCardSection().addWidget(
      CardService.newTextParagraph().setText(text)
    ));
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}


// ------------------------------------------------------------
//  TEST — run this first to verify Gemini is working
// ------------------------------------------------------------
function testExtraction() {
  var result = analyzeWithAI(
    "Q3 campaign updates",
    "sarah@example.com",
    "Hi,\n\nCan you send the final design files? The proposal needs to be submitted by Friday EOD — no exceptions.\nAre you joining the kickoff call Thursday at 3pm? Let me know so I can send the invite.\nAlso please review the attached brief before we proceed.\n\nThanks,\nSarah"
  );
  Logger.log(JSON.stringify(result, null, 2));
}