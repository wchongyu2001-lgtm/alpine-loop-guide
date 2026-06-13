/**
 * Trips v2 backend — deploy as Web App (execute as me, access: anyone).
 * Replaces the v1 bucket-list script at the same /exec URL (or deploy fresh
 * and update SAVE_URL in js/sync.js).
 *
 * Storage: one row per (trip, kind) in sheet "store": [trip, kind, json, updated].
 * v1 compat: GET ?trip=X without kind → returns {items} from kind "bucket".
 * Telegram ping on bucket saves, like v1.
 */

var TELEGRAM_TOKEN = '';   // paste v1 values to keep pings
var TELEGRAM_CHAT = '';

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('store') || ss.insertSheet('store');
  if (sh.getLastRow() === 0) sh.appendRow(['trip', 'kind', 'json', 'updated']);
  return sh;
}

function rowFor_(sh, trip, kind) {
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === trip && vals[i][1] === kind) return i + 1;
  }
  return -1;
}

function doGet(e) {
  if ((e.parameter.action || '') === 'fetchmail') return fetchMail_();
  var trip = (e.parameter.trip || '').trim();
  var kind = (e.parameter.kind || '').trim();
  var out;
  if (!trip) {
    out = { ok: false, error: 'trip required' };
  } else if (!kind) {
    // v1 protocol: bucket items
    var p = read_(trip, 'bucket');
    out = { items: (p && p.items) || [] };
  } else {
    var payload = read_(trip, kind);
    out = { ok: true, payload: payload };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function read_(trip, kind) {
  var sh = sheet_();
  var r = rowFor_(sh, trip, kind);
  if (r < 0) return null;
  try { return JSON.parse(sh.getRange(r, 3).getValue()); } catch (err) { return null; }
}

function doPost(e) {
  var msg;
  try { msg = JSON.parse(e.postData.contents); } catch (err) { return ok_(false, 'bad json'); }
  if (msg.action === 'upload') return upload_(msg);
  if (!msg.trip || !msg.kind) return ok_(false, 'trip+kind required');

  var sh = sheet_();
  var r = rowFor_(sh, msg.trip, msg.kind);
  var row = [msg.trip, msg.kind, JSON.stringify(msg.payload), msg.updated || new Date().toISOString()];
  if (r < 0) sh.appendRow(row);
  else sh.getRange(r, 1, 1, 4).setValues([row]);

  if (msg.kind === 'bucket' && TELEGRAM_TOKEN && TELEGRAM_CHAT) {
    try {
      var n = (msg.payload && msg.payload.items || []).length;
      UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', {
        method: 'post',
        payload: { chat_id: TELEGRAM_CHAT, text: '🪣 ' + msg.trip + ' bucket updated — ' + n + ' items' },
      });
    } catch (err) { /* ping is best-effort */ }
  }
  return ok_(true);
}

function ok_(ok, error) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok, error: error || undefined }))
    .setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- attachments: private Drive folder, metadata lives in the bookings overlay ---

function folder_() {
  var it = DriveApp.getFoldersByName('Trips Attachments');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Trips Attachments');
}

// {action:'upload', filename, mimeType, dataB64} → {ok, fileId, url}
function upload_(msg) {
  if (!msg.filename || !msg.dataB64) return ok_(false, 'filename+dataB64 required');
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(msg.dataB64),
      msg.mimeType || 'application/pdf', msg.filename);
    var file = folder_().createFile(blob);
    return json_({ ok: true, fileId: file.getId(), url: file.getUrl() });
  } catch (err) {
    return ok_(false, String(err));
  }
}

// ?action=fetchmail → recent confirmation-looking mail, PDFs saved to Drive.
function fetchMail_() {
  try {
    var threads = GmailApp.search(
      'newer_than:30d (booking OR confirmation OR reservation OR itinerary OR "e-ticket")', 0, 20);
    var folder = folder_();
    var out = [];
    threads.forEach(function (th) {
      var m = th.getMessages()[0];
      var atts = [];
      m.getAttachments().forEach(function (a) {
        if (a.getContentType() !== 'application/pdf') return;
        var name = m.getId() + '-' + a.getName();
        var existing = folder.getFilesByName(name);
        var file = existing.hasNext() ? existing.next() : folder.createFile(a.copyBlob().setName(name));
        atts.push({ name: a.getName(), url: file.getUrl(), fileId: file.getId() });
      });
      out.push({
        id: m.getId(),
        subject: m.getSubject(),
        from: m.getFrom(),
        date: m.getDate().toISOString(),
        body: m.getPlainBody().slice(0, 1500),
        attachments: atts,
      });
    });
    return json_({ ok: true, messages: out });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
