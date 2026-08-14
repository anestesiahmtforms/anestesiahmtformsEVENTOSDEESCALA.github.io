// Apps Script de referencia operacional para o envio do modal "Lancamento do evento".
// Planilha alvo: 1WAeUMVOj21LEsWOE7RzsoSF_2QW1mQnMBxZuWupWnCI
// Aba alvo: Registros
// Endpoint implantado e confirmado em 14/08/2026:
// https://script.google.com/macros/s/AKfycbx5qHJcAWk0dVGEvd9xnxeW6t7WgLE4nuDw8_pWRb26lh0KCUK4kEGoj4KzKGELenXZ/exec
const EVENTOS_SPREADSHEET_ID = '1WAeUMVOj21LEsWOE7RzsoSF_2QW1mQnMBxZuWupWnCI';
const EVENTOS_REGISTROS_SHEET = 'Registros';
const EVENTOS_HEADERS = [
  'Timestamp',
  'Data do Evento',
  'MEMBRO (AUSENTE/ATRASADO)',
  'Tipo de Evento',
  'Descricao do evento',
  'Multiplo do atraso',
  'SUBSTITUTO',
  'TURNO',
  'PAGADOR',
  'CREDOR',
  'VALOR A PAGAR',
  'ORIGEM'
];

function doGet() {
  return jsonResponse_({
    ok: true,
    spreadsheetId: EVENTOS_SPREADSHEET_ID,
    sheetName: EVENTOS_REGISTROS_SHEET,
    message: 'Apps Script de registros ativo.'
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const row = buildRow_(payload);
    const lock = LockService.getDocumentLock();
    lock.waitLock(20000);

    try {
      const sheet = getRegistrosSheet_();
      ensureHeaders_(sheet);
      sheet.appendRow(row);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_({
      ok: true,
      message: 'Registro salvo.',
      savedAt: row[0]
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      message: error && error.message ? error.message : String(error)
    });
  }
}

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  const payload = JSON.parse(raw);

  const normalized = {
    dataDoEvento: pickFirstValue_(payload, ['dataDoEvento', 'data']),
    membro: pickFirstValue_(payload, ['membroAusenteAtrasado', 'ausente']),
    tipo: pickFirstValue_(payload, ['tipoDeEvento', 'evento']),
    descricao: pickFirstValue_(payload, ['descricaoDoEvento', 'eventoDescricao']),
    multiplo: pickFirstValue_(payload, ['multiploDoAtraso', 'atrasoTempo']),
    substituto: pickFirstValue_(payload, ['membroSubstituto', 'presente']),
    turno: pickFirstValue_(payload, ['turno']),
    pagador: pickFirstValue_(payload, ['pagador', 'devedor', 'responsavelPeloOnus']),
    credor: pickFirstValue_(payload, ['credor', 'resultadoCredor']),
    valor: pickFirstValue_(payload, ['valorAPagar', 'valorPagar']),
    origem: pickFirstValue_(payload, ['origem']),
    criadoEm: pickFirstValue_(payload, ['criadoEmIso', 'criadoEm'])
  };

  if (!normalized.dataDoEvento) {
    throw new Error('Data do Evento e obrigatoria.');
  }
  if (!normalized.membro) {
    throw new Error('MEMBRO (AUSENTE/ATRASADO) e obrigatorio.');
  }
  if (!normalized.tipo) {
    throw new Error('Tipo de Evento e obrigatorio.');
  }
  if (!normalized.pagador) {
    throw new Error('PAGADOR e obrigatorio.');
  }
  if (!normalized.credor) {
    throw new Error('CREDOR e obrigatorio.');
  }
  if (!normalized.valor) {
    throw new Error('VALOR A PAGAR e obrigatorio.');
  }

  return normalized;
}

function buildRow_(payload) {
  const timestamp = normalizeTimestamp_(payload.criadoEm || new Date());
  const dataDoEvento = normalizeDateText_(payload.dataDoEvento);

  return [
    timestamp,
    dataDoEvento,
    payload.membro,
    payload.tipo,
    payload.descricao,
    payload.multiplo,
    payload.substituto,
    payload.turno,
    payload.pagador,
    payload.credor,
    payload.valor,
    payload.origem || 'PWA Eventos de escala'
  ];
}

function getRegistrosSheet_() {
  const spreadsheet = SpreadsheetApp.openById(EVENTOS_SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(EVENTOS_REGISTROS_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(EVENTOS_REGISTROS_SHEET);
  }

  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, EVENTOS_HEADERS.length).setValues([EVENTOS_HEADERS]);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, EVENTOS_HEADERS.length).getDisplayValues()[0];
  const needsUpdate = EVENTOS_HEADERS.some(function (header, index) {
    return String(currentHeaders[index] || '').trim() !== header;
  });

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, EVENTOS_HEADERS.length).setValues([EVENTOS_HEADERS]);
  }
}

function pickFirstValue_(source, keys) {
  for (var index = 0; index < keys.length; index += 1) {
    var key = keys[index];
    var value = source && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : '';
    var text = String(value || '').trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function normalizeDateText_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  var text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  var brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return brMatch[3] + '-' + brMatch[2] + '-' + brMatch[1];
  }

  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    return text;
  }

  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function normalizeTimestamp_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }

  var text = String(value || '').trim();
  if (!text) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }

  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    return text;
  }

  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
