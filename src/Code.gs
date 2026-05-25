// ============================================================
//  Gmail Action Extractor — No API version
//  Pure Apps Script keyword matching — works instantly
// ============================================================

function onGmailMessage(e) {
  var accessToken = e.messageMetadata.accessToken;
  var messageId   = e.messageMetadata.messageId;

  GmailApp.setCurrentMessageAccessToken(accessToken);
  var message = GmailApp.getMessageById(messageId);

  if (!message) {
    return buildErrorCard("Could not load this email.");
  }

  var body    = message.getPlainBody();
  var subject = message.getSubject();
  var from    = message.getFrom();

  var data = extractActions(body);
  return buildResultCard(data, subject, from);
}


// ------------------------------------------------------------
//  KEYWORD-BASED EXTRACTION  (no AI needed)
// ------------------------------------------------------------
function extractActions(body) {
  var sentences = body.match(/[^.!?\n]+[.!?\n]?/g) || [];

  var taskKeywords     = ["please", "can you", "could you", "would you", "need you to", "make sure", "don't forget", "send", "review", "complete", "submit", "update", "check", "confirm", "prepare", "schedule"];
  var deadlineKeywords = ["by", "due", "deadline", "eod", "end of day", "asap", "urgent", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "next week", "this week"];
  var questionMarkers  = ["?"];

  var tasks     = [];
  var deadlines = [];
  var questions = [];

  sentences.forEach(function(sentence) {
    var s = sentence.trim();
    if (!s || s.length < 10) return;

    var lower = s.toLowerCase();

    // Questions
    if (s.indexOf("?") !== -1) {
      questions.push(s.replace(/\n/g, " ").trim());
      return;
    }

    // Deadlines
    var isDeadline = deadlineKeywords.some(function(k) { return lower.indexOf(k) !== -1; });
    if (isDeadline) {
      var urgent = lower.indexOf("asap") !== -1 || lower.indexOf("urgent") !== -1 || lower.indexOf("eod") !== -1 || lower.indexOf("today") !== -1;
      deadlines.push({ text: s.replace(/\n/g, " ").trim(), urgent: urgent });
      return;
    }

    // Tasks
    var isTask = taskKeywords.some(function(k) { return lower.indexOf(k) !== -1; });
    if (isTask) {
      tasks.push(s.replace(/\n/g, " ").trim());
    }
  });

  // Trim to top 3 each
  return {
    tasks:     tasks.slice(0, 3),
    deadlines: deadlines.slice(0, 3),
    questions: questions.slice(0, 3)
  };
}


// ------------------------------------------------------------
//  CARD BUILDER
// ------------------------------------------------------------
function buildResultCard(data, subject, from) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ Action Extractor")
      .setSubtitle(subject || "Email analysis")
  );

  // Tasks
  if (data.tasks.length > 0) {
    var taskSection = CardService.newCardSection().setHeader("✅ Tasks");
    data.tasks.forEach(function(task) {
      taskSection.addWidget(
        CardService.newDecoratedText()
          .setText(task)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton()
              .setText("Add task")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onAddTask")
                  .setParameters({ taskText: task.slice(0, 100) })
              )
          )
      );
    });
    card.addSection(taskSection);
  }

  // Deadlines
  if (data.deadlines.length > 0) {
    var dlSection = CardService.newCardSection().setHeader("🗓️ Deadlines");
    data.deadlines.forEach(function(dl) {
      dlSection.addWidget(
        CardService.newDecoratedText()
          .setText((dl.urgent ? "⚠️ " : "") + dl.text)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton()
              .setText("Calendar")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onAddToCalendar")
                  .setParameters({ deadlineText: dl.text.slice(0, 100) })
              )
          )
      );
    });
    card.addSection(dlSection);
  }

  // Questions
  if (data.questions.length > 0) {
    var qSection = CardService.newCardSection().setHeader("❓ Questions");
    data.questions.forEach(function(q) {
      qSection.addWidget(
        CardService.newDecoratedText()
          .setText(q)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton()
              .setText("Reply")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onReply")
                  .setParameters({ question: q.slice(0, 100) })
              )
          )
      );
    });
    card.addSection(qSection);
  }

  // Empty state
  if (data.tasks.length === 0 && data.deadlines.length === 0 && data.questions.length === 0) {
    card.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText("No action items found in this email.")
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
function onAddTask(e) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Task noted: " + e.parameters.taskText))
    .build();
}

function onAddToCalendar(e) {
  var url = "https://calendar.google.com/calendar/r/eventedit?text=" +
    encodeURIComponent(e.parameters.deadlineText);
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink().setUrl(url))
    .build();
}

function onReply(e) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Replying to: " + e.parameters.question))
    .build();
}


// ------------------------------------------------------------
//  TEST FUNCTION
// ------------------------------------------------------------
function testExtraction() {
  var body = "Can you send the design files? The proposal is due Friday EOD. Are you joining the kickoff call Thursday at 3pm? Please review the brief before we proceed.";
  var result = extractActions(body);
  Logger.log(JSON.stringify(result, null, 2));
}