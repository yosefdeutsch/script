// 1. doGet creates the visual webpage when you open the URL in your browser
function doGet(e) {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; max-width: 500px; margin: 0 auto; background: #f9f9f9; }
          .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          input { width: 100%; padding: 10px; margin: 10px 0 20px 0; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
          button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
          button:disabled { background: #aaa; cursor: not-allowed; }
          #status { margin-top: 15px; font-weight: bold; text-align: center; }
          a { color: #007bff; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Save Video to Drive</h2>
          
          <label>Video URL (required):</label>
          <input type="text" id="videoUrl" placeholder="https://example.com/video.mp4" />

          <label>File Name (optional):</label>
          <input type="text" id="fileName" placeholder="my_downloaded_video.mp4" />

          <button id="btn" onclick="saveVideo()">Download to Drive</button>

          <div id="status"></div>
        </div>

        <script>
          function saveVideo() {
            var url = document.getElementById('videoUrl').value;
            var name = document.getElementById('fileName').value || 'downloaded_video.mp4';
            var statusEl = document.getElementById('status');
            var btn = document.getElementById('btn');

            if (!url) {
              statusEl.innerText = 'Please enter a URL first.';
              statusEl.style.color = 'red';
              return;
            }

            statusEl.innerText = 'Downloading to Drive... Please wait (this may take up to a minute).';
            statusEl.style.color = '#333';
            btn.disabled = true;

            // This calls the server-side Apps Script function
            google.script.run
              .withSuccessHandler(function(result) {
                if (result.success) {
                  statusEl.innerHTML = '✅ Success! <a href="' + result.fileUrl + '" target="_blank">Click here to view in Drive</a>';
                } else {
                  statusEl.innerText = '❌ Error: ' + result.error;
                  statusEl.style.color = 'red';
                }
                btn.disabled = false;
              })
              .withFailureHandler(function(error) {
                statusEl.innerText = '❌ Execution Error: ' + error.message;
                statusEl.style.color = 'red';
                btn.disabled = false;
              })
              .processVideoDownload(url, name);
          }
        </script>
      </body>
    </html>
  `).setTitle('Drive Video Downloader');
}

// 2. doPost keeps the API working for your Render Server
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = processVideoDownload(data.videoUrl, data.fileName || "downloaded_video.mp4");
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 3. The core function that does the actual downloading (used by both UI and API)
function processVideoDownload(videoUrl, fileName) {
  try {
    const response = UrlFetchApp.fetch(videoUrl);
    const blob = response.getBlob().setName(fileName);
    const file = DriveApp.createFile(blob);
    
    return {
      success: true,
      fileId: file.getId(),
      fileUrl: file.getUrl()
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}