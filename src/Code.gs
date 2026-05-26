// ============================================================
//  Gmail Action Extractor — Smart NLP Edition
//  No API keys. No quotas. Works forever. Free.
//  Uses advanced sentence analysis to truly understand emails.
// ============================================================


// ------------------------------------------------------------
//  HOMEPAGE
// ------------------------------------------------------------
function onGmailHomepage(e) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ Action Extractor")
      .setSubtitle("Smart email assistant — open any email")
  );
  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph().setText(
      "👆 <b>Open any email</b> and I'll read it and tell you:\n\n" +
      "✅  What you need to do\n" +
      "⏰  Any deadlines mentioned\n" +
      "❓  Questions asked of you\n" +
      "🚨  Anything urgent or important\n" +
      "🔔  What needs a follow-up\n\n" +
      "100% free. No API key needed."
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

  var body        = message.getPlainBody();
  var subject     = message.getSubject();
  var from        = message.getFrom();
  var thread      = message.getThread();
  var threadCount = thread ? thread.getMessageCount() : 1;

  var data        = analyzeEmail(subject, from, body);
  data.subject     = subject;
  data.from        = from;
  data.threadCount = threadCount;
  data.wordCount   = body.split(/\s+/).filter(Boolean).length;

  return buildResultCard(data);
}


// ------------------------------------------------------------
//  SMART EMAIL ANALYSIS ENGINE
//  Understands sentence intent, not just keywords
// ------------------------------------------------------------
function analyzeEmail(subject, from, body) {

  // Clean and split into real sentences
  var cleaned   = body.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
  var sentences = splitIntoSentences(cleaned);

  var tasks     = [];
  var deadlines = [];
  var questions = [];
  var important = [];
  var followUps = [];

  sentences.forEach(function(sentence) {
    var s     = sentence.trim();
    var lower = s.toLowerCase();

    // Skip short lines, greetings, sign-offs
    if (s.length < 12) return;
    if (/^(hi|hey|hello|dear|good morning|good afternoon|hope (you|this)|thank|thanks|regards|best|cheers|sincerely|warm|talk soon|speak soon|have a good|looking forward to hearing)/i.test(s)) return;
    if (/^(sent from|get outlook|unsubscribe|privacy policy|confidential)/i.test(s)) return;

    var intent = classifyIntent(s, lower);

    if      (intent === "question")   questions.push(buildQuestion(s));
    else if (intent === "urgent")     important.push(s);
    else if (intent === "deadline")   deadlines.push(buildDeadline(s, lower));
    else if (intent === "task")       tasks.push(buildTask(s, lower));
    else if (intent === "followup")   followUps.push(s);
  });

  // Deduplicate overlapping items
  tasks = dedup(tasks.map(function(t){ return t.text; })).map(function(t){ return { text: t, priority: getPriority(t.toLowerCase()) }; });

  return {
    summary:   buildSummary(subject, from, tasks, deadlines, questions),
    sentiment: getSentiment(body.toLowerCase()),
    tasks:     tasks.slice(0, 4),
    deadlines: deadlines.slice(0, 3),
    questions: questions.slice(0, 4),
    important: dedup(important).slice(0, 2),
    followUps: dedup(followUps).slice(0, 2)
  };
}


// ------------------------------------------------------------
//  INTENT CLASSIFIER
//  Determines what each sentence is actually saying
// ------------------------------------------------------------
function classifyIntent(s, lower) {

  // Questions — ends with ? or has question structure
  if (s.indexOf("?") !== -1) return "question";
  if (/^(could you|can you|would you|will you|do you|are you|is there|have you|did you|when (can|will|should)|what (is|are|do|should)|how (do|can|should|long|many|much)|who (is|will|can|should)|where (is|are|can|should)|which|why (is|are|did|do|would))/i.test(s)) return "question";

  // Urgent / important flags
  if (/\b(urgent|critical|asap|emergency|immediately|right away|high priority|action required|action needed|time[- ]sensitive|do not (ignore|miss|forget)|must not|cannot wait)\b/i.test(s)) return "urgent";

  // Deadlines — time-bound requirements
  if (/\b(by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|eod|end of (day|week|month)|next week|[0-9]+(st|nd|rd|th)?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i.test(s)) return "deadline";
  if (/\b(due (date|by|on)|deadline|no later than|must be (submitted|completed|sent|done|ready)|needs? to be (in|done|submitted|ready|completed) by|expected by|deliver(ed)? by)\b/i.test(s)) return "deadline";

  // Tasks — things the recipient needs to do
  if (/^(please|kindly|could you please|would you (please|mind|be able to)|i (need|want|require|would like|am asking) you to|make sure (you|to)|ensure (you|that)|don'?t forget to|remember to|you (need|should|must|have) to|it'?s (important|necessary) (for you|that you))/i.test(s)) return "task";
  if (/\b(please (send|review|check|confirm|prepare|schedule|update|submit|complete|fill|sign|approve|forward|attach|look into|handle|arrange|respond|reply|let us know|share|provide|help|fix|test|verify|look at|go through|take a look))\b/i.test(s)) return "task";
  if (/\b(can you (send|review|check|confirm|prepare|update|submit|complete|help|share|provide|look at|go through|take care of|make sure|get|find|set up|coordinate|reach out|contact|call|schedule|book|arrange|fix|test|verify))\b/i.test(s)) return "task";
  if (/\b(i need (you to|your|the|a|an|some)|we need (you to|your)|we'?re waiting (for you|on you)|waiting for you to|we'?d (like|appreciate|love) (you to|your|if you))\b/i.test(s)) return "task";

  // Follow-ups
  if (/\b(let me know|get back to (me|us)|keep (me|us) (posted|updated|informed)|update (me|us)|ping (me|us)|reach out|follow up|circle back|touch base|check back|looking forward to (your|hearing)|awaiting your|please (respond|reply|confirm|get back))\b/i.test(s)) return "followup";

  return "none";
}


// ------------------------------------------------------------
//  BUILDERS — extract clean, human-readable items
// ------------------------------------------------------------
function buildTask(s, lower) {
  // Clean up the task text to be action-focused
  var text = s
    .replace(/^(please|kindly)\s+/i, "")
    .replace(/^(could you|can you|would you|will you)\s+(please\s+)?/i, "")
    .replace(/^(i need you to|we need you to|you need to|make sure to|don't forget to|remember to)\s+/i, "")
    .trim();
  // Capitalize first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return { text: text, priority: getPriority(lower) };
}

function buildDeadline(s, lower) {
  var urgent = /\b(today|tonight|asap|urgent|eod|end of day|immediately|right away)\b/i.test(s);
  // Try to extract the "when" part
  var when = "";
  var whenMatch = s.match(/\b(by|due|before|no later than)\s+([^,.]+)/i);
  if (whenMatch) when = whenMatch[2].trim();
  return { text: s, when: when, urgent: urgent };
}

function buildQuestion(s) {
  // Generate smart suggested replies based on question type
  var lower = s.toLowerCase();
  var replies = ["Yes", "No"];
  if (/\bwhen\b/i.test(s))                                      replies = ["Tomorrow", "Next week", "I'll confirm soon"];
  else if (/\b(join|attend|come|be there|make it)\b/i.test(s))  replies = ["Yes, I'll be there", "No, I can't make it", "I'll try"];
  else if (/\b(send|share|provide|attach)\b/i.test(s))          replies = ["Yes, sending now", "Yes, will do", "I need more time"];
  else if (/\b(review|check|look at|go through)\b/i.test(s))    replies = ["Yes, I'll review it", "Done, reviewed", "Give me a day"];
  else if (/\b(available|free|open)\b/i.test(s))                replies = ["Yes, I'm available", "No, I'm busy", "Let me check"];
  else if (/\b(agree|okay|ok|fine|good)\b/i.test(s))            replies = ["Yes, agreed", "No, let's discuss", "Mostly yes"];
  return { text: s, suggestedReplies: replies };
}

function buildSummary(subject, from, tasks, deadlines, questions) {
  var fromName = from.replace(/<.*>/, "").replace(/"/g, "").trim();
  var parts = [];
  if (tasks.length > 0)     parts.push(tasks.length + " task" + (tasks.length > 1 ? "s" : "") + " for you");
  if (deadlines.length > 0) parts.push(deadlines.length + " deadline" + (deadlines.length > 1 ? "s" : ""));
  if (questions.length > 0) parts.push(questions.length + " question" + (questions.length > 1 ? "s" : "") + " to answer");
  if (parts.length === 0)   return "Email from " + fromName + " — no action needed.";
  return "Email from " + fromName + " with " + parts.join(", ") + ".";
}

function getPriority(lower) {
  if (/\b(urgent|asap|immediately|critical|today|eod|right away|emergency)\b/.test(lower)) return "high";
  if (/\b(tomorrow|this week|soon|please|important)\b/.test(lower)) return "medium";
  return "low";
}

function getSentiment(lower) {
  if (/\b(urgent|asap|immediately|critical|emergency|must|required|mandatory)\b/.test(lower)) return "urgent";
  if (/\b(thank|great|well done|excellent|good job|appreciate|happy|pleased|congrats|congratulations)\b/.test(lower)) return "positive";
  if (/\b(disappointed|frustrated|issue|problem|concern|complaint|wrong|failed|mistake|error)\b/.test(lower)) return "negative";
  return "neutral";
}

function splitIntoSentences(text) {
  // Split on sentence boundaries but keep context
  var lines = text.split("\n");
  var sentences = [];
  lines.forEach(function(line) {
    line = line.trim();
    if (!line) return;
    // Split long lines on sentence boundaries
    var parts = line.split(/(?<=[.!?])\s+(?=[A-Z])/);
    parts.forEach(function(p) { if (p.trim()) sentences.push(p.trim()); });
  });
  return sentences;
}

function dedup(arr) {
  var seen = {};
  return arr.filter(function(item) {
    var key = item.toLowerCase().slice(0, 40);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}


// ------------------------------------------------------------
//  CARD BUILDER
// ------------------------------------------------------------
function buildResultCard(data) {
  var card     = CardService.newCardBuilder();
  var fromName = data.from.replace(/<.*>/, "").replace(/"/g, "").trim() || data.from;
  var sentimentIcon = { urgent: "🔴", positive: "🟢", negative: "🟠", neutral: "🔵" }[data.sentiment] || "🔵";

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ " + (data.subject || "Action Extractor"))
      .setSubtitle("From: " + fromName)
  );

  // Summary + quick actions
  var summarySection = CardService.newCardSection().setHeader(sentimentIcon + " Summary");
  summarySection.addWidget(CardService.newTextParagraph().setText(data.summary));

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
          deadlines: JSON.stringify((data.deadlines||[]).map(function(d){ return d.text + (d.when ? " — " + d.when : ""); })),
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
          .setText(icon + task.text).setWrapText(true)
          .setButton(CardService.newTextButton().setText("📅 Add")
            .setOnClickAction(CardService.newAction().setFunctionName("onAddToCalendar")
              .setParameters({ text: task.text.slice(0, 100) })))
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
          .setText(label).setWrapText(true)
          .setButton(CardService.newTextButton().setText("Calendar")
            .setOnClickAction(CardService.newAction().setFunctionName("onAddToCalendar")
              .setParameters({ text: (dl.text + (dl.when ? " by " + dl.when : "")).slice(0, 100) })))
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
        CardService.newDecoratedText().setText(fu).setWrapText(true)
          .setButton(CardService.newTextButton().setText("Remind me")
            .setOnClickAction(CardService.newAction().setFunctionName("onSetReminder")
              .setParameters({ text: fu.slice(0, 100) })))
      );
    });
    card.addSection(fuSection);
  }

  // Empty state
  if ((!data.tasks||!data.tasks.length) && (!data.deadlines||!data.deadlines.length) &&
      (!data.questions||!data.questions.length) && (!data.important||!data.important.length)) {
    card.addSection(CardService.newCardSection().addWidget(
      CardService.newTextParagraph().setText("✅ No action items — this email is just FYI.")
    ));
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
      .setOpenAs(CardService.OpenAs.OVERLAY).setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onQuickReply(e) {
  var subject = e.parameters.subject || "";
  var re = /^re:/i.test(subject) ? subject : "Re: " + subject;
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(e.parameters.from) + "&su=" + encodeURIComponent(re))
      .setOpenAs(CardService.OpenAs.OVERLAY).setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onSendReply(e) {
  var subject = e.parameters.subject || "";
  var re = /^re:/i.test(subject) ? subject : "Re: " + subject;
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(e.parameters.from) + "&su=" + encodeURIComponent(re) + "&body=" + encodeURIComponent(e.parameters.replyText))
      .setOpenAs(CardService.OpenAs.OVERLAY).setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onScheduleMeeting(e) {
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://calendar.google.com/calendar/r/eventedit?text=" + encodeURIComponent("Meeting: " + e.parameters.subject) + "&add=" + encodeURIComponent(e.parameters.from))
      .setOpenAs(CardService.OpenAs.OVERLAY).setOnClose(CardService.OnClose.NOTHING))
    .build();
}

function onSetReminder(e) {
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink()
      .setUrl("https://calendar.google.com/calendar/r/eventedit?text=" + encodeURIComponent("🔔 Follow up: " + e.parameters.text))
      .setOpenAs(CardService.OpenAs.OVERLAY).setOnClose(CardService.OnClose.NOTHING))
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
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(text)));
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}


// ------------------------------------------------------------
//  TEST
// ------------------------------------------------------------
function testExtraction() {
  var body = [
    "Hi Yosef,",
    "",
    "Hope you're well. I wanted to follow up on a few things.",
    "",
    "Can you send the final design files by Friday EOD? The client is waiting and this is urgent.",
    "Please also review the attached proposal before our call — it needs to be submitted no later than Thursday.",
    "Are you joining the kickoff call Thursday at 3pm? Let me know so I can send the calendar invite.",
    "Also, would you be able to prepare the Q3 budget summary? We need it by end of next week.",
    "",
    "Let me know if you have any questions.",
    "",
    "Best,",
    "Sarah"
  ].join("\n");

  var result = analyzeEmail("Q3 updates and action items", "Sarah Chen <sarah@acme.com>", body);
  Logger.log(JSON.stringify(result, null, 2));
}