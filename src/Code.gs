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
function buildStatusCard(msg, jobId, resumeJobId, resumeFrom) {
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
          .setParameters({ job_id: jobId, part_index: "0" })
      );
    statusSection.addWidget(checkBtn);
  }

  if (resumeJobId !== undefined && resumeJobId !== null) {
    var nextLabel = resumeFrom === partIndex ? "🔄 Check Again" : "▶️ Save Part " + (resumeFrom + 1);
    var resumeBtn = CardService.newTextButton()
      .setText(nextLabel)
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onCheckStatus")
          .setParameters({ job_id: resumeJobId, part_index: String(resumeFrom) })
      );
    statusSection.addWidget(resumeBtn);
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

    // Parse format lines — skip anything over 400MB
    var formats = [];
    var lines   = stdout.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line  = lines[i].trim();
      var match = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s+/);
      if (!match) continue;

      var id         = match[1];
      var ext        = match[2];
      var resolution = match[3];

      // Extract file size
      var sizeMatch = line.match(/\|\s*~?([\d.]+)(MiB|GiB)\s/);
      if (!sizeMatch) continue;

      var sizeNum  = parseFloat(sizeMatch[1]);
      var sizeUnit = sizeMatch[2];
      var sizeMB   = sizeUnit === "GiB" ? sizeNum * 1024 : sizeNum;

      // Skip formats over 400MB
      if (sizeMB > 400) continue;

      var label = id + " | " + ext + " | " + resolution + " | " + sizeMatch[1] + sizeMatch[2];
      formats.push({ id: id, label: label });
    }

    // Add "best" option at top
    formats.unshift({ id: "best", label: "🏆 Best available — auto (≤400MB only)" });

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
  var jobId     = e.parameters.job_id;
  var partIndex = parseInt(e.parameters.part_index || "0");

  try {
    // Check if this specific part is ready
    var partRes = UrlFetchApp.fetch(
      RENDER_URL + "/part_ready/" + jobId + "/" + partIndex + "?secret=" + encodeURIComponent(API_SECRET),
      { muteHttpExceptions: true }
    );
    var info = JSON.parse(partRes.getContentText());

    // Job failed
    if (info.job_status === "error") {
      var statusRes = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, { muteHttpExceptions: true });
      var job       = JSON.parse(statusRes.getContentText());
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildStatusCard("❌ " + job.message, null)))
        .build();
    }

    // Part not ready yet
    if (!info.ready) {
      var stillMsg = "⏳ Still downloading… part " + (partIndex+1) + " not ready yet.\n\nClick 'Check Again' in ~30 seconds.";
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildStatusCard(stillMsg, null, jobId, partIndex)))
        .build();
    }

    // Part is ready — fetch and save it NOW
    var fileRes = UrlFetchApp.fetch(
      RENDER_URL + "/part/" + jobId + "/" + partIndex + "?secret=" + encodeURIComponent(API_SECRET),
      { muteHttpExceptions: true }
    );

    if (fileRes.getResponseCode() !== 200) {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(
          buildStatusCard("❌ Failed to fetch part " + (partIndex+1), null, jobId, partIndex)
        ))
        .build();
    }

    // Save to Drive
    var blob        = fileRes.getBlob();
    var headers     = partRes.getHeaders ? partRes.getHeaders() : {};
    var fname       = "video_part" + String(partIndex+1).padStart(3,"0") + ".mp4";
    var disposition = (fileRes.getHeaders()["Content-Disposition"] || fileRes.getHeaders()["content-disposition"] || "");
    var match       = disposition.match(/filename[^;=\n]*=([^;\n]*)/);
    if (match) {
      fname = match[1].replace(/['"]/g, "").trim();
    }
    blob.setName(fname);
    blob.setContentType("video/mp4");

    var folder = DriveApp.getFolderById(DRIVE_FOLDER);
    var saved  = folder.createFile(blob);

    var totalParts = info.total || 1;
    var nextIndex  = partIndex + 1;
    var msg        = "✅ Saved part " + (partIndex+1) + " of " + totalParts + "\n📁 " + saved.getName() + "\n🔗 " + saved.getUrl();

    if (nextIndex < totalParts || info.job_status !== "done") {
      msg += "\n\n⏳ More parts remaining.";
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildStatusCard(msg, null, jobId, nextIndex)))
        .build();
    } else {
      msg += "\n\n🎉 All " + totalParts + " parts saved! Play them in order.";
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildStatusCard(msg, null)))
        .build();
    }

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
function checkJobDebug() {
  var jobId = "902c25ec-e32d-4394-8fae-28cffd3b6129";
  var response = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId);
  Logger.log(response.getContentText());
}
function debugJob() {
  var jobId = "902c25ec-e32d-4394-8fae-28cffd3b6129";
  var response = UrlFetchApp.fetch(
    RENDER_URL + "/debug/" + jobId + "?secret=" + encodeURIComponent(API_SECRET)
  );
  Logger.log(response.getContentText());
}
function debugLatest() {
  var jobId = "a72acc8e-4554-455f-83d1-dc5d01396489";
  var response = UrlFetchApp.fetch(
    RENDER_URL + "/debug/" + jobId + "?secret=" + encodeURIComponent(API_SECRET),
    { muteHttpExceptions: true }
  );
  Logger.log(response.getContentText());
}