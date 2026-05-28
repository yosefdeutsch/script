// ── CONFIG — fill these in ─────────────────────────────────────────────────
const RENDER_URL   = "https://video-downloader-bot-b040.onrender.com";
const API_SECRET   = "mybotdownloader123";       // same one you set on Render
const DRIVE_FOLDER = "1D8f6_l6M1TJdeGhsy81zjcEMwGHpJZaA";  // the folder ID from Step 1D
// ──────────────────────────────────────────────────────────────────────────

// Called when the add-on opens in Gmail
function buildAddOn(e) {
  return buildCard("", "", null);
}

function buildCard(url, statusMsg, jobId) {
  var card    = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("🎬 Video Downloader");

  // URL input
  var urlInput = CardService.newTextInput()
    .setFieldName("video_url")
    .setTitle("Paste video link")
    .setHint("YouTube, m3u8, Cisco NetAcad, etc.")
    .setValue(url || "");

  // Optional cookies file ID input
  var cookiesInput = CardService.newTextInput()
    .setFieldName("cookies_file_id")
    .setTitle("Cookies file ID (optional)")
    .setHint("Drive file ID of your cookies.txt (for protected sites)");

  // Download button
  var downloadBtn = CardService.newTextButton()
    .setText("⬇️ Download Video")
    .setOnClickAction(
      CardService.newAction().setFunctionName("onDownloadClick")
    );

  // Check status button (only show if we have a job)
  var statusSection = CardService.newCardSection().setHeader("📊 Status");
  var statusText = CardService.newTextParagraph()
    .setText(statusMsg || "No job running yet.");

  section.addWidget(urlInput);
  section.addWidget(cookiesInput);
  section.addWidget(downloadBtn);
  statusSection.addWidget(statusText);

  // If there's a running job, show a Check Status button
  if (jobId) {
    var checkBtn = CardService.newTextButton()
      .setText("🔄 Check Status")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onCheckStatus")
          .setParameters({ job_id: jobId })
      );
    statusSection.addWidget(checkBtn);
  }

  card.addSection(section);
  card.addSection(statusSection);
  return card.build();
}

// ── Download button clicked ────────────────────────────────────────────────
function onDownloadClick(e) {
  var url     = e.formInput.video_url.trim();
  var cookies = e.formInput.cookies_file_id
              ? e.formInput.cookies_file_id.trim()
              : "";

  if (!url) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("⚠️ Please paste a video URL first."))
      .build();
  }

  try {
    var payload = {
      url:             url,
      folder_id:       DRIVE_FOLDER,
      secret:          API_SECRET,
      cookies_file_id: cookies
    };

    var response = UrlFetchApp.fetch(RENDER_URL + "/download", {
      method:      "post",
      contentType: "application/json",
      payload:     JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code === 202) {
      var jobId = body.job_id;
      var newCard = buildCard(url, "⏳ Download started! Click 'Check Status' to see progress.", jobId);
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(newCard))
        .build();
    } else {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ Error: " + (body.error || "Unknown error")))
        .build();
    }

  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Failed to reach server: " + err.message))
      .build();
  }
}

// ── Check Status button clicked ────────────────────────────────────────────
function onCheckStatus(e) {
  var jobId = e.parameters.job_id;

  try {
    var response = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, {
      muteHttpExceptions: true
    });
    var body = JSON.parse(response.getContentText());

    var msg = "";
    if (body.status === "done") {
      msg = "✅ Done!\n";
      (body.files || []).forEach(function(f) {
        msg += "📁 " + f.name + "\n🔗 " + f.link + "\n\n";
      });
    } else if (body.status === "error") {
      msg = "❌ Error: " + body.message;
    } else {
      msg = "⏳ " + body.message;
    }

    var newCard = buildCard("", msg, body.status === "done" ? null : jobId);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(newCard))
      .build();

  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Could not check status: " + err.message))
      .build();
  }
}
function checkJobManually() {
  var jobId = "d925a1a3-b8bb-491e-81cf-75fd66c8755f";
  var response = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId);
  Logger.log(response.getContentText());
}