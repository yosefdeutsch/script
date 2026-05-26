// ============================================================
//  Gmail Action Extractor — Ultimate Smart Edition
//  No API. No limits. Works forever.
// ============================================================


// ------------------------------------------------------------
//  HOMEPAGE
// ------------------------------------------------------------
function onGmailHomepage(e) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ Action Extractor")
      .setSubtitle("Your smart email assistant")
  );

  var section = CardService.newCardSection();
  section.addWidget(CardService.newDivider());
  section.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("HOW IT WORKS")
      .setText("Open any email and I'll instantly analyze it for you.")
      .setWrapText(true)
  );
  section.addWidget(CardService.newDivider());
  section.addWidget(CardService.newDecoratedText().setTopLabel("✅  TASKS").setText("Things you need to action").setWrapText(true));
  section.addWidget(CardService.newDecoratedText().setTopLabel("⏰  DEADLINES").setText("Time-sensitive items with dates").setWrapText(true));
  section.addWidget(CardService.newDecoratedText().setTopLabel("❓  QUESTIONS").setText("What the sender is asking you").setWrapText(true));
  section.addWidget(CardService.newDecoratedText().setTopLabel("🚨  ALERTS").setText("Urgent or critical information").setWrapText(true));
  section.addWidget(CardService.newDecoratedText().setTopLabel("🔔  FOLLOW-UPS").setText("Things needing a reply or follow-up").setWrapText(true));
  section.addWidget(CardService.newDivider());
  section.addWidget(CardService.newTextParagraph().setText("100% free · No API key · Unlimited use"));
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
  var date        = message.getDate();

  var data         = analyzeEmail(subject, from, body);
  data.subject     = subject;
  data.from        = from;
  data.threadCount = threadCount;
  data.wordCount   = body.split(/\s+/).filter(Boolean).length;
  data.date        = date ? Utilities.formatDate(date, Session.getScriptTimeZone(), "MMM d · h:mm a") : "";

  return buildResultCard(data);
}


// ============================================================
//  SMART ANALYSIS ENGINE
// ============================================================
function analyzeEmail(subject, from, body) {

  var sentences = extractSentences(body);
  var tasks = [], deadlines = [], questions = [], important = [], followUps = [];

  sentences.forEach(function(s) {
    var lower = s.toLowerCase();
    if (shouldSkip(s, lower)) return;

    var intent = classifyIntent(s, lower);
    switch(intent) {
      case "question":  questions.push(buildQuestion(s, lower));  break;
      case "urgent":    important.push(s);                        break;
      case "deadline":  deadlines.push(buildDeadline(s, lower));  break;
      case "task":      tasks.push(buildTask(s, lower));          break;
      case "followup":  followUps.push(s);                        break;
    }
  });

  // Deduplicate and clean
  tasks     = dedupObjects(tasks, "text").slice(0, 5);
  deadlines = dedupObjects(deadlines, "text").slice(0, 4);
  questions = dedupObjects(questions, "text").slice(0, 5);
  important = dedup(important).slice(0, 3);
  followUps = dedup(followUps).slice(0, 3);

  var sentiment = getSentiment(body.toLowerCase());
  var totalItems = tasks.length + deadlines.length + questions.length;

  return {
    tasks:     tasks,
    deadlines: deadlines,
    questions: questions,
    important: important,
    followUps: followUps,
    sentiment: sentiment,
    summary:   buildSummary(from, tasks, deadlines, questions, important, sentiment),
    totalItems: totalItems
  };
}


// ------------------------------------------------------------
//  SENTENCE EXTRACTION
//  Handles multi-line emails, quoted replies, signatures
// ------------------------------------------------------------
function extractSentences(body) {
  var sentences = [];

  // Remove quoted reply blocks (lines starting with >)
  var lines = body.split("\n").filter(function(l) {
    return !l.trim().startsWith(">");
  });

  // Remove signature (everything after "-- " or common sign-off patterns)
  var cleanLines = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (/^--\s*$/.test(line)) break;
    if (i > 3 && /^(sent from my|get outlook|on .{5,50} wrote:)/i.test(line)) break;
    cleanLines.push(line);
  }

  var text = cleanLines.join(" ").replace(/\s+/g, " ").trim();

  // Split into sentences on punctuation boundaries
  var raw = text.split(/(?<=[.!?])\s+(?=[A-Z"'])|(?<=\n)/);
  raw.forEach(function(r) {
    var s = r.trim();
    if (s.length > 10) sentences.push(s);
  });

  // Also add each original line if it looks like a bullet/list item
  cleanLines.forEach(function(line) {
    var l = line.trim();
    if (/^[-•*·]\s+/.test(l) && l.length > 10) {
      sentences.push(l.replace(/^[-•*·]\s+/, ""));
    }
  });

  return sentences;
}


// ------------------------------------------------------------
//  SKIP FILTER
//  Removes greetings, sign-offs, filler lines
// ------------------------------------------------------------
function shouldSkip(s, lower) {
  if (s.length < 12) return true;

  var skipPatterns = [
    /^(hi|hey|hello|dear|good (morning|afternoon|evening))\b/i,
    /^(hope (you('re| are)|this (email|message|finds))|i hope)/i,
    /^(thank(s| you)( so much| very much| for| again)?[.!,]?$)/i,
    /^(best( regards)?|kind regards|regards|sincerely|cheers|warm(ly)?|yours (truly|sincerely)|talk soon|speak soon|have a (great|good|wonderful))[,.]?$/i,
    /^(sent from|get outlook|unsubscribe|this (email|message) (is|was) sent|confidential|privileged|if you received this)/i,
    /^\d+\s*$/,
    /^(re:|fw:|fwd:)\s*$/i
  ];

  return skipPatterns.some(function(p) { return p.test(s); });
}


// ------------------------------------------------------------
//  INTENT CLASSIFIER
//  What is this sentence actually saying?
// ------------------------------------------------------------
function classifyIntent(s, lower) {

  // 1. QUESTIONS — direct asks requiring an answer
  if (s.indexOf("?") !== -1) return "question";
  if (/^(could you|can you|would you|will you|do you|are you|is (there|it)|have you|did you|when (can|will|are|should|do)|what (is|are|do|should|time|day)|how (do|can|should|long|many|much|are|is)|who (is|will|can|should|would)|where (is|are|can|should)|which (one|option|day|time)|why (is|are|did|do|would|can't))/i.test(s)) return "question";

  // 2. URGENT — must-know information
  if (/\b(urgent|critical|asap|emergency|immediately|right away|time[- ]sensitive|high priority|action required|action needed|must not (miss|ignore|forget)|cannot wait|do not (ignore|delete|miss))\b/i.test(s)) return "urgent";

  // 3. DEADLINES — time-bound requirements
  if (/\b(by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tonight|tomorrow|eod|end of (day|week|month|quarter)|next (week|month)|[0-9]+(st|nd|rd|th)?(\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))?|[0-9]+\/[0-9]+))\b/i.test(s)) return "deadline";
  if (/\b(due (date|by|on|this|next)|deadline (is|on|by)|no later than|must be (submitted|completed|sent|done|ready|in|received)|needs? to be (in|done|submitted|ready|completed) by|expected (by|on)|deliver(ed)? by|submit(ted)? by|complete(d)? by)\b/i.test(s)) return "deadline";

  // 4. TASKS — things the recipient must do
  // Direct requests
  if (/^(please|kindly)\s+\w/i.test(s)) return "task";
  if (/^(could you|can you|would you|will you|i need you to|we need you to|i('d| would) (like|appreciate|love) (you to|if you))\s+/i.test(s)) return "task";
  // Embedded requests
  if (/\b(please (send|review|check|confirm|prepare|schedule|update|submit|complete|fill (in|out)|sign|approve|forward|attach|look into|handle|arrange|respond|reply|let (me|us) know|share|provide|help|fix|test|verify|go through|take a look|get back|reach out|contact|call|book|coordinate|set up|make sure|ensure|follow up on))\b/i.test(s)) return "task";
  if (/\b(need(s)? (you to|your|the|a|an)|we'?re (waiting|counting) (for you|on you)|waiting for you to|i'?m (asking|requesting) (you to|that you)|you (need to|should|must|have to|are (asked|required) to))\b/i.test(s)) return "task";
  if (/\b(make sure (you|to|that)|ensure (you|that|the)|don'?t forget to|remember to|it'?s (important|necessary|required) (for you |that you)?to)\b/i.test(s)) return "task";

  // 5. FOLLOW-UPS — things needing a response or continuation
  if (/\b(let me know|get back to (me|us)|keep (me|us) (posted|updated|informed|in the loop)|update (me|us) (on|about|when|once)|ping (me|us)|reach out (to me|if)|follow[- ]up|circle back|touch base|check back|looking forward to (your (reply|response|feedback|update|answer|thoughts|input)|hearing from you)|awaiting (your (reply|response|confirmation))|please (respond|reply|confirm|get back to me|send me)|your (thoughts|feedback|input|response|reply) (on|about|would be)?)\b/i.test(s)) return "followup";

  return "none";
}


// ------------------------------------------------------------
//  ITEM BUILDERS
// ------------------------------------------------------------
function buildTask(s, lower) {
  // Strip the request preamble to get the clean action
  var text = s
    .replace(/^(please|kindly)\s+/i, "")
    .replace(/^(could you|can you|would you|will you)\s+(please\s+)?/i, "")
    .replace(/^(i need you to|we need you to|i would like you to|i'd like you to|i'd appreciate if you could|we'd like you to)\s+/i, "")
    .replace(/^(make sure (you |to )|don't forget to|remember to|ensure (you |that ))/i, "")
    .trim();
  text = capitalize(text);
  return { text: text, priority: getPriority(lower) };
}

function buildDeadline(s, lower) {
  var urgent = /\b(today|tonight|asap|urgent|eod|end of day|immediately|right away|as soon as possible)\b/i.test(s);
  var when = "";
  var m = s.match(/\b(by|due|before|no later than|on)\s+([^,.(]+)/i);
  if (m) when = m[2].trim().replace(/\s+/g, " ");
  return { text: s, when: when, urgent: urgent };
}

function buildQuestion(s, lower) {
  var replies = ["Yes", "No"];
  if (/\b(when|what time|what day|which day)\b/i.test(s))              replies = ["Tomorrow", "Next week", "I'll confirm"];
  else if (/\b(join|attend|come|be there|make it|available)\b/i.test(s)) replies = ["Yes, I'll be there", "No, I can't", "I'll try"];
  else if (/\b(send|share|provide|attach|forward)\b/i.test(s))          replies = ["Yes, sending now", "Will do shortly", "Need more time"];
  else if (/\b(review|check|look at|go through|read)\b/i.test(s))       replies = ["Yes, I'll review it", "Done, reviewed", "Give me a day"];
  else if (/\b(agree|okay|ok|fine|good|happy with|work for you)\b/i.test(s)) replies = ["Yes, agreed", "No, let's discuss", "Mostly yes"];
  else if (/\b(help|assist|support)\b/i.test(s))                        replies = ["Yes, happy to help", "I'll try", "Can we discuss?"];
  else if (/\b(know|heard|seen|aware)\b/i.test(s))                      replies = ["Yes, I know", "No, I wasn't aware", "Let me check"];
  return { text: s, suggestedReplies: replies };
}

function buildSummary(from, tasks, deadlines, questions, important, sentiment) {
  var fromName = from.replace(/<.*>/, "").replace(/"/g, "").trim();
  var parts = [];
  if (important.length > 0)  parts.push("🚨 urgent alert");
  if (tasks.length > 0)      parts.push(tasks.length + " task" + (tasks.length > 1 ? "s" : "") + " for you");
  if (deadlines.length > 0)  parts.push(deadlines.length + " deadline" + (deadlines.length > 1 ? "s" : ""));
  if (questions.length > 0)  parts.push(questions.length + " question" + (questions.length > 1 ? "s" : "") + " to answer");
  if (parts.length === 0)    return "No action needed from " + fromName + ".";
  return fromName + " · " + parts.join("  ·  ");
}

function getPriority(lower) {
  if (/\b(urgent|asap|immediately|critical|today|eod|right away|emergency|as soon as possible)\b/.test(lower)) return "high";
  if (/\b(tomorrow|this week|soon|please|important|by friday|by thursday|by wednesday|by tuesday|by monday)\b/.test(lower)) return "medium";
  return "low";
}

function getSentiment(lower) {
  if (/\b(urgent|asap|immediately|critical|emergency|must|required|mandatory|action required)\b/.test(lower)) return "urgent";
  if (/\b(thank|great|well done|excellent|good job|appreciate|happy|pleased|congrats|congratulations|love the|amazing)\b/.test(lower)) return "positive";
  if (/\b(disappointed|frustrated|issue|problem|concern|complaint|wrong|failed|mistake|error|unfortunately|regret)\b/.test(lower)) return "negative";
  return "neutral";
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dedup(arr) {
  var seen = {};
  return arr.filter(function(item) {
    var key = item.toLowerCase().slice(0, 50);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function dedupObjects(arr, key) {
  var seen = {};
  return arr.filter(function(item) {
    var k = (item[key] || "").toLowerCase().slice(0, 50);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}


// ============================================================
//  CARD BUILDER — Best possible UI within Gmail Card Service
// ============================================================
function buildResultCard(data) {
  var card     = CardService.newCardBuilder();
  var fromName = data.from.replace(/<.*>/, "").replace(/"/g, "").trim() || data.from;

  var sentimentMap = { urgent: "🔴", positive: "🟢", negative: "🟠", neutral: "🔵" };
  var sentimentLabel = { urgent: "Urgent", positive: "Positive", neutral: "Neutral", negative: "Needs attention" };
  var icon  = sentimentMap[data.sentiment]  || "🔵";
  var label = sentimentLabel[data.sentiment] || "Neutral";

  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ " + (data.subject || "Action Extractor"))
      .setSubtitle(fromName + "  ·  " + (data.date || ""))
  );

  // ── Overview strip ──
  var overviewSection = CardService.newCardSection();
  overviewSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel(icon + "  " + label.toUpperCase() + "   ·   " + data.wordCount + " WORDS   ·   " + data.threadCount + (data.threadCount > 1 ? " MESSAGES" : " MESSAGE"))
      .setText(data.summary)
      .setWrapText(true)
  );

  // Quick action buttons
  var qBtns = CardService.newButtonSet();
  qBtns.addButton(CardService.newTextButton().setText("✉️  Reply")
    .setOnClickAction(CardService.newAction().setFunctionName("onQuickReply")
      .setParameters({ from: data.from, subject: data.subject || "" })));
  qBtns.addButton(CardService.newTextButton().setText("🗓️  Meeting")
    .setOnClickAction(CardService.newAction().setFunctionName("onScheduleMeeting")
      .setParameters({ from: data.from, subject: data.subject || "" })));
  qBtns.addButton(CardService.newTextButton().setText("📋  All")
    .setOnClickAction(CardService.newAction().setFunctionName("onShowSummary")
      .setParameters({
        tasks:     JSON.stringify((data.tasks||[]).map(function(t){ return t.text; })),
        deadlines: JSON.stringify((data.deadlines||[]).map(function(d){ return d.text + (d.when ? "  —  " + d.when : ""); })),
        questions: JSON.stringify((data.questions||[]).map(function(q){ return q.text; })),
        followUps: JSON.stringify(data.followUps||[])
      })));
  overviewSection.addWidget(qBtns);
  card.addSection(overviewSection);

  // ── Important / Urgent ──
  if (data.important && data.important.length > 0) {
    var impSection = CardService.newCardSection().setHeader("🚨  IMPORTANT");
    impSection.setCollapsible(false);
    data.important.forEach(function(item) {
      impSection.addWidget(
        CardService.newDecoratedText().setText(item).setWrapText(true)
      );
    });
    card.addSection(impSection);
  }

  // ── Tasks ──
  if (data.tasks && data.tasks.length > 0) {
    var taskSection = CardService.newCardSection().setHeader("✅  WHAT YOU NEED TO DO");
    data.tasks.forEach(function(task) {
      var priorityDot = task.priority === "high" ? "🔴  " : task.priority === "medium" ? "🟡  " : "🟢  ";
      taskSection.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(task.priority.toUpperCase() + " PRIORITY")
          .setText(priorityDot + task.text)
          .setWrapText(true)
          .setButton(CardService.newTextButton().setText("Add to calendar")
            .setOnClickAction(CardService.newAction().setFunctionName("onAddToCalendar")
              .setParameters({ text: task.text.slice(0, 100) })))
      );
    });
    card.addSection(taskSection);
  }

  // ── Deadlines ──
  if (data.deadlines && data.deadlines.length > 0) {
    var dlSection = CardService.newCardSection().setHeader("⏰  DEADLINES");
    data.deadlines.forEach(function(dl) {
      dlSection.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(dl.when ? "DUE: " + dl.when.toUpperCase() : "DEADLINE")
          .setText((dl.urgent ? "⚠️  " : "📆  ") + dl.text)
          .setWrapText(true)
          .setButton(CardService.newTextButton().setText("Add to calendar")
            .setOnClickAction(CardService.newAction().setFunctionName("onAddToCalendar")
              .setParameters({ text: (dl.text + (dl.when ? " — due " + dl.when : "")).slice(0, 100) })))
      );
    });
    card.addSection(dlSection);
  }

  // ── Questions ──
  if (data.questions && data.questions.length > 0) {
    var qSection = CardService.newCardSection().setHeader("❓  QUESTIONS FOR YOU");
    data.questions.forEach(function(q, i) {
      qSection.addWidget(
        CardService.newDecoratedText()
          .setTopLabel("QUESTION " + (i + 1))
          .setText(q.text)
          .setWrapText(true)
      );
      var btnSet = CardService.newButtonSet();
      (q.suggestedReplies || ["Yes", "No"]).forEach(function(reply) {
        btnSet.addButton(CardService.newTextButton().setText(reply)
          .setOnClickAction(CardService.newAction().setFunctionName("onSendReply")
            .setParameters({ from: data.from, subject: data.subject || "", replyText: reply })));
      });
      btnSet.addButton(CardService.newTextButton().setText("✏️")
        .setOnClickAction(CardService.newAction().setFunctionName("onQuickReply")
          .setParameters({ from: data.from, subject: data.subject || "" })));
      qSection.addWidget(btnSet);
    });
    card.addSection(qSection);
  }

  // ── Follow-ups ──
  if (data.followUps && data.followUps.length > 0) {
    var fuSection = CardService.newCardSection().setHeader("🔔  FOLLOW-UPS");
    data.followUps.forEach(function(fu) {
      fuSection.addWidget(
        CardService.newDecoratedText()
          .setText(fu).setWrapText(true)
          .setButton(CardService.newTextButton().setText("Remind me")
            .setOnClickAction(CardService.newAction().setFunctionName("onSetReminder")
              .setParameters({ text: fu.slice(0, 100) })))
      );
    });
    card.addSection(fuSection);
  }

  // ── Empty state ──
  if ((!data.tasks||!data.tasks.length) && (!data.deadlines||!data.deadlines.length) &&
      (!data.questions||!data.questions.length) && (!data.important||!data.important.length) &&
      (!data.followUps||!data.followUps.length)) {
    card.addSection(CardService.newCardSection().addWidget(
      CardService.newDecoratedText()
        .setTopLabel("ALL CLEAR")
        .setText("✅  No action needed — this email is just for your information.")
        .setWrapText(true)
    ));
  }

  return card.build();
}

function buildErrorCard(msg) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("⚡ Action Extractor"))
    .addSection(CardService.newCardSection().addWidget(
      CardService.newDecoratedText().setTopLabel("ERROR").setText("⚠️  " + msg).setWrapText(true)
    ))
    .build();
}


// ============================================================
//  ACTION HANDLERS
// ============================================================
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

  var section = CardService.newCardSection();
  if (tasks.length) {
    section.addWidget(CardService.newDecoratedText().setTopLabel("✅  TASKS").setText(tasks.map(function(t,i){ return (i+1)+".  "+t; }).join("\n")).setWrapText(true));
    section.addWidget(CardService.newDivider());
  }
  if (deadlines.length) {
    section.addWidget(CardService.newDecoratedText().setTopLabel("⏰  DEADLINES").setText(deadlines.map(function(t,i){ return (i+1)+".  "+t; }).join("\n")).setWrapText(true));
    section.addWidget(CardService.newDivider());
  }
  if (questions.length) {
    section.addWidget(CardService.newDecoratedText().setTopLabel("❓  QUESTIONS").setText(questions.map(function(t,i){ return (i+1)+".  "+t; }).join("\n")).setWrapText(true));
    section.addWidget(CardService.newDivider());
  }
  if (followUps.length) {
    section.addWidget(CardService.newDecoratedText().setTopLabel("🔔  FOLLOW-UPS").setText(followUps.map(function(t,i){ return (i+1)+".  "+t; }).join("\n")).setWrapText(true));
  }
  if (!tasks.length && !deadlines.length && !questions.length && !followUps.length) {
    section.addWidget(CardService.newTextParagraph().setText("No action items found."));
  }

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("📋  Full Summary"))
    .addSection(section);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}


// ============================================================
//  TEST — run this to verify before deploying
// ============================================================
function testExtraction() {
  var body = [
    "Hi Yosef,",
    "",
    "Hope you're well. Following up on a few things from our last call.",
    "",
    "Can you send the final design files by Friday EOD? The client is waiting and this is urgent.",
    "Please also review the attached proposal — it needs to be submitted no later than Thursday morning.",
    "Are you planning to join the kickoff call Thursday at 3pm? Let me know so I can send the invite.",
    "Would you be able to prepare the Q3 budget summary by end of next week?",
    "Also, I wanted to flag that the server outage last night is a critical issue we need to address immediately.",
    "",
    "Let me know if you have any questions or need anything from my side.",
    "",
    "Best,",
    "Sarah"
  ].join("\n");

  var result = analyzeEmail("Q3 updates and follow-ups", "Sarah Chen <sarah@acme.com>", body);
  Logger.log(JSON.stringify(result, null, 2));
}