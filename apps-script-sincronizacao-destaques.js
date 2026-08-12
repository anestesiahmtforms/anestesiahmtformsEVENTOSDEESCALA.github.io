const SPREADSHEET_ID = "11ayJbQFmFPzLegFZHL8kPKCvudpPo60O4NyR3i7aofA";
const HIGHLIGHTS_SHEET = "DESTAQUES APP";

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const sheet = getHighlightsSheet_();
    const action = String(params.action || "get").toLowerCase();

    if (action === "set" || action === "toggle") {
      setHighlight_(sheet, params);
    }

    return json_({ ok: true, highlights: readHighlights_(sheet) });
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function getHighlightsSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(HIGHLIGHTS_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(HIGHLIGHTS_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Data", "Sigla", "Marcado", "Atualizado em", "Atualizado por"]);
  }

  return sheet;
}

function setHighlight_(sheet, params) {
  const dateKey = normalizeDateKey_(params.date);
  const sigla = String(params.sigla || "").trim().toUpperCase();
  const marked = String(params.marked).toLowerCase() === "true";

  if (!dateKey || !sigla) {
    throw new Error("Data e sigla sao obrigatorias.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const lastRow = sheet.getLastRow();
    const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
    const matchingRows = [];

    values.forEach((row, index) => {
      if (normalizeDateKey_(row[0]) === dateKey && String(row[1] || "").trim().toUpperCase() === sigla) {
        matchingRows.push(index + 2);
      }
    });

    const now = new Date();
    const updatedBy = String(params.updatedBy || "PWA").slice(0, 120);

    if (matchingRows.length) {
      matchingRows.forEach((rowNumber) => {
        sheet.getRange(rowNumber, 1, 1, 5).setValues([[dateKey, sigla, marked, now, updatedBy]]);
      });
    } else {
      sheet.appendRow([dateKey, sigla, marked, now, updatedBy]);
    }
  } finally {
    lock.releaseLock();
  }
}

function readHighlights_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {};
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const state = {};

  rows.forEach((row) => {
    const dateKey = normalizeDateKey_(row[0]);
    const sigla = String(row[1] || "").trim().toUpperCase();
    if (!dateKey || !sigla) {
      return;
    }

    if (!state[dateKey]) {
      state[dateKey] = {};
    }
    state[dateKey][sigla] = isMarked_(row[2]);
  });

  return Object.keys(state).reduce((highlights, dateKey) => {
    const siglas = Object.keys(state[dateKey]).filter((sigla) => state[dateKey][sigla]).sort();
    if (siglas.length) {
      highlights[dateKey] = siglas;
    }
    return highlights;
  }, {});
}

function isMarked_(value) {
  return value === true || /^(true|1|sim|x)$/i.test(String(value || "").trim());
}

function normalizeDateKey_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return brMatch ? `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}` : "";
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
