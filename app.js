(async function () {
  const fallbackData = window.SAHMT_DATA;
  const siglaPattern = /(?:[A-Z]{2}|L2)(?:[/-](?:[A-Z]{2}|L2))*/g;
  const siglaAliases = new Map([
    ["DC", ["AD", "CR", "LA", "LH"]]
  ]);
  const dcAliasesByWeekday = new Map([
    ["Segunda", ["CR", "LH"]],
    ["Terca", ["CR", "LH", "AD"]],
    ["Quarta", ["CR", "LH", "AD"]],
    ["Quinta", ["CR", "LH"]],
    ["Sexta", ["CR", "LA"]]
  ]);
  const scheduleSpreadsheetId = "11ayJbQFmFPzLegFZHL8kPKCvudpPo60O4NyR3i7aofA";
  const scheduleSheetSources = [
    ["SEGUNDA 2026", "Segunda"],
    ["TERCA 2026", "Terca"],
    ["QUARTA 2026", "Quarta"],
    ["QUINTA 2026", "Quinta"],
    ["SEXTA 2026", "Sexta"],
    ["SABADO 2026", "Sabado"],
    ["DOMINGO 2026", "Domingo"]
  ];
  const vacationSheetTitle = "FERIAS 2026";

  const todayKey = formatKey(new Date());
  let data = null;
  let byDate = new Map();
  let orderedDates = [];

  const elements = {
    dateInput: document.getElementById("dateInput"),
    prevButton: document.getElementById("prevButton"),
    todayButton: document.getElementById("todayButton"),
    nextButton: document.getElementById("nextButton"),
    rangeLabel: document.getElementById("rangeLabel"),
    outOfRangeNotice: document.getElementById("outOfRangeNotice"),
    scheduleHeading: document.getElementById("scheduleHeading"),
    formattedDate: document.getElementById("formattedDate"),
    todayBadge: document.getElementById("todayBadge"),
    weekdayBadge: document.getElementById("weekdayBadge"),
    emptyState: document.getElementById("emptyState"),
    siglasGrid: document.getElementById("siglasGrid")
  };

  if (elements.formattedDate) {
    elements.formattedDate.textContent = "Carregando escala...";
  }

  data = fallbackData;

  if (!data || !Array.isArray(data.days) || data.days.length === 0) {
    try {
      data = await loadScheduleDataWithTimeout(6000);
    } catch (error) {
      throw new Error("Dados da escala nao encontrados.");
    }
  }

  applyScheduleData(data);
  elements.dateInput.value = clampKey(todayKey);

  elements.dateInput.addEventListener("change", () => {
    render(clampKey(elements.dateInput.value));
  });

  elements.prevButton.addEventListener("click", () => {
    render(shiftDate(elements.dateInput.value, -1));
  });

  elements.nextButton.addEventListener("click", () => {
    render(shiftDate(elements.dateInput.value, 1));
  });

  elements.todayButton.addEventListener("click", () => {
    render(clampKey(todayKey));
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js?v=20260812-1", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }

  render(elements.dateInput.value);
  refreshScheduleFromSheet();

  function applyScheduleData(scheduleData) {
    data = scheduleData;
    byDate = new Map(data.days.map((day) => [day.date, day]));
    orderedDates = data.days.map((day) => day.date).sort();
    elements.rangeLabel.textContent = `${formatShort(orderedDates[0])} - ${formatShort(orderedDates[orderedDates.length - 1])}`;
    elements.dateInput.min = orderedDates[0];
    elements.dateInput.max = orderedDates[orderedDates.length - 1];
  }

  function refreshScheduleFromSheet() {
    loadScheduleDataWithTimeout(12000)
      .then((liveData) => {
        if (!Array.isArray(liveData?.days) || !liveData.days.length) {
          return;
        }

        const selectedDate = elements.dateInput.value;
        applyScheduleData(liveData);
        render(clampKey(selectedDate));
      })
      .catch(() => {});
  }

  function render(dateKey) {
    elements.dateInput.value = dateKey;
    const day = byDate.get(dateKey);
    const isToday = dateKey === todayKey;

    elements.scheduleHeading.textContent = isToday ? "Data atual" : "Dia selecionado";
    toggle(elements.todayBadge, isToday);
    toggle(elements.outOfRangeNotice, !day);

    if (!day) {
      elements.formattedDate.textContent = formatLong(dateKey);
      elements.weekdayBadge.textContent = "";
      elements.emptyState.classList.remove("hidden");
      elements.siglasGrid.innerHTML = "";
      return;
    }

    elements.formattedDate.textContent = formatLong(day.date);
    elements.weekdayBadge.textContent = day.weekdayLabel;
    elements.emptyState.classList.add("hidden");
    renderSiglas(day.siglas, day.weekdayLabel, day.date);
  }

  function renderSiglas(siglas, weekdayLabel, dateKey) {
    elements.siglasGrid.innerHTML = "";
    const vacationSiglas = getVacationSiglasForDate(dateKey);
    const vacationOrder = getVacationOrderForDate(dateKey);
    const scheduledVacationSiglas = getScheduledVacationSiglas(siglas, vacationSiglas);
    const showVacationPositions = scheduledVacationSiglas.size > 1;

    siglas.forEach((sigla, index) => {
      const item = document.createElement("div");
      item.className = "sigla-item";

      const token = document.createElement("div");
      token.className = "sigla-token";
      token.setAttribute("role", "status");

      const dcVacationSiglas = getDcVacationSiglas(sigla, vacationSiglas, weekdayLabel);
      appendSiglaDisplay(token, sigla, vacationSiglas, vacationOrder, showVacationPositions);

      if (dcVacationSiglas.length) {
        token.appendChild(document.createTextNode(" - "));
        dcVacationSiglas.forEach((vacationSigla, position) => {
          if (position > 0) {
            token.appendChild(document.createTextNode(", "));
          }

          token.appendChild(
            createVacationSiglaNode(
              vacationSigla,
              "dc-vacation-sigla",
              getVacationPosition(vacationSigla, vacationOrder, showVacationPositions)
            )
          );
        });
      }

      if (isWholeSiglaOnVacation(sigla, vacationSiglas)) {
        token.classList.add("sigla-token--vacation");
      }

      const counter = document.createElement("div");
      counter.className = "sigla-index";
      counter.textContent = String(index + 1);

      item.appendChild(token);
      item.appendChild(counter);
      elements.siglasGrid.appendChild(item);
    });
  }

  function getVacationSiglasForDate(dateKey) {
    return new Set(getVacationOrderForDate(dateKey));
  }

  function getVacationOrderForDate(dateKey) {
    const label = String(byDate.get(dateKey)?.vacationLabel || "");
    return extractSiglas(label.split("(")[0]);
  }

  function getVacationPosition(sigla, vacationOrder, showVacationPositions) {
    if (!showVacationPositions || !Array.isArray(vacationOrder) || vacationOrder.length < 2) {
      return 0;
    }

    const index = vacationOrder.indexOf(sigla);
    return index === -1 ? 0 : index + 1;
  }

  function getScheduledVacationSiglas(siglas, vacationSiglas) {
    const scheduled = new Set();

    siglas.forEach((sigla) => {
      extractSiglas(sigla).forEach((part) => {
        if (vacationSiglas.has(part)) {
          scheduled.add(part);
        }
      });
    });

    return scheduled;
  }

  function appendSiglaDisplay(token, sigla, vacationSiglas, vacationOrder, showVacationPositions) {
    const parts = String(sigla || "").toUpperCase().split(/([/-])/);
    const isCombinedSigla = parts.some((part) => part === "/" || part === "-");

    parts.forEach((part) => {
      if (!/^(?:[A-Z]{2}|L2)$/.test(part)) {
        token.appendChild(document.createTextNode(part));
        return;
      }

      const partWrap = document.createElement("span");
      partWrap.className = "sigla-token__part";

      if (vacationSiglas.has(part)) {
        partWrap.appendChild(
          createVacationSiglaNode(
            part,
            isCombinedSigla ? "sigla-token__vacation-part" : "sigla-token__vacation-label",
            getVacationPosition(part, vacationOrder, showVacationPositions)
          )
        );
      } else {
        partWrap.appendChild(document.createTextNode(part));
      }

      token.appendChild(partWrap);
    });
  }

  function createVacationSiglaNode(sigla, className, position) {
    const vacationPart = document.createElement("span");
    vacationPart.className = className;
    vacationPart.textContent = sigla;

    if (!position) {
      return vacationPart;
    }

    const wrap = document.createElement("span");
    wrap.className = "sigla-token__vacation-wrap";
    wrap.appendChild(vacationPart);

    const marker = document.createElement("span");
    marker.className = "sigla-token__position";
    marker.textContent = String(position);
    marker.setAttribute("aria-hidden", "true");
    wrap.appendChild(marker);
    return wrap;
  }

  function isWholeSiglaOnVacation(sigla, vacationSiglas) {
    if (!vacationSiglas || vacationSiglas.size === 0 || /[/-]/.test(sigla)) {
      return false;
    }

    return vacationSiglas.has(String(sigla || "").trim().toUpperCase());
  }

  function getDcVacationSiglas(sigla, vacationSiglas, weekdayLabel) {
    if (sigla !== "DC" || !vacationSiglas || vacationSiglas.size === 0) {
      return [];
    }

    return (dcAliasesByWeekday.get(weekdayLabel) || []).filter((value) => vacationSiglas.has(value));
  }

  function extractSiglas(token) {
    const normalized = String(token || "").toUpperCase();
    if (siglaAliases.has(normalized)) {
      return [...siglaAliases.get(normalized)];
    }

    const matches = normalized.match(siglaPattern);
    if (!matches) {
      return [];
    }

    return matches
      .flatMap((value) => value.split(/[/-]/))
      .flatMap((value) => (siglaAliases.has(value) ? siglaAliases.get(value) : [value]))
      .filter(Boolean);
  }

  function shiftDate(dateKey, delta) {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() + delta);
    return clampKey(formatKey(date));
  }

  function clampKey(dateKey) {
    if (dateKey < orderedDates[0]) {
      return orderedDates[0];
    }
    if (dateKey > orderedDates[orderedDates.length - 1]) {
      return orderedDates[orderedDates.length - 1];
    }
    return dateKey;
  }

  function formatKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatShort(dateKey) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(`${dateKey}T12:00:00`));
  }

  function formatLong(dateKey) {
    const value = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(new Date(`${dateKey}T12:00:00`));

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function toggle(element, show) {
    element.classList.toggle("hidden", !show);
  }

  async function loadScheduleData() {
    const scheduleDays = [];
    const vacationData = await loadVacationData();
    const vacationsByDate = buildVacationLookup(vacationData.vacations);
    const scheduleRowsBySource = await Promise.all(
      scheduleSheetSources.map(async ([sheetTitle, weekdayLabel]) => ({
        weekdayLabel,
        rows: await fetchScheduleSheetRows(sheetTitle)
      }))
    );

    for (const { weekdayLabel, rows } of scheduleRowsBySource) {
      if (!rows.length) {
        continue;
      }

      rows.forEach((row) => {
        const date = normalizeSheetDate(row[0]);
        if (!date) {
          return;
        }

        const siglas = row
          .slice(1)
          .map((value) => String(value || "").trim())
          .filter(Boolean);

        if (!siglas.length) {
          return;
        }

        scheduleDays.push({
          date,
          weekdayLabel,
          siglas,
          vacationLabel: vacationsByDate.get(date) || null
        });
      });
    }

    if (!scheduleDays.length) {
      if (fallbackData?.days?.length) {
        return fallbackData;
      }

      throw new Error("Nao foi possivel carregar as escalas da planilha.");
    }

    scheduleDays.sort((left, right) => left.date.localeCompare(right.date));

    return {
      appName: fallbackData?.appName || "Eventos de Escala",
      days: scheduleDays,
      vacations: vacationData.vacations
    };
  }

  function loadScheduleDataWithTimeout(timeoutMs) {
    return Promise.race([
      loadScheduleData(),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("Tempo esgotado ao atualizar a escala.")), timeoutMs);
      })
    ]);
  }

  async function loadVacationData() {
    const fallbackVacations = Array.isArray(fallbackData?.vacations) ? fallbackData.vacations : [];
    let rows = [];

    try {
      rows = await fetchVacationSheetRows();
    } catch (error) {
      return { vacations: fallbackVacations };
    }

    const vacations = rows
      .map((row) => {
        const start = normalizeSheetDate(row[2]);
        const end = normalizeSheetDate(row[3]);
        const label = String(row[4] || "").trim();

        if (!start || !end || !label) {
          return null;
        }

        return { start, end, label };
      })
      .filter(Boolean);

    return {
      vacations: vacations.length ? vacations : fallbackVacations
    };
  }

  async function fetchScheduleSheetRows(sheetTitle) {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${scheduleSpreadsheetId}/gviz/tq`);
    url.searchParams.set("tqx", "out:csv");
    url.searchParams.set("sheet", sheetTitle);
    url.searchParams.set("range", "A3:R400");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar aba ${sheetTitle}: ${response.status}`);
    }

    const csvText = await response.text();
    return parseCsvRows(csvText).filter((row) => row.some((cell) => String(cell || "").trim()));
  }

  async function fetchVacationSheetRows() {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${scheduleSpreadsheetId}/gviz/tq`);
    url.searchParams.set("tqx", "out:csv");
    url.searchParams.set("sheet", vacationSheetTitle);
    url.searchParams.set("range", "A3:F80");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar aba ${vacationSheetTitle}: ${response.status}`);
    }

    const csvText = await response.text();
    return parseCsvRows(csvText).filter((row) => {
      const month = String(row[0] || "").trim();
      const start = String(row[2] || "").trim();
      const end = String(row[3] || "").trim();
      const label = String(row[4] || "").trim();
      return Boolean(month && start && end && label);
    });
  }

  function buildVacationLookup(vacations) {
    const lookup = new Map();

    vacations.forEach((vacation) => {
      const startDate = new Date(`${vacation.start}T12:00:00`);
      const endDate = new Date(`${vacation.end}T12:00:00`);

      for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
        lookup.set(formatKey(cursor), vacation.label);
      }
    });

    return lookup;
  }

  function parseCsvRows(csvText) {
    const rows = [];
    let row = [];
    let cell = "";
    let insideQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
      const char = csvText[index];
      const nextChar = csvText[index + 1];

      if (char === "\"") {
        if (insideQuotes && nextChar === "\"") {
          cell += "\"";
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (char === "," && !insideQuotes) {
        row.push(cell.trim());
        cell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          index += 1;
        }

        row.push(cell.trim());
        if (row.some((value) => value !== "")) {
          rows.push(row);
        }
        row = [];
        cell = "";
        continue;
      }

      cell += char;
    }

    if (cell.length || row.length) {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
    }

    return rows;
  }

  function normalizeSheetDate(value) {
    const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      return null;
    }

    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
})();
