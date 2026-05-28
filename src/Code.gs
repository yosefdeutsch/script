// ── CONFIG ─────────────────────────────────────────────────────────────────
const RENDER_URL   = "https://youtube-downloader-bot-7bim.onrender.com";
const API_SECRET   = "mybotdownloader123";
const DRIVE_FOLDER = "1uyvFqXejRjamnKFGKMGT1lhYqvDO9Acb";
// ──────────────────────────────────────────────────────────────────────────

function buildAddOn(e) {
  return buildCard("", "", null, "", "best", false);
}

function buildCard(url, statusMsg, jobId, customName, quality, splitVideo) {
  var card    = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("🎬 Video Downloader");

  var urlInput = CardService.newTextInput()
    .setFieldName("video_url")
    .setTitle("Paste video link")
    .setHint("YouTube, m3u8, Cisco NetAcad, etc.")
    .setValue(url || "");

  // Cookies right below URL
  var cookiesInput = CardService.newTextInput()
    .setFieldName("cookies_file_id")
    .setTitle("Cookies file ID in Drive (optional)")
    .setHint("For protected sites like Cisco NetAcad or YouTube");

  var nameInput = CardService.newTextInput()
    .setFieldName("custom_name")
    .setTitle("File name (optional)")
    .setHint("Leave empty to use original title")
    .setValue(customName || "");

  var qualitySelect = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Quality")
    .setFieldName("quality")
    .addItem("🏆 Best available",  "best", (quality || "best") === "best")
    .addItem("📺 1080p",           "1080", quality === "1080")
    .addItem("📺 720p",            "720",  quality === "720")
    .addItem("📺 480p",            "480",  quality === "480")
    .addItem("📺 360p (smallest)", "360",  quality === "360");

  var splitSwitch = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.CHECK_BOX)
    .setFieldName("split_video")
    .addItem("✂️ Split into parts if file is large (every 45MB)", "yes", splitVideo === "yes");

  var downloadBtn = CardService.newTextButton()
    .setText("⬇️ Download Video")
    .setOnClickAction(CardService.newAction().setFunctionName("onDownloadClick"));

  var statusSection = CardService.newCardSection().setHeader("📊 Status");
  var statusText    = CardService.newTextParagraph().setText(statusMsg || "No job running yet.");

  // Order: URL → Cookies → File name → Quality → Split → Button
  section.addWidget(urlInput);
  section.addWidget(cookiesInput);
  section.addWidget(nameInput);
  section.addWidget(qualitySelect);
  section.addWidget(splitSwitch);
  section.addWidget(downloadBtn);
  statusSection.addWidget(statusText);

  if (jobId) {
    var checkBtn = CardService.newTextButton()
      .setText("🔄 Check Status & Save to Drive")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onCheckStatus")
          .setParameters({ job_id: jobId, custom_name: customName || "", split_video: splitVideo || "no" })
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
  var customName    = e.formInput.custom_name ? e.formInput.custom_name.trim() : "";
  var quality       = e.formInput.quality || "best";
  var splitVideo    = (e.formInput.split_video && e.formInput.split_video.indexOf("yes") !== -1) ? "yes" : "no";
  var cookiesFileId = e.formInput.cookies_file_id ? e.formInput.cookies_file_id.trim() : "";

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
      cookies_content: cookiesContent,
      quality:         quality,
      split_video:     splitVideo
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
      var newCard = buildCard(url, "⏳ Download started! Wait then click 'Check Status & Save to Drive'.", body.job_id, customName, quality, splitVideo);
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
  var splitVideo = e.parameters.split_video || "no";

  try {
    var statusRes = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, { muteHttpExceptions: true });
    var job       = JSON.parse(statusRes.getContentText());

    if (job.status === "error") {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildCard("", "❌ " + job.message, null, "", "best", "no")))
        .build();
    }

    if (job.status !== "done") {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildCard("", "⏳ Still working: " + job.message, jobId, customName, "best", splitVideo)))
        .build();
    }

    // Get file list from server
    var filesRes  = UrlFetchApp.fetch(
      RENDER_URL + "/result_info/" + jobId + "?secret=" + encodeURIComponent(API_SECRET),
      { muteHttpExceptions: true }
    );
    var filesInfo = JSON.parse(filesRes.getContentText());
    var fileNames = filesInfo.files || [];

    var folder   = DriveApp.getFolderById(DRIVE_FOLDER);
    var savedMsg = "✅ Saved to Drive!\n\n";

    for (var i = 0; i < fileNames.length; i++) {
      var fileRes = UrlFetchApp.fetch(
        RENDER_URL + "/result_file/" + jobId + "/" + encodeURIComponent(fileNames[i]) + "?secret=" + encodeURIComponent(API_SECRET),
        { muteHttpExceptions: true }
      );

      if (fileRes.getResponseCode() === 200) {
        var blob = fileRes.getBlob();

        // Apply custom name
        var baseName;
        if (customName && fileNames.length === 1) {
          baseName = customName.replace(/\.mp4$/i, "") + ".mp4";
        } else if (customName && fileNames.length > 1) {
          baseName = customName.replace(/\.mp4$/i, "") + "_part" + (i + 1) + ".mp4";
        } else {
          baseName = fileNames[i];
        }

        blob.setName(baseName);
        var saved = folder.createFile(blob);

        // Show name + clickable Drive link
        savedMsg += "📁 " + saved.getName() + "\n🔗 " + saved.getUrl() + "\n\n";
      }
    }

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildCard("", savedMsg, null, "", "best", "no")))
      .build();

  } catch(err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Error: " + err.message))
      .build();
  }
}