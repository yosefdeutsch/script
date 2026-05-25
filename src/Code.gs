// ============================================================
//  Gmail Action Extractor — Code.gs
//  Powered by Gemini API (FREE — 1,500 requests/day)
// ============================================================

// ▸ STEP 1: Get your FREE key at https://aistudio.google.com/apikey
//   No credit card required. Takes 30 seconds.
var GEMINI_API_KEY = "AIzaSyDpNl9Q-YDsh6Q6qEEfsHbJwc4ALR4VGkI";

var GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=";


// ------------------------------------------------------------
//  ADD-ON ENTRY POINT
//  Called by Gmail every time the user opens an email
// ------------------------------------------------------------
function onGmailMessage(e) {
  var accessToken = e.messageMetadata.accessToken;
  var messageId   = e.messageMetadata.messageId;

  GmailApp.setCurrentMessageAccessToken(accessToken);
  var message = GmailApp.getMessageById(messageId);

  if (!message) {
    return buildErrorCard("Could not load this email.");
  }

  var emailBody    = message.getPlainBody().slice(0, 4000);
  var emailSubject = message.getSubject();
  var emailFrom    = message.getFrom();

  var extraction = extractActions(emailSubject, emailFrom, emailBody);

  if (extraction.error) {
    return buildErrorCard(extraction.error);
  }

  return buildResultCard(extraction);
}


// ------------------------------------------------------------
//  GEMINI API CALL
// ------------------------------------------------------------
function extractActions(subject, from, body) {
  var prompt = buildPrompt(subject, from, body);

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

    if (json.error) {
      return { error: "API error: " + json.error.message };
    }

    var rawText = json.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json|```/g, "").trim();

    return JSON.parse(rawText);

  } catch (err) {
    return { error: "Failed to parse response: " + err.message };
  }
}


// ------------------------------------------------------------
//  PROMPT BUILDER
// ------------------------------------------------------------
function buildPrompt(subject, from, body) {
  return [
    "You are an email analysis assistant. Analyze the email below and extract action items.",
    "Return ONLY a valid JSON object — no markdown, no explanation, no preamble.",
    "",
    "The JSON must follow this exact structure:",
    "{",
    '  "tasks": [{ "text": "short action description", "priority": "high|medium|low" }],',
    '  "deadlines": [{ "text": "what is due", "when": "human-readable date or day", "urgent": true|false }],',
    '  "questions": [{ "text": "question asked of the recipient", "suggestedReplies": ["Yes", "No"] }],',
    '  "summary": "one sentence summary of the email"',
    "}",
    "",
    "Rules:",
    "- tasks: things the recipient is asked to DO",
    "- deadlines: explicit or implied time constraints",
    "- questions: direct questions requiring a reply",
    "- suggestedReplies: 2-3 short sensible options",
    "- Empty category = empty array []",
    "- Max 10 words per item",
    "",
    "--- EMAIL ---",
    "From: " + from,
    "Subject: " + subject,
    "",
    body
  ].join("\n");
}


// ------------------------------------------------------------
//  CARD BUILDERS
// ------------------------------------------------------------
function buildResultCard(data) {
  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("⚡ Action Extractor")
      .setSubtitle(data.summary || "Analysis complete")
  );

  // Tasks
  if (data.tasks && data.tasks.length > 0) {
    var taskSection = CardService.newCardSection().setHeader("✅ Tasks");
    data.tasks.forEach(function(task) {
      var icon = task.priority === "high" ? "🔴 " : task.priority === "medium" ? "🟡 " : "🟢 ";
      taskSection.addWidget(
        CardService.newDecoratedText()
          .setText(icon + task.text)
          .setButton(
            CardService.newTextButton()
              .setText("Add task")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onAddTask")
                  .setParameters({ taskText: task.text })
              )
          )
      );
    });
    card.addSection(taskSection);
  }

  // Deadlines
  if (data.deadlines && data.deadlines.length > 0) {
    var dlSection = CardService.newCardSection().setHeader("🗓️ Deadlines");
    data.deadlines.forEach(function(dl) {
      dlSection.addWidget(
        CardService.newDecoratedText()
          .setText((dl.urgent ? "⚠️ " : "") + dl.text + " — " + dl.when)
          .setButton(
            CardService.newTextButton()
              .setText("Add to calendar")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onAddToCalendar")
                  .setParameters({ deadlineText: dl.text, deadlineWhen: dl.when })
              )
          )
      );
    });
    card.addSection(dlSection);
  }

  // Questions
  if (data.questions && data.questions.length > 0) {
    var qSection = CardService.newCardSection().setHeader("❓ Questions for you");
    data.questions.forEach(function(q) {
      qSection.addWidget(CardService.newTextParagraph().setText(q.text));
      if (q.suggestedReplies && q.suggestedReplies.length > 0) {
        var btnSet = CardService.newButtonSet();
        q.suggestedReplies.forEach(function(reply) {
          btnSet.addButton(
            CardService.newTextButton()
              .setText(reply)
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onQuickReply")
                  .setParameters({ replyText: reply, question: q.text })
              )
          );
        });
        qSection.addWidget(btnSet);
      }
    });
    card.addSection(qSection);
  }

  // Empty state
  if (
    (!data.tasks || data.tasks.length === 0) &&
    (!data.deadlines || data.deadlines.length === 0) &&
    (!data.questions || data.questions.length === 0)
  ) {
    card.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText("No action items found in this email.")
      )
    );
  }

  return card.build();
}

function buildErrorCard(message) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("⚡ Action Extractor"))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText("⚠️ " + message)
      )
    )
    .build();
}


// ------------------------------------------------------------
//  ACTION HANDLERS
// ------------------------------------------------------------
function onAddTask(e) {
  var taskText = e.parameters.taskText;
  try {
    Tasks.Tasks.insert({ title: taskText, notes: "Added by Action Extractor" }, "@default");
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("✅ Task added: " + taskText))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Enable Tasks API in Services first."))
      .build();
  }
}

function onAddToCalendar(e) {
  var calUrl = "https://calendar.google.com/calendar/r/eventedit?text=" +
    encodeURIComponent(e.parameters.deadlineText) +
    "&details=" + encodeURIComponent("Deadline: " + e.parameters.deadlineWhen);
  return CardService.newActionResponseBuilder()
    .setOpenLink(CardService.newOpenLink().setUrl(calUrl))
    .build();
}

function onQuickReply(e) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Reply: " + e.parameters.replyText))
    .build();
}


// ------------------------------------------------------------
//  TEST FUNCTION — run this first to verify everything works
// ------------------------------------------------------------
function testExtraction() {
  var result = extractActions(
    "Q3 campaign updates",
    "sarah@example.com",
    "Can you send the design files? The proposal is due Friday EOD. Are you joining the kickoff call Thursday at 3pm?"
  );
  Logger.log(JSON.stringify(result, null, 2));
}
function requestAuth() {
  var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  Logger.log(authInfo.getAuthorizationUrl());
}