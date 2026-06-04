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
  var section = CardService.newCardSection().setHeader("🎬 Video Downloader");

  var urlInput = CardService.newTextInput()
    .setFieldName("video_url")
    .setTitle("Paste link or search YouTube")
    .setHint("Paste URL or search")
    .setValue(url || "");

  var cookiesInput = CardService.newTextInput()
    .setFieldName("cookies_file_id")
    .setTitle("Cookies file ID (optional)")
    .setHint("Only needed to change cookies file")
    .setValue("");

  var nameInput = CardService.newTextInput()
    .setFieldName("custom_name")
    .setTitle("File name (optional)")
    .setHint("Leave empty to use original title");

  // Check if there's an active job
  var activeJobId    = PropertiesService.getUserProperties().getProperty("active_job_id");
  var activePartIdx  = PropertiesService.getUserProperties().getProperty("active_part_index") || "0";
  var audioSwitch = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.CHECK_BOX)
    .setFieldName("audio_only")
    .addItem("🎵 Audio only (MP3)", "yes", false);

  var getFormatsBtn = CardService.newTextButton()
    .setText("🔍 Search")
    .setOnClickAction(CardService.newAction().setFunctionName("onGetFormats"));

  var historyBtn = CardService.newTextButton()
    .setText("🕐 Download History")
    .setOnClickAction(CardService.newAction().setFunctionName("onViewHistory"));

  var statusSection = CardService.newCardSection().setHeader("📊 Status");
  var statusText    = CardService.newTextParagraph().setText(statusMsg || "Paste a link and click Search.");

  section.addWidget(urlInput);
  section.addWidget(nameInput);
  section.addWidget(audioSwitch);
  section.addWidget(getFormatsBtn);
  section.addWidget(historyBtn);

  // Show resume button if there's an active job
  if (activeJobId) {
    var resumeJobBtn = CardService.newTextButton()
      .setText("▶️ Resume Active Download (Part " + (parseInt(activePartIdx)+1) + ")")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onCheckStatus")
          .setParameters({ job_id: activeJobId, part_index: activePartIdx })
      );
    section.addWidget(resumeJobBtn);
  }
  statusSection.addWidget(statusText);

  card.addSection(section);
  card.addSection(statusSection);
  return card.build();
}

// ── Format picker card ─────────────────────────────────────────────────────
function buildFormatCard(url, cookiesFileId, customName, formats, audioOnly) {
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
    .setText(audioOnly ? "🎵 Download Audio (MP3)" : "⬇️ Download Selected Format")
    .setOnClickAction(
      CardService.newAction()
        .setFunctionName("onDownloadFormat")
        .setParameters({
          url:             url,
          cookies_file_id: cookiesFileId,
          custom_name:     customName,
          audio_only:      audioOnly ? "yes" : "no"
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
    var nextLabel = "▶️ Save Part " + (resumeFrom + 1);
    var resumeBtn = CardService.newTextButton()
      .setText(nextLabel)
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onCheckStatus")
          .setParameters({ job_id: resumeJobId, part_index: String(resumeFrom) })
      );
    statusSection.addWidget(resumeBtn);
  }

  // Only show "Download Another Video" when fully done (no pending job or resume)
  if (!jobId && !resumeJobId) {
    var newBtn = CardService.newTextButton()
      .setText("⬇️ Download Another Video")
      .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"));
    statusSection.addWidget(newBtn);
  }

  card.addSection(statusSection);
  return card.build();
}

// ── Get Formats button clicked ─────────────────────────────────────────────
function onGetFormats(e) {
  var url           = e.formInput.video_url.trim();
  var cookiesFileId = e.formInput.cookies_file_id ? e.formInput.cookies_file_id.trim() : "";
  var customName    = e.formInput.custom_name ? e.formInput.custom_name.trim() : "";
  var audioOnly     = (e.formInput.audio_only && e.formInput.audio_only.indexOf("yes") !== -1);

  if (!url) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("⚠️ Please paste a link or enter a search term."))
      .build();
  }

  // Detect if input is a URL or search query
  var isUrl = url.indexOf("http://") === 0 || url.indexOf("https://") === 0;
  if (!isUrl) {
    // Treat as YouTube search
    return onYouTubeSearch(url, audioOnly, cookiesContent);
  }

  // Save cookies ID permanently if provided
  if (cookiesFileId) {
    PropertiesService.getUserProperties().setProperty("youtube_cookies_id", cookiesFileId);
  } else {
    cookiesFileId = PropertiesService.getUserProperties().getProperty("youtube_cookies_id") || "";
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

  // YouTube audio, m3u8, direct video files, and Google Drive — skip format picker
  var isYouTube = url.indexOf("youtube.com") !== -1 || url.indexOf("youtu.be") !== -1;

  // For YouTube audio — verify cookies work before downloading
  if (audioOnly && isYouTube) {
    var checkRes = UrlFetchApp.fetch(RENDER_URL + "/formats", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({ secret: API_SECRET, url: url, cookies_content: cookiesContent }),
      muteHttpExceptions: true
    });
    var checkBody  = JSON.parse(checkRes.getContentText());
    var checkErr   = checkBody.stderr || "";
    if (checkErr.indexOf("Sign in") !== -1 || checkErr.indexOf("bot") !== -1 || checkErr.indexOf("rotated") !== -1 || checkErr.indexOf("cookies") !== -1) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ YouTube cookies expired!\n\n1. Export fresh cookies.txt from Chrome\n2. In Google Drive, right-click your cookies file → 'Manage versions' → 'Upload new version'\n3. Press 'Get Formats' again."))
        .build();
    }
  }

  if (audioOnly && isYouTube || url.indexOf(".m3u8") !== -1 || url.indexOf(".mp4") !== -1 || url.indexOf(".mkv") !== -1 || url.indexOf("drive.google.com") !== -1) {

    // For Google Drive links, check file size first
    if (url.indexOf("drive.google.com") !== -1) {
      var fileIdMatch = url.match(/[-\w]{25,}/);
      if (fileIdMatch) {
        try {
          var driveFile = DriveApp.getFileById(fileIdMatch[0]);
          var fileSizeMB = driveFile.getSize() / (1024 * 1024);
          if (fileSizeMB > 400) {
            return CardService.newActionResponseBuilder()
              .setNotification(CardService.newNotification().setText(
                "⚠️ File is " + Math.round(fileSizeMB) + "MB — too large for the free server (max 400MB). The server only has 512MB RAM and will crash. Try a smaller file or upgrade Render to a paid plan."
              ))
              .build();
          }
        } catch(err) {
          // Can't check size — warn user but allow download
          return CardService.newActionResponseBuilder()
            .setNotification(CardService.newNotification().setText(
              "⚠️ Could not check file size. Only download if the file is under 400MB or the server may crash."
            ))
            .build();
        }
      }
    }

    // For Drive files, get real filename if no custom name provided
    if (!customName && url.indexOf("drive.google.com") !== -1) {
      try {
        var fileIdMatch2 = url.match(/[-\w]{25,}/);
        if (fileIdMatch2) {
          var driveFile2 = DriveApp.getFileById(fileIdMatch2[0]);
          customName = driveFile2.getName();
        }
      } catch(err) {}
    }

    var directPayload = {
      url:             url,
      secret:          API_SECRET,
      cookies_content: cookiesContent,
      format_id:       audioOnly ? "bestaudio" : "best",
      custom_name:     customName,
      folder_id:       DRIVE_FOLDER,
      audio_only:      audioOnly
    };
    var directRes = UrlFetchApp.fetch(RENDER_URL + "/download", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify(directPayload),
      muteHttpExceptions: true
    });
    var directBody = JSON.parse(directRes.getContentText());
    if (directRes.getResponseCode() === 202) {
      PropertiesService.getUserProperties().setProperty("active_job_id", directBody.job_id);
      PropertiesService.getUserProperties().setProperty("active_part_index", "0");
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(
          buildStatusCard("⏳ Download started!\n\nClick 'Check Status' in ~1-2 min.", directBody.job_id)
        ))
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
      var errText = body.stderr || "Unknown error";
      var msg;
      if (errText.indexOf("Sign in") !== -1 || errText.indexOf("bot") !== -1 || errText.indexOf("rotated") !== -1 || errText.indexOf("cookies") !== -1) {
        msg = "❌ YouTube cookies expired!\n\n1. Export fresh cookies.txt from Chrome\n2. In Google Drive, right-click your cookies file → 'Manage versions' → 'Upload new version'\n3. Press 'Get Formats' again.";
      } else {
        msg = "❌ Could not get formats: " + errText.substring(0, 200);
      }
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText(msg))
        .build();
    }

    // Parse format lines
    var formats = [];
    var lines   = stdout.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line  = lines[i].trim();
      var match = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s+/);
      if (!match) continue;

      var id         = match[1];
      var ext        = match[2];
      var resolution = match[3];
      var isAudioOnly = line.indexOf("audio only") !== -1;

      // For audio only mode, skip size check and just show audio formats
      if (audioOnly) {
        if (isAudioOnly) {
          var sizeMatch = line.match(/\|\s*~?([\d.]+)(MiB|GiB)\s/);
          var sizeLabel = sizeMatch ? sizeMatch[1] + sizeMatch[2] : "?MB";
          formats.push({ id: id, label: "🎵 " + id + " | " + ext + " | " + sizeLabel });
        }
        continue;
      }

      // For video mode, require size and skip audio-only formats
      if (isAudioOnly) continue;
      var sizeMatch = line.match(/\|\s*[~≈]?([\d.]+)(MiB|GiB)\s/);
      if (!sizeMatch) continue;

      var sizeNum  = parseFloat(sizeMatch[1]);
      var sizeUnit = sizeMatch[2];
      var sizeMB   = sizeUnit === "GiB" ? sizeNum * 1024 : sizeNum;
      if (sizeMB > 400) continue;

      var label = id + " | " + ext + " | " + resolution + " | " + sizeMatch[1] + sizeMatch[2];
      formats.push({ id: id, label: label });
    }

    // Add best option at top
    if (audioOnly) {
      formats.unshift({ id: "bestaudio", label: "🏆 Best audio (auto)" });
    } else {
      formats.unshift({ id: "best", label: "🏆 Best available — auto (≤400MB only)" });
    }

    if (formats.length <= 1) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ No formats found. Try adding cookies."))
        .build();
    }

    var newCard = buildFormatCard(url, cookiesFileId, customName, formats, audioOnly);
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

  var audioOnly = e.parameters.audio_only === "yes";
  // Save cookies ID permanently if provided
  if (cookiesFileId) {
    PropertiesService.getUserProperties().setProperty("youtube_cookies_id", cookiesFileId);
  } else {
    cookiesFileId = PropertiesService.getUserProperties().getProperty("youtube_cookies_id") || "";
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
      format_id:       formatId,
      custom_name:     customName,
      folder_id:       DRIVE_FOLDER,
      audio_only:      audioOnly
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
      PropertiesService.getUserProperties().setProperty("active_job_id", body.job_id);
      PropertiesService.getUserProperties().setProperty("active_part_index", "0");
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
  var partIndex = parseInt(e.parameters.part_index !== undefined ? e.parameters.part_index : "0");
  if (isNaN(partIndex)) partIndex = 0;

  // Save progress so resume works after addon refresh
  PropertiesService.getUserProperties().setProperty("active_job_id", jobId);
  PropertiesService.getUserProperties().setProperty("active_part_index", String(partIndex));

  try {
    // Check if this specific part is ready
    var partRes = UrlFetchApp.fetch(
      RENDER_URL + "/part_ready/" + jobId + "/" + partIndex + "?secret=" + encodeURIComponent(API_SECRET),
      { muteHttpExceptions: true }
    );
    var info;
    try {
      info = JSON.parse(partRes.getContentText());
    } catch(err) {
      // HTML response means server error or cold start
      if (partRes.getResponseCode() === 404) {
        PropertiesService.getUserProperties().deleteProperty("active_job_id");
        return CardService.newActionResponseBuilder()
          .setNavigation(CardService.newNavigation().updateCard(buildStatusCard("❌ Server restarted and job was lost.\n\nPlease download again.", null)))
          .build();
      }
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("⚠️ Server error. Try again in 30 seconds."))
        .build();
    }

    // Job not found — either still starting or server restarted
    if (info.status === "not_found") {
      // Check if job exists at all
      var checkRes = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, { muteHttpExceptions: true });
      var checkJob;
      try { checkJob = JSON.parse(checkRes.getContentText()); } catch(e) { checkJob = {}; }
      
      if (checkRes.getResponseCode() === 404 || checkJob.error) {
        // Job truly lost — server restarted
        PropertiesService.getUserProperties().deleteProperty("active_job_id");
        return CardService.newActionResponseBuilder()
          .setNavigation(CardService.newNavigation().updateCard(buildStatusCard("❌ Server restarted and job was lost.\n\nPlease download again.", null)))
          .build();
      } else {
        // Job exists but part not ready yet
        return CardService.newActionResponseBuilder()
          .setNavigation(CardService.newNavigation().updateCard(buildStatusCard("⏳ Still downloading… not ready yet.\n\nClick 'Check Again' in ~30 seconds.", null, jobId, partIndex)))
          .build();
      }
    }

    // Job failed
    if (info.job_status === "error") {
      var statusRes = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, { muteHttpExceptions: true });
      var job       = JSON.parse(statusRes.getContentText());
      var errMsg    = job.message || "";
      errMsg = "❌ " + errMsg;
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildStatusCard(errMsg, null)))
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

    // Get job info for custom name and total parts
    var statusRes2 = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, { muteHttpExceptions: true });
    var jobInfo;
    try {
      jobInfo = JSON.parse(statusRes2.getContentText());
    } catch(err) {
      jobInfo = {};
    }
    var totalParts  = info.total || 1;
    var customName  = jobInfo.custom_name || "";

    // Determine target folder
    var targetFolder;
    if (totalParts > 1) {
      // Get folder name — use custom name or real video title
      var subFolderName = "";
      if (customName) {
        subFolderName = customName.replace(/\.(mp4|mp3)$/i, "");
      } else {
        // Get real filename from server
        try {
          var fnameRes2  = UrlFetchApp.fetch(
            RENDER_URL + "/filename/" + jobId + "/0?secret=" + encodeURIComponent(API_SECRET),
            { muteHttpExceptions: true }
          );
          var fnameData2 = JSON.parse(fnameRes2.getContentText());
          var realFname  = fnameData2.filename || "";
          subFolderName  = realFname.replace(/\.(mp4|mp3|mkv|webm)$/i, "").replace(/_part\d+$/i, "");
        } catch(err) {
          subFolderName = "video_" + jobId.substring(0, 8);
        }
      }

      var rootFolder = DriveApp.getFolderById(DRIVE_FOLDER);
      var existing   = rootFolder.getFoldersByName(subFolderName);
      if (existing.hasNext()) {
        targetFolder = existing.next();
      } else {
        targetFolder = rootFolder.createFolder(subFolderName);
      }
    } else {
      targetFolder = DriveApp.getFolderById(DRIVE_FOLDER);
    }

    // Save this part
    var blob    = fileRes.getBlob();
    var isAudio = customName.toLowerCase().endsWith(".mp3") ||
                  (fileRes.getHeaders()["Content-Type"] || "").indexOf("audio") !== -1;
    var ext     = isAudio ? ".mp3" : ".mp4";
    var fname;

    if (customName && totalParts === 1) {
      fname = customName.replace(/\.(mp4|mp3)$/i, "") + ext;
    } else if (customName && totalParts > 1) {
      fname = customName.replace(/\.(mp4|mp3)$/i, "") + "_part" + String(partIndex+1).padStart(3,"0") + ext;
    } else {
      // Get real filename from server (preserves Hebrew and Unicode)
      try {
        var fnameRes  = UrlFetchApp.fetch(
          RENDER_URL + "/filename/" + jobId + "/" + partIndex + "?secret=" + encodeURIComponent(API_SECRET),
          { muteHttpExceptions: true }
        );
        var fnameData = JSON.parse(fnameRes.getContentText());
        fname = fnameData.filename || "video_part" + String(partIndex+1).padStart(3,"0") + ext;
      } catch(err) {
        fname = "video_part" + String(partIndex+1).padStart(3,"0") + ext;
      }
    }

    blob.setName(fname);
    blob.setContentType(isAudio ? "audio/mpeg" : "video/mp4");

    var saved     = targetFolder.createFile(blob);
    var nextIndex = partIndex + 1;
    var msg       = "✅ Saved part " + (partIndex+1) + " of " + totalParts + "\n📁 " + saved.getName();

    if (totalParts > 1 && customName) {
      msg += "\n📂 Folder: " + customName.replace(/\.(mp4|mp3)$/i, "");
    }

    if (nextIndex < totalParts || info.job_status !== "done") {
      msg += "\n\n⏳ More parts remaining.";
      // Build card with open button + next part button
      var card          = CardService.newCardBuilder();
      var statusSection = CardService.newCardSection().setHeader("📊 Status");
      statusSection.addWidget(CardService.newTextParagraph().setText(msg));
      statusSection.addWidget(
        CardService.newTextButton()
          .setText("📂 Open in Drive")
          .setOpenLink(CardService.newOpenLink().setUrl(saved.getUrl()))
      );
      statusSection.addWidget(
        CardService.newTextButton()
          .setText("▶️ Save Part " + (nextIndex + 1))
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onCheckStatus")
              .setParameters({ job_id: jobId, part_index: String(nextIndex) })
          )
      );
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(card.addSection(statusSection).build()))
        .build();

    } else {
      // All done — add to history
      var historyLinks = [];
      if (totalParts === 1) {
        historyLinks.push(saved.getUrl());
      } else {
        historyLinks.push(targetFolder.getUrl());
      }
      addToHistory(customName || fname, totalParts, historyLinks);

      msg += "\n\n🎉 All " + totalParts + " parts saved!";
      if (totalParts > 1) msg += " Play them in order.";

      // Clear active job
      PropertiesService.getUserProperties().deleteProperty("active_job_id");

      // Build card with open button
      var card          = CardService.newCardBuilder();
      var statusSection = CardService.newCardSection().setHeader("📊 Status");
      statusSection.addWidget(CardService.newTextParagraph().setText(msg));
      statusSection.addWidget(
        CardService.newTextButton()
          .setText("📂 Open in Drive")
          .setOpenLink(CardService.newOpenLink().setUrl(totalParts > 1 ? targetFolder.getUrl() : saved.getUrl()))
      );
      statusSection.addWidget(
        CardService.newTextButton()
          .setText("⬇️ Download Another Video")
          .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"))
      );
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(card.addSection(statusSection).build()))
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
  var jobId = "0a00b5cc-6093-40dd-8517-318437f7ce33";
  var response = UrlFetchApp.fetch(
    RENDER_URL + "/debug/" + jobId + "?secret=" + encodeURIComponent(API_SECRET),
    { muteHttpExceptions: true }
  );
  Logger.log(response.getContentText());
}
// ── Download History ───────────────────────────────────────────────────────
function getHistory() {
  var props = PropertiesService.getUserProperties();
  var raw   = props.getProperty("download_history");
  return raw ? JSON.parse(raw) : [];
}

function addToHistory(name, parts, links) {
  var props   = PropertiesService.getUserProperties();
  var history = getHistory();
  history.unshift({
    name:  name,
    parts: parts,
    links: links,
    date:  new Date().toLocaleString()
  });
  // Keep only last 20 entries
  if (history.length > 20) history = history.slice(0, 20);
  props.setProperty("download_history", JSON.stringify(history));
}

function buildHistoryCard() {
  var card    = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("🕐 Download History");

  var backBtnTop = CardService.newTextButton()
    .setText("← Back")
    .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"));
  section.addWidget(backBtnTop);
  var history = getHistory();

  if (history.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText("No downloads yet."));
  } else {
    for (var i = 0; i < history.length; i++) {
      var h   = history[i];
      var txt = "📁 " + h.name + "\n🗓 " + h.date + "\n📦 " + h.parts + " part(s)";
      for (var j = 0; j < h.links.length; j++) {
        txt += "\n🔗 " + h.links[j];
      }
      section.addWidget(CardService.newTextParagraph().setText(txt));
      if (i < history.length - 1) {
        section.addWidget(CardService.newDivider());
      }
    }
  }

  var backBtn = CardService.newTextButton()
    .setText("← Back")
    .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"));
  section.addWidget(backBtn);

  var clearBtn = CardService.newTextButton()
    .setText("🗑 Clear History")
    .setOnClickAction(CardService.newAction().setFunctionName("clearHistory"));
  section.addWidget(clearBtn);

  card.addSection(section);
  return card.build();
}

function clearHistory() {
  PropertiesService.getUserProperties().deleteProperty("download_history");
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHistoryCard()))
    .build();
}

function onViewHistory(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildHistoryCard()))
    .build();
}
// ── YouTube Search ─────────────────────────────────────────────────────────
function onYouTubeSearch(query, audioOnly, cookiesContent) {
  try {
    var response = UrlFetchApp.fetch(RENDER_URL + "/search", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({
        secret:          API_SECRET,
        query:           query,
        cookies_content: cookiesContent,
        page:            0
      }),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code !== 200 || !body.results) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ No results found. Try different search terms."))
        .build();
    }

    var newCard = buildSearchResultsCard(body.results, audioOnly, query, body.has_more, body.next_page);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(newCard))
      .build();

  } catch(err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Search failed: " + err.message))
      .build();
  }
}

function buildSearchResultsCard(results, audioOnly, query, hasMore, nextPage) {
  var card    = CardService.newCardBuilder();
  var section = CardService.newCardSection().setHeader("🔍 Search Results");

  var backBtnTop = CardService.newTextButton()
    .setText("← Back")
    .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"));
  section.addWidget(backBtnTop);

  for (var i = 0; i < results.length; i++) {
    var r = results[i];

    // Thumbnail
    try {
      var img = CardService.newImage()
        .setImageUrl(r.thumbnail)
        .setAltText(r.title);
      section.addWidget(img);
    } catch(e) {}

    // Title + info
    var info = "🎬 " + r.title + "\n" +
               "📺 " + r.channel + "\n" +
               (r.duration ? "⏱ " + r.duration + "   " : "") + "📅 " + r.date;
    section.addWidget(CardService.newTextParagraph().setText(info));

    // Download button
    var downloadBtn = CardService.newTextButton()
      .setText(audioOnly ? "🎵 Download MP3" : "⬇️ Download Video")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onDownloadSearchResult")
          .setParameters({
            video_url:  r.url,
            audio_only: audioOnly ? "yes" : "no"
          })
      );
    section.addWidget(downloadBtn);
    section.addWidget(CardService.newDivider());
  }

  if (hasMore) {
    var loadMoreBtn = CardService.newTextButton()
      .setText("➕ Load More Results")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onLoadMoreResults")
          .setParameters({
            query:      query || "",
            audio_only: audioOnly ? "yes" : "no",
            next_page:  String(nextPage || 1)
          })
      );
    section.addWidget(loadMoreBtn);
  }

  var backBtn = CardService.newTextButton()
    .setText("← Back")
    .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"));
  section.addWidget(backBtn);

  card.addSection(section);
  return card.build();
}

function onLoadMoreResults(e) {
  var query     = e.parameters.query;
  var audioOnly = e.parameters.audio_only === "yes";
  var page      = parseInt(e.parameters.next_page || "1");

  var cookiesFileId = PropertiesService.getUserProperties().getProperty("youtube_cookies_id") || "";
  var cookiesContent = "";
  if (cookiesFileId) {
    try {
      cookiesContent = DriveApp.getFileById(cookiesFileId).getBlob().getDataAsString();
    } catch(err) {}
  }

  try {
    var response = UrlFetchApp.fetch(RENDER_URL + "/search", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({
        secret:          API_SECRET,
        query:           query,
        cookies_content: cookiesContent,
        page:            page
      }),
      muteHttpExceptions: true
    });

    var body = JSON.parse(response.getContentText());
    if (response.getResponseCode() !== 200 || !body.results) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ No more results found."))
        .build();
    }

    var newCard = buildSearchResultsCard(body.results, audioOnly, query, body.has_more, body.next_page);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(newCard))
      .build();

  } catch(err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("❌ Error: " + err.message))
      .build();
  }
}

function onDownloadSearchResult(e) {
  var url       = e.parameters.video_url;
  var audioOnly = e.parameters.audio_only === "yes";

  // Get saved cookies
  var cookiesFileId = PropertiesService.getUserProperties().getProperty("youtube_cookies_id") || "";
  var cookiesContent = "";
  if (cookiesFileId) {
    try {
      cookiesContent = DriveApp.getFileById(cookiesFileId).getBlob().getDataAsString();
    } catch(err) {}
  }

  if (audioOnly) {
    // Check cookies first
    var checkRes  = UrlFetchApp.fetch(RENDER_URL + "/formats", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({ secret: API_SECRET, url: url, cookies_content: cookiesContent }),
      muteHttpExceptions: true
    });
    var checkBody = JSON.parse(checkRes.getContentText());
    var checkErr  = checkBody.stderr || "";
    if (checkErr.indexOf("Sign in") !== -1 || checkErr.indexOf("bot") !== -1 ||
        checkErr.indexOf("rotated") !== -1 || checkErr.indexOf("cookies") !== -1) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ YouTube cookies expired!\n\n1. Export fresh cookies.txt from Chrome\n2. In Google Drive, right-click your cookies file → 'Manage versions' → 'Upload new version'\n3. Search again."))
        .build();
    }

    // Download audio directly
    var payload = {
      url:             url,
      secret:          API_SECRET,
      cookies_content: cookiesContent,
      format_id:       "bestaudio",
      custom_name:     "",
      folder_id:       DRIVE_FOLDER,
      audio_only:      true
    };
    var response = UrlFetchApp.fetch(RENDER_URL + "/download", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var rawText = response.getContentText();
    var body;
    try {
      body = JSON.parse(rawText);
    } catch(err) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ Server error. Try again in a moment."))
        .build();
    }
    if (response.getResponseCode() === 202) {
      PropertiesService.getUserProperties().setProperty("active_job_id", body.job_id);
      PropertiesService.getUserProperties().setProperty("active_part_index", "0");
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(
          buildStatusCard("⏳ Download started!\n\nClick 'Check Status' in ~1-2 min.", body.job_id)
        ))
        .build();
    }

  } else {
    // Show format picker — same as normal video download
    var formatsRes = UrlFetchApp.fetch(RENDER_URL + "/formats", {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({ secret: API_SECRET, url: url, cookies_content: cookiesContent }),
      muteHttpExceptions: true
    });
    var formatsRaw = formatsRes.getContentText();
    var formatsBody;
    try {
      formatsBody = JSON.parse(formatsRaw);
    } catch(err) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ Server error fetching formats. Try again."))
        .build();
    }
    var stdout      = formatsBody.stdout || "";
    var stderr      = formatsBody.stderr || "";

    if (!stdout || stderr) {
      var errMsg = stderr;
      if (errMsg.indexOf("Sign in") !== -1 || errMsg.indexOf("bot") !== -1 ||
          errMsg.indexOf("rotated") !== -1 || errMsg.indexOf("cookies") !== -1) {
        return CardService.newActionResponseBuilder()
          .setNotification(CardService.newNotification().setText("❌ YouTube cookies expired!\n\n1. Export fresh cookies.txt from Chrome\n2. In Google Drive, right-click your cookies file → 'Manage versions' → 'Upload new version'\n3. Search again."))
          .build();
      }
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ Could not get formats: " + errMsg.substring(0, 200)))
        .build();
    }

    // Parse formats
    var formats = [];
    var lines   = stdout.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line  = lines[i].trim();
      var match = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s+/);
      if (!match) continue;
      var id          = match[1];
      var ext         = match[2];
      var resolution  = match[3];
      var isAudioOnly = line.indexOf("audio only") !== -1;
      if (isAudioOnly) continue;
      var sizeMatch = line.match(/\|\s*[~≈]?([\d.]+)(MiB|GiB)\s/);
      if (!sizeMatch) continue;
      var sizeMB = sizeMatch[2] === "GiB" ? parseFloat(sizeMatch[1]) * 1024 : parseFloat(sizeMatch[1]);
      if (sizeMB > 400) continue;
      formats.push({ id: id, label: id + " | " + ext + " | " + resolution + " | " + sizeMatch[1] + sizeMatch[2] });
    }
    formats.unshift({ id: "best", label: "🏆 Best available — auto (≤400MB only)" });

    if (formats.length <= 1) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("❌ No formats found."))
        .build();
    }

    var newCard = buildFormatCard(url, "", "", formats, false);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(newCard))
      .build();
  }
}
function checkProperties() {
  var props = PropertiesService.getUserProperties().getProperties();
  Logger.log(JSON.stringify(props));
}
function debugAudioFormats() {
  var cookiesFileId  = "1MsjoeHV6m3HzyLKx7TVkO6raSbBUbiDI";
  var cookiesContent = DriveApp.getFileById(cookiesFileId).getBlob().getDataAsString();
  
  var response = UrlFetchApp.fetch(RENDER_URL + "/formats", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      secret:          API_SECRET,
      url:             "https://www.youtube.com/watch?v=YxLx8T4_a_U",
      cookies_content: cookiesContent
    })
  });
  Logger.log(response.getContentText());
}
function saveCookiesId() {
  PropertiesService.getUserProperties().setProperty("youtube_cookies_id", "1SSbEUsKzMtg9u86slxc5qC_3gmB4Q2Hu");
}
function checkLastError() {
  var jobId = PropertiesService.getUserProperties().getProperty("active_job_id");
  var response = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId);
  Logger.log(response.getContentText());
}
function checkCookies() {
  var cookiesId = PropertiesService.getUserProperties().getProperty("youtube_cookies_id");
  Logger.log("Cookies ID: " + cookiesId);
  try {
    var content = DriveApp.getFileById(cookiesId).getBlob().getDataAsString();
    Logger.log("Cookies length: " + content.length);
    Logger.log("First 200 chars: " + content.substring(0, 200));
  } catch(e) {
    Logger.log("Error: " + e.message);
  }
}
function saveCookiesId() {
  PropertiesService.getUserProperties().setProperty("youtube_cookies_id", "1SSbEUsKzMtg9u86slxc5qC_3gmB4Q2Hu");
}
function checkRunning() {
  var jobId = PropertiesService.getUserProperties().getProperty("active_job_id");
  var response = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId);
  Logger.log(response.getContentText());
}
function checkRunning() {
  var jobId = PropertiesService.getUserProperties().getProperty("active_job_id");
  var response = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, {muteHttpExceptions: true});
  Logger.log(response.getContentText());
}
function debugLatestJob() {
  var jobId = PropertiesService.getUserProperties().getProperty("active_job_id");
  var response = UrlFetchApp.fetch(
    RENDER_URL + "/debug/" + jobId + "?secret=" + encodeURIComponent(API_SECRET),
    { muteHttpExceptions: true }
  );
  Logger.log(response.getContentText());
}
function testSearch() {
  var cookiesFileId  = PropertiesService.getUserProperties().getProperty("youtube_cookies_id");
  var cookiesContent = DriveApp.getFileById(cookiesFileId).getBlob().getDataAsString();
  
  var response = UrlFetchApp.fetch(RENDER_URL + "/search", {
    method:             "post",
    contentType:        "application/json",
    payload:            JSON.stringify({
      secret:          API_SECRET,
      query:           "bach piano",
      cookies_content: cookiesContent
    }),
    muteHttpExceptions: true
  });
  Logger.log(response.getContentText());
}
function testSearchChannel() {
  var response = UrlFetchApp.fetch(RENDER_URL + "/search", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      secret: API_SECRET,
      query:  "Sruly Green",
      page:   0
    }),
    muteHttpExceptions: true
  });
  Logger.log(response.getContentText());
}
function debugChannel() {
  var response = UrlFetchApp.fetch(RENDER_URL + "/debug_channel", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ secret: API_SECRET }),
    muteHttpExceptions: true
  });
  Logger.log(response.getContentText());
}
function debugRSS() {
  var response = UrlFetchApp.fetch(RENDER_URL + "/debug_rss", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ secret: API_SECRET }),
    muteHttpExceptions: true
  });
  Logger.log(response.getContentText());
}
function checkLastStatus() {
  var jobId = PropertiesService.getUserProperties().getProperty("active_job_id");
  var response = UrlFetchApp.fetch(
    RENDER_URL + "/part_ready/" + jobId + "/0?secret=" + encodeURIComponent(API_SECRET),
    { muteHttpExceptions: true }
  );
  Logger.log("Code: " + response.getResponseCode());
  Logger.log("Body: " + response.getContentText().substring(0, 500));
}
function diagnose() {
  var jobId = PropertiesService.getUserProperties().getProperty("active_job_id");
  Logger.log("Job ID: " + jobId);
  
  var r1 = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, {muteHttpExceptions: true});
  Logger.log("Status code: " + r1.getResponseCode());
  Logger.log("Status body: " + r1.getContentText().substring(0, 300));
  
  var r2 = UrlFetchApp.fetch(RENDER_URL + "/part_ready/" + jobId + "/0?secret=" + encodeURIComponent(API_SECRET), {muteHttpExceptions: true});
  Logger.log("Part_ready code: " + r2.getResponseCode());
  Logger.log("Part_ready body: " + r2.getContentText().substring(0, 300));
}
function diagnoseDrive() {
  var jobId = PropertiesService.getUserProperties().getProperty("active_job_id");
  Logger.log("Job ID: " + jobId);
  
  var r1 = UrlFetchApp.fetch(RENDER_URL + "/status/" + jobId, {muteHttpExceptions: true});
  Logger.log("Status: " + r1.getContentText().substring(0, 300));
  
  var r2 = UrlFetchApp.fetch(RENDER_URL + "/part_ready/" + jobId + "/0?secret=" + encodeURIComponent(API_SECRET), {muteHttpExceptions: true});
  Logger.log("Part ready: " + r2.getContentText().substring(0, 300));
}