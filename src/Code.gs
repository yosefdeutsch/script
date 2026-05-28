// ── CONFIG ─────────────────────────────────────────────────────────────────
const RENDER_URL   = "https://youtube-downloader-bot-7bim.onrender.com";
const API_SECRET   = "mybotdownloader123";
const DRIVE_FOLDER = "1uyvFqXejRjamnKFGKMGT1lhYqvDO9Acb";
// ──────────────────────────────────────────────────────────────────────────

function buildAddOn(e) {
  return buildCard("", "", null, "");
}

function buildCard(url, statusMsg, jobId, customName) {
  var card    = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("🎬 Video Downloader");

  var urlInput = CardService.newTextInput()
    .setFieldName("video_url")
    .setTitle("Paste video link")
    .setHint("YouTube, m3u8, Cisco NetAcad, etc.")
    .setValue(url || "");

  var nameInput = CardService.newTextInput()
    .setFieldName("custom_name")
    .setTitle("File name (optional)")
    .setHint("Leave empty to use original title.")
    .setValue(customName || "");

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
  section.addWidget(nameInput);
  section.addWidget(cookiesInput);
  section.addWidget(downloadBtn);
  statusSection.addWidget(statusText);

  if (jobId) {
    var checkBtn = CardService.newTextButton()
      .setText("🔄 Check Status & Save to Drive")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onCheckStatus")
          .setParameters({ job_id: jobId, custom_name: customName || "" })
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
  var customName    = e.formInput.custom_name
                    ? e.formInput.custom_name.trim() : "";
  var cookiesFileId = e.formInput.cookies_file_id
                    ? e.formInput.cookies_file_id.trim() : "";

  if (!url) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("⚠️ Please paste a video URL first."))
      .build();
  }

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
      var newCard = buildCard(url, "⏳ Download started! Wait ~1 min then click 'Check Status & Save to Drive'.", body.job_id, customName);
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
  var jobId      = e.parameters.job_id;
  var customName = e.parameters.custom_name || "";

  try {
    var statusRes = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, {
      muteHttpExceptions: true
    });
    var job = JSON.parse(statusRes.getContentText());

    if (job.status === "error") {
      var newCard = buildCard("", "❌ " + job.message, null, "");
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(newCard))
        .build();
    }

    if (job.status !== "done") {
      var newCard = buildCard("", "⏳ Still working: " + job.message, jobId, customName);
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(newCard))
        .build();
    }

    var fileRes = UrlFetchApp.fetch(
      RENDER_URL + "/result/" + jobId + "?secret=" + encodeURIComponent(API_SECRET),
      { muteHttpExceptions: true }
    );

    if (fileRes.getResponseCode() !== 200) {
      var newCard = buildCard("", "❌ Could not fetch file from server.", null, "");
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(newCard))
        .build();
    }

    var blob = fileRes.getBlob();

    // Apply custom name if provided, always ensure .mp4 extension
    if (customName) {
      var finalName = customName.replace(/\.mp4$/i, "") + ".mp4";
    } else {
      var finalName = blob.getName() || ("video_" + jobId + ".mp4");
      if (!finalName.endsWith(".mp4")) finalName = finalName.replace(/\.[^.]+$/, "") + ".mp4";
    }
    blob.setName(finalName);

    var folder = DriveApp.getFolderById(DRIVE_FOLDER);
    var saved  = folder.createFile(blob);

    var newCard = buildCard("", "✅ Saved to Drive!\n📁 " + saved.getName() + "\n🔗 " + saved.getUrl(), null, "");
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(newCard))
      .build();

  } catch(err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Error: " + err.message))
      .build();
  }
}
function checkFormats() {
  var cookiesFileId = "13eXZwiZVHG0I1aa-ph4uyRTrtkBEyCVn";
  var cookiesContent = DriveApp.getFileById(cookiesFileId).getBlob().getDataAsString();
  
  var response = UrlFetchApp.fetch(RENDER_URL + "/formats", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      secret: API_SECRET,
      url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      cookies_content: cookiesContent
    })
  });
  Logger.log(response.getContentText());
}