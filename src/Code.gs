// ── CONFIG ─────────────────────────────────────────────────────────────────
const RENDER_URL   = "https://video-downloader-bot-b040.onrender.com";
const API_SECRET   = "mybotdownloader123";
const DRIVE_FOLDER = "1D8f6_l6M1TJdeGhsy81zjcEMwGHpJZaA";
// ──────────────────────────────────────────────────────────────────────────

function buildAddOn(e) {
  return buildCard("", "", null);
}

function buildCard(url, statusMsg, jobId) {
  var card    = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("🎬 Video Downloader");

  var urlInput = CardService.newTextInput()
    .setFieldName("video_url")
    .setTitle("Paste video link")
    .setHint("YouTube, m3u8, Cisco NetAcad, etc.")
    .setValue(url || "");

  var cookiesInput = CardService.newTextInput()
    .setFieldName("cookies_file_id")
    .setTitle("Cookies file ID in Drive (optional)")
    .setHint("For protected sites like Cisco NetAcad");

  var downloadBtn = CardService.newTextButton()
    .setText("⬇️ Download Video")
    .setOnClickAction(CardService.newAction().setFunctionName("onDownloadClick"));

  var statusSection = CardService.newCardSection().setHeader("📊 Status");
  var statusText    = CardService.newTextParagraph().setText(statusMsg || "No job running yet.");

  section.addWidget(urlInput);
  section.addWidget(cookiesInput);
  section.addWidget(downloadBtn);
  statusSection.addWidget(statusText);

  if (jobId) {
    var checkBtn = CardService.newTextButton()
      .setText("🔄 Check Status & Save to Drive")
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

// ── Download button ────────────────────────────────────────────────────────
function onDownloadClick(e) {
  var url           = e.formInput.video_url.trim();
  var cookiesFileId = e.formInput.cookies_file_id
                    ? e.formInput.cookies_file_id.trim() : "";
  if (!url) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("⚠️ Please paste a video URL first."))
      .build();
  }

  // If cookies file ID provided, read the file content from Drive
  var cookiesContent = "";
  if (cookiesFileId) {
    try {
      cookiesContent = DriveApp.getFileById(cookiesFileId).getBlob().getDataAsString();
    } catch(err) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ Could not read cookies file: " + err.message))
        .build();
    }
  }

  try {
    var payload = {
      url:             url,
      secret:          API_SECRET,
      cookies_content: cookiesContent
    };

    var response = UrlFetchApp.fetch(RENDER_URL + "/download", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code === 202) {
      var newCard = buildCard(url, "⏳ Download started! Wait ~1 min then click 'Check Status & Save to Drive'.", body.job_id);
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(newCard))
        .build();
    } else {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ Error: " + (body.error || "Unknown")))
        .build();
    }
  } catch(err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Failed to reach server: " + err.message))
      .build();
  }
}

// ── Check Status & Save ────────────────────────────────────────────────────
function onCheckStatus(e) {
  var jobId = e.parameters.job_id;

  try {
    // 1. Check status
    var statusRes = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, {
      muteHttpExceptions: true
    });
    var job = JSON.parse(statusRes.getContentText());

    if (job.status === "error") {
      var newCard = buildCard("", "❌ " + job.message, null);
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(newCard))
        .build();
    }

    if (job.status !== "done") {
      var newCard = buildCard("", "⏳ Still working: " + job.message, jobId);
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(newCard))
        .build();
    }

    // 2. Fetch the video file from Render
    var fileRes = UrlFetchApp.fetch(
      RENDER_URL + "/result/" + jobId + "?secret=" + encodeURIComponent(API_SECRET),
      { muteHttpExceptions: true }
    );

    if (fileRes.getResponseCode() !== 200) {
      var newCard = buildCard("", "❌ Could not fetch file from server.", null);
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(newCard))
        .build();
    }

    // 3. Save to Drive
    var blob     = fileRes.getBlob();
    var fileName = blob.getName() || ("video_" + jobId + ".mp4");
    blob.setName(fileName);

    var folder = DriveApp.getFolderById(DRIVE_FOLDER);
    var saved  = folder.createFile(blob);

    var newCard = buildCard("", "✅ Saved to Drive!\n📁 " + saved.getName() + "\n🔗 " + saved.getUrl(), null);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(newCard))
      .build();

  } catch(err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Error: " + err.message))
      .build();
  }
}