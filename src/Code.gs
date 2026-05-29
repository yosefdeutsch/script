// ── CONFIG ─────────────────────────────────────────────────────────────────
const RENDER_URL   = "https://youtube-downloader-bot-7bim.onrender.com";
const API_SECRET   = "mybotdownloader123";
const DRIVE_FOLDER = "1uyvFqXejRjamnKFGKMGT1lhYqvDO9Acb";
// ──────────────────────────────────────────────────────────────────────────

function buildAddOn(e) {
  return buildMainCard("", "");
}

// ── Main card: URL input + Get Formats button ──────────────────────────────
function buildMainCard(url, statusMsg) {
  var card    = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("🎬 YouTube Downloader");

  var urlInput = CardService.newTextInput()
    .setFieldName("video_url")
    .setTitle("Paste video link")
    .setHint("YouTube link.")
    .setValue(url || "");

  var cookiesInput = CardService.newTextInput()
    .setFieldName("cookies_file_id")
    .setTitle("Cookies file ID in Drive (optional)")
    .setHint("For protected sites like YouTube");

  var nameInput = CardService.newTextInput()
    .setFieldName("custom_name")
    .setTitle("File name (optional)")
    .setHint("Leave empty to use original title");

  var getFormatsBtn = CardService.newTextButton()
    .setText("🔍 Get Available Formats")
    .setOnClickAction(CardService.newAction().setFunctionName("onGetFormats"));

  var statusSection = CardService.newCardSection().setHeader("📊 Status");
  var statusText    = CardService.newTextParagraph().setText(statusMsg || "Paste a link and click Get Formats.");

  section.addWidget(urlInput);
  section.addWidget(cookiesInput);
  section.addWidget(nameInput);
  section.addWidget(getFormatsBtn);
  statusSection.addWidget(statusText);

  card.addSection(section);
  card.addSection(statusSection);
  return card.build();
}

// ── Format picker card ─────────────────────────────────────────────────────
function buildFormatCard(url, cookiesFileId, customName, formats) {
  var card    = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("📋 Choose Format");

  var formatSelect = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.RADIO_BUTTON)
    .setTitle("Available formats")
    .setFieldName("format_id");

  for (var i = 0; i < formats.length; i++) {
    var f = formats[i];
    formatSelect.addItem(f.label, f.id, i === 0);
  }

  var downloadBtn = CardService.newTextButton()
    .setText("⬇️ Download Selected Format")
    .setOnClickAction(
      CardService.newAction()
        .setFunctionName("onDownloadFormat")
        .setParameters({
          url:            url,
          cookies_file_id: cookiesFileId,
          custom_name:    customName
        })
    );

  var backBtn = CardService.newTextButton()
    .setText("← Back")
    .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"));

  section.addWidget(formatSelect);
  section.addWidget(downloadBtn);
  section.addWidget(backBtn);
  card.addSection(section);
  return card.build();
}

// ── Status card ────────────────────────────────────────────────────────────
function buildStatusCard(msg, jobId) {
  var card          = CardService.newCardBuilder();
  var statusSection = CardService.newCardSection().setHeader("📊 Status");
  var statusText    = CardService.newTextParagraph().setText(msg || "Working…");
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

  var newBtn = CardService.newTextButton()
    .setText("⬇️ Download Another Video")
    .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"));
  statusSection.addWidget(newBtn);

  card.addSection(statusSection);
  return card.build();
}

// ── Get Formats button clicked ─────────────────────────────────────────────
function onGetFormats(e) {
  var url           = e.formInput.video_url.trim();
  var cookiesFileId = e.formInput.cookies_file_id ? e.formInput.cookies_file_id.trim() : "";
  var customName    = e.formInput.custom_name ? e.formInput.custom_name.trim() : "";

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
    var response = UrlFetchApp.fetch(RENDER_URL + "/formats", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({ secret: API_SECRET, url: url, cookies_content: cookiesContent }),
      muteHttpExceptions: true
    });

    var body = JSON.parse(response.getContentText());
    var stdout = body.stdout || "";

    if (!stdout || body.stderr) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ Could not get formats: " + (body.stderr || "Unknown error").substring(0, 200)))
        .build();
    }

    // Parse format lines
    var formats = [];
    var lines   = stdout.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      // Match lines starting with a format ID number
      var match = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+.*\|\s*([\d.]+\S+)\s+\S+\s+(\S+)/);
      if (match) {
        var id         = match[1];
        var ext        = match[2];
        var resolution = match[3];
        var fps        = match[4];
        var size       = match[5];
        var proto      = match[6];
        var label      = id + " | " + ext + " | " + resolution + " | " + size;
        formats.push({ id: id, label: label });
      }
    }

    // Also add "best" option at top
    formats.unshift({ id: "best", label: "🏆 Best available (auto)" });

    if (formats.length <= 1) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ No formats found. Try adding cookies."))
        .build();
    }

    var newCard = buildFormatCard(url, cookiesFileId, customName, formats);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(newCard))
      .build();

  } catch(err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Error: " + err.message))
      .build();
  }
}

// ── Download Selected Format ───────────────────────────────────────────────
function onDownloadFormat(e) {
  var formatId      = e.formInput.format_id;
  var url           = e.parameters.url;
  var cookiesFileId = e.parameters.cookies_file_id || "";
  var customName    = e.parameters.custom_name || "";

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
      format_id:       formatId,
      custom_name:     customName,
      folder_id:       DRIVE_FOLDER
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
      var newCard = buildStatusCard("⏳ Download started!\n\nClick 'Check Status' in ~1-2 min.", body.job_id);
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
  var startPart  = parseInt(e.parameters.start_part || "0");

  try {
    var statusRes = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, { muteHttpExceptions: true });
    var job       = JSON.parse(statusRes.getContentText());

    if (job.status === "error") {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildStatusCard("❌ " + job.message, null)))
        .build();
    }

    if (job.status !== "done") {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildStatusCard("⏳ Still working: " + job.message, jobId)))
        .build();
    }

    // Get total parts
    var countRes   = UrlFetchApp.fetch(
      RENDER_URL + "/parts_count/" + jobId + "?secret=" + encodeURIComponent(API_SECRET),
      { muteHttpExceptions: true }
    );
    var countData  = JSON.parse(countRes.getContentText());
    var totalParts = countData.total || 1;
    var folder     = DriveApp.getFolderById(DRIVE_FOLDER);
    var savedMsg   = "";
    var batchSize  = 3; // fetch 3 parts per button click to avoid timeout
    var endPart    = Math.min(startPart + batchSize, totalParts);

    for (var i = startPart; i < endPart; i++) {
      var partRes = UrlFetchApp.fetch(
        RENDER_URL + "/part/" + jobId + "/" + i + "?secret=" + encodeURIComponent(API_SECRET),
        { muteHttpExceptions: true }
      );

      if (partRes.getResponseCode() !== 200) {
        savedMsg += "❌ Failed to fetch part " + (i+1) + "\n";
        continue;
      }

      var blob        = partRes.getBlob();
      var headers     = partRes.getHeaders();
      var disposition = headers["Content-Disposition"] || headers["content-disposition"] || "";
      var fname       = "video_part" + String(i+1).padStart(3,"0") + ".mp4";
      var match       = disposition.match(/filename[^;=\n]*=([^;\n]*)/);
      if (match) fname = match[1].replace(/['"]/g, "").trim();

      blob.setName(fname);
      blob.setContentType("video/mp4");
      var saved = folder.createFile(blob);
      savedMsg += "📁 " + saved.getName() + "\n🔗 " + saved.getUrl() + "\n\n";
    }

    // Check if more parts remain
    if (endPart < totalParts) {
      var remaining = totalParts - endPart;
      savedMsg += "✅ Parts " + (startPart+1) + "–" + endPart + " saved!\n⏳ " + remaining + " more part(s) remaining.\nClick 'Save Next Parts' to continue.";
      var card = buildStatusCard(savedMsg, null);

      // Add "Save Next Parts" button
      var nextBtn = CardService.newTextButton()
        .setText("💾 Save Next " + Math.min(batchSize, remaining) + " Parts")
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName("onCheckStatus")
            .setParameters({ job_id: jobId, start_part: String(endPart) })
        );

      // Rebuild card with extra button — use updateCard with new card
      var cardBuilder   = CardService.newCardBuilder();
      var statusSection = CardService.newCardSection().setHeader("📊 Status");
      statusSection.addWidget(CardService.newTextParagraph().setText(savedMsg));
      statusSection.addWidget(nextBtn);
      var newBtn = CardService.newTextButton()
        .setText("⬇️ Download Another Video")
        .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"));
      statusSection.addWidget(newBtn);
      cardBuilder.addSection(statusSection);

      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(cardBuilder.build()))
        .build();
    }

    // All done
    savedMsg = "✅ All " + totalParts + " part(s) saved to Drive!\n\n" + savedMsg;
    if (totalParts > 1) savedMsg += "📦 Play parts in order (part001, part002…)";

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildStatusCard(savedMsg, null)))
      .build();

  } catch(err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Error: " + err.message))
      .build();
  }
}
function checkLastJob() {
  var jobId = "PASTE_YOUR_LAST_JOB_ID_HERE";
  var response = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId);
  Logger.log(response.getContentText());
}