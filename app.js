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
  const eventListsSpreadsheetId = "1WAeUMVOj21LEsWOE7RzsoSF_2QW1mQnMBxZuWupWnCI";
  const eventListsSheetTitle = "Listas";
  const recordsSheetTitle = "Registros";
  const syncConfig = window.SAHMT_SYNC_CONFIG || {};
  // Endpoint operacional do envio de eventos.
  // Referencia de codigo-fonte: tools/apps-script/SAHMT-eventos-registros.gs
  // Implantacao ativa confirmada em 14/08/2026:
  // https://script.google.com/macros/s/AKfycbx5qHJcAWk0dVGEvd9xnxeW6t7WgLE4nuDw8_pWRb26lh0KCUK4kEGoj4KzKGELenXZ/exec
  const eventEntryConfig = {
    endpointUrl: "https://script.google.com/macros/s/AKfycbx5qHJcAWk0dVGEvd9xnxeW6t7WgLE4nuDw8_pWRb26lh0KCUK4kEGoj4KzKGELenXZ/exec",
    requestTimeoutMs: 15000
  };
  const siglaStateStorageKey = "sahmt-sigla-checks-v1";
  const siglaEventStateStorageKey = "sahmt-sigla-events-v1";
  const clientIdStorageKey = "sahmt-client-id-v1";
  const sharedStateEndpoint = normalizeEndpoint(syncConfig.endpoint);
  const syncPollIntervalMs = Number(syncConfig.pollIntervalMs) > 0 ? Number(syncConfig.pollIntervalMs) : 20000;
  const sharedPendingTtlMs = Number(syncConfig.pendingTtlMs) > 0 ? Number(syncConfig.pendingTtlMs) : 180000;

  const todayKey = formatKey(new Date());
  const siglaCheckState = loadSiglaCheckState();
  const clientId = getOrCreateClientId();
  let data = null;
  let byDate = new Map();
  let orderedDates = [];
  let deferredInstallPrompt = null;
  let sharedStateHash = serializeSiglaState(siglaCheckState);
  let sharedStateTimer = null;
  const pendingSharedUpdates = new Map();
  const siglaEventState = loadSiglaEventState();
  let eventRecords = [];
  let memberDirectory = buildFallbackMemberDirectory();
  let dcMemberOptions = buildFallbackDcOptions();
  let eventFieldOptions = buildFallbackEventFieldOptions();
  let eventTypeDefaults = buildFallbackEventTypeDefaults();
  let siglaChoiceResolver = null;
  let activeEventLaunch = null;

  const elements = {
    dateInput: document.getElementById("dateInput"),
    eventDateInput: document.getElementById("eventDateInput"),
    eventEntryForm: document.getElementById("eventEntryForm"),
    openEventEntryModal: document.getElementById("openEventEntryModal"),
    eventEntryModal: document.getElementById("eventEntryModal"),
    eventEntryBackdrop: document.getElementById("eventEntryBackdrop"),
    closeEventEntryModal: document.getElementById("closeEventEntryModal"),
    siglaChoiceModal: document.getElementById("siglaChoiceModal"),
    siglaChoiceBackdrop: document.getElementById("siglaChoiceBackdrop"),
    closeSiglaChoiceModal: document.getElementById("closeSiglaChoiceModal"),
    siglaChoiceTitle: document.getElementById("siglaChoiceTitle"),
    siglaChoiceDescription: document.getElementById("siglaChoiceDescription"),
    siglaChoiceOptions: document.getElementById("siglaChoiceOptions"),
    submitEventEntryButton: document.getElementById("submitEventEntryButton"),
    eventEntryStatus: document.getElementById("eventEntryStatus"),
    memberStatusInput: document.getElementById("memberStatusInput"),
    eventTypeInput: document.getElementById("eventTypeInput"),
    eventDescriptionInput: document.getElementById("eventDescriptionInput"),
    delayMultipleInput: document.getElementById("delayMultipleInput"),
    substituteInput: document.getElementById("substituteInput"),
    shiftInput: document.getElementById("shiftInput"),
    payerInput: document.getElementById("payerInput"),
    creditorInput: document.getElementById("creditorInput"),
    amountToPayInput: document.getElementById("amountToPayInput"),
    originInput: document.getElementById("originInput"),
    prevButton: document.getElementById("prevButton"),
    todayButton: document.getElementById("todayButton"),
    nextButton: document.getElementById("nextButton"),
    installButton: document.getElementById("installButton"),
    recordsDateInput: document.getElementById("recordsDateInput"),
    recordsLoadingState: document.getElementById("recordsLoadingState"),
    recordsEmptyState: document.getElementById("recordsEmptyState"),
    recordsList: document.getElementById("recordsList"),
    rangeLabel: document.getElementById("rangeLabel"),
    outOfRangeNotice: document.getElementById("outOfRangeNotice"),
    scheduleHeading: document.getElementById("scheduleHeading"),
    formattedDate: document.getElementById("formattedDate"),
    todayBadge: document.getElementById("todayBadge"),
    weekdayBadge: document.getElementById("weekdayBadge"),
    emptyState: document.getElementById("emptyState"),
    siglasGrid: document.getElementById("siglasGrid"),
    vacationCard: document.getElementById("vacationCard")
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
  if (elements.recordsDateInput) {
    elements.recordsDateInput.value = todayKey;
  }
  populateEventEntryOptionLists();
  hydrateMemberDirectory().catch(() => {});
  hydrateEventRecords().catch(() => {});
  hydrateSharedSiglaState().then(() => render(elements.dateInput.value)).catch(() => {});

  elements.dateInput.addEventListener("change", () => {
    render(clampKey(elements.dateInput.value));
  });

  elements.recordsDateInput?.addEventListener("change", () => {
    renderRecordsForDate(elements.recordsDateInput.value || todayKey);
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

  if (elements.openEventEntryModal) {
    elements.openEventEntryModal.addEventListener("click", openEventEntryModal);
  }

  if (elements.closeEventEntryModal) {
    elements.closeEventEntryModal.addEventListener("click", closeEventEntryModal);
  }

  if (elements.eventEntryBackdrop) {
    elements.eventEntryBackdrop.addEventListener("click", closeEventEntryModal);
  }

  if (elements.closeSiglaChoiceModal) {
    elements.closeSiglaChoiceModal.addEventListener("click", () => closeSiglaChoiceModal(null));
  }

  if (elements.siglaChoiceBackdrop) {
    elements.siglaChoiceBackdrop.addEventListener("click", () => closeSiglaChoiceModal(null));
  }

  if (elements.eventEntryForm) {
    elements.eventEntryForm.addEventListener("submit", onEventEntrySubmit);
  }

  if (elements.eventTypeInput) {
    elements.eventTypeInput.addEventListener("change", () => {
      const normalizedEventType = normalizeEventType(elements.eventTypeInput.value);
      if (normalizedEventType === "atraso" && elements.delayMultipleInput) {
        elements.delayMultipleInput.value = "";
      }
      applyEventTypeDefaults();
      updateEventEntryState();
    });
  }

  elements.memberStatusInput?.addEventListener("input", updateEventEntryState);
  elements.substituteInput?.addEventListener("change", updateEventEntryState);
  elements.shiftInput?.addEventListener("change", updateEventEntryState);
  elements.delayMultipleInput?.addEventListener("change", updateEventEntryState);

  if (elements.installButton) {
    elements.installButton.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        return;
      }

      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      elements.installButton.classList.add("hidden");
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (elements.installButton) {
      elements.installButton.classList.remove("hidden");
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (elements.installButton) {
      elements.installButton.classList.add("hidden");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isSiglaChoiceModalOpen()) {
        closeSiglaChoiceModal(null);
        return;
      }
      closeEventEntryModal();
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js?v=20260814-5", { updateViaCache: "none" })
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
    if (elements.eventDateInput) {
      elements.eventDateInput.value = dateKey;
    }
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
      renderVacationLabel();
      return;
    }

    elements.formattedDate.textContent = formatLong(day.date);
    elements.weekdayBadge.textContent = day.weekdayLabel;
    elements.emptyState.classList.add("hidden");
    renderSiglas(day.siglas, day.weekdayLabel, day.date);
    renderVacationLabel();
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

      const token = document.createElement("button");
      token.className = "sigla-token sigla-button";
      token.type = "button";
      token.setAttribute("aria-label", `Mantenha pressionado por 3 segundos para marcar ou desmarcar a sigla ${sigla}.`);
      token.title = "Mantenha pressionado por 3 segundos para destacar.";
      bindSiglaInteractions(token, sigla, weekdayLabel, dateKey);

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

      if (isSiglaChecked(dateKey, sigla)) {
        token.classList.add("sigla-token--checked");
        token.setAttribute("aria-pressed", "true");
      }

      if (!isWholeSiglaOnVacation(sigla, vacationSiglas) && shouldHighlightEventSigla(dateKey, sigla)) {
        token.classList.add("sigla-token--event");
      }

      const counter = document.createElement("div");
      counter.className = "sigla-index";
      counter.textContent = String(index + 1);

      item.appendChild(token);
      item.appendChild(counter);
      elements.siglasGrid.appendChild(item);
    });
  }

  function bindSiglaInteractions(token, sigla, weekdayLabel, dateKey) {
    const holdDurationMs = 3000;
    let holdTimer = null;
    let holdCompleted = false;

    const clearHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      token.classList.remove("sigla-button--pressing");
    };

    token.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      holdCompleted = false;
      token.setPointerCapture?.(event.pointerId);
      token.classList.add("sigla-button--pressing");
      holdTimer = window.setTimeout(async () => {
        holdTimer = null;
        holdCompleted = true;
        token.classList.remove("sigla-button--pressing");
        await toggleSiglaCheck(token, dateKey, sigla);
      }, holdDurationMs);
    });

    token.addEventListener("pointerup", () => {
      clearHold();
    });

    token.addEventListener("pointercancel", clearHold);
    token.addEventListener("lostpointercapture", clearHold);
    token.addEventListener("click", async () => {
      if (holdCompleted) {
        holdCompleted = false;
        return;
      }

      await handleSiglaClick(sigla, weekdayLabel, dateKey);
    });
    token.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
      }
    });
  }

  async function toggleSiglaCheck(token, dateKey, sigla) {
    const marked = !token.classList.contains("sigla-token--checked");
    applySiglaCheckAppearance(token, marked);

    if (!dateKey || !sigla) {
      return;
    }

    updateSiglaCheckState(dateKey, sigla, marked);
    persistSiglaCheckState();
    registerPendingSharedUpdate(dateKey, sigla, marked);

    if (!sharedStateEndpoint) {
      return;
    }

    try {
      const remoteState = await pushSharedSiglaCheck(dateKey, sigla, marked);
      if (remoteState) {
        replaceSiglaCheckState(remoteState);
        render(elements.dateInput.value);
      }
    } catch (error) {
      // Keep the local optimistic state when the shared sync endpoint is unavailable.
    }
  }

  function isSiglaChecked(dateKey, sigla) {
    return Array.isArray(siglaCheckState[dateKey]) && siglaCheckState[dateKey].includes(sigla);
  }

  function loadSiglaCheckState() {
    try {
      const raw = window.localStorage.getItem(siglaStateStorageKey);

      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveSiglaCheckState() {
    try {
      window.localStorage.setItem(siglaStateStorageKey, JSON.stringify(siglaCheckState));
    } catch (error) {
      // Ignore storage failures to avoid blocking the UI on restricted browsers.
    }
  }

  function loadSiglaEventState() {
    try {
      const raw = window.localStorage.getItem(siglaEventStateStorageKey);

      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveSiglaEventState() {
    try {
      window.localStorage.setItem(siglaEventStateStorageKey, JSON.stringify(siglaEventState));
    } catch (error) {
      // Ignore storage failures to avoid blocking the UI on restricted browsers.
    }
  }

  function beginEventLaunch(sigla, dateKey) {
    if (!sigla || !dateKey) {
      activeEventLaunch = null;
      return;
    }

    activeEventLaunch = {
      sigla: String(sigla).trim().toUpperCase(),
      dateKey: String(dateKey).trim()
    };
    render(elements.dateInput?.value || dateKey);
  }

  function cancelActiveEventLaunch() {
    if (!activeEventLaunch) {
      return;
    }

    const currentDate = activeEventLaunch.dateKey;
    activeEventLaunch = null;
    render(elements.dateInput?.value || currentDate);
  }

  function commitActiveEventLaunch() {
    if (!activeEventLaunch?.dateKey || !activeEventLaunch?.sigla) {
      return;
    }

    const { dateKey, sigla } = activeEventLaunch;

    if (!Array.isArray(siglaEventState[dateKey])) {
      siglaEventState[dateKey] = [];
    }

    if (!siglaEventState[dateKey].includes(sigla)) {
      siglaEventState[dateKey].push(sigla);
    }

    saveSiglaEventState();
    activeEventLaunch = null;
    render(elements.dateInput?.value || dateKey);
  }

  function shouldHighlightEventSigla(dateKey, sigla) {
    const normalizedDate = String(dateKey || "").trim();
    const normalizedSigla = String(sigla || "").trim().toUpperCase();

    if (!normalizedDate || !normalizedSigla) {
      return false;
    }

    if (activeEventLaunch?.dateKey === normalizedDate && activeEventLaunch?.sigla === normalizedSigla) {
      return true;
    }

    return Array.isArray(siglaEventState[normalizedDate]) && siglaEventState[normalizedDate].includes(normalizedSigla);
  }

  function applySiglaCheckAppearance(token, marked) {
    token.classList.toggle("sigla-token--checked", marked);
    token.setAttribute("aria-pressed", marked ? "true" : "false");
  }

  function updateSiglaCheckState(dateKey, sigla, marked) {
    if (marked) {
      if (!Array.isArray(siglaCheckState[dateKey])) {
        siglaCheckState[dateKey] = [];
      }

      if (!siglaCheckState[dateKey].includes(sigla)) {
        siglaCheckState[dateKey].push(sigla);
      }
    } else if (Array.isArray(siglaCheckState[dateKey])) {
      siglaCheckState[dateKey] = siglaCheckState[dateKey].filter((value) => value !== sigla);

      if (siglaCheckState[dateKey].length === 0) {
        delete siglaCheckState[dateKey];
      }
    }
  }

  function persistSiglaCheckState() {
    sharedStateHash = serializeSiglaState(siglaCheckState);
    saveSiglaCheckState();
  }

  async function hydrateSharedSiglaState() {
    if (!sharedStateEndpoint) {
      return;
    }

    try {
      const remoteState = await fetchSharedSiglaState();
      if (remoteState) {
        replaceSiglaCheckState(remoteState);
      }
      startSharedStatePolling();
    } catch (error) {
      // If the endpoint is not configured or temporarily unavailable, keep local behavior.
    }
  }

  function startSharedStatePolling() {
    if (!sharedStateEndpoint || sharedStateTimer) {
      return;
    }

    sharedStateTimer = window.setInterval(async () => {
      try {
        const remoteState = await fetchSharedSiglaState();
        const mergedState = mergeSharedState(remoteState);
        const nextHash = serializeSiglaState(mergedState);

        if (nextHash && nextHash !== sharedStateHash) {
          replaceSiglaCheckState(mergedState);
          render(elements.dateInput.value);
        }
      } catch (error) {
        // Polling should fail silently to avoid interrupting the app UX.
      }
    }, syncPollIntervalMs);
  }

  async function fetchSharedSiglaState() {
    const url = new URL(sharedStateEndpoint);
    url.searchParams.set("spreadsheetId", scheduleSpreadsheetId);
    url.searchParams.set("sheetName", "DESTAQUES APP");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao sincronizar destaques: ${response.status}`);
    }

    const payload = await response.json();
    return normalizeSharedState(payload?.highlights);
  }

  async function pushSharedSiglaCheck(dateKey, sigla, marked) {
    const url = new URL(sharedStateEndpoint);
    url.searchParams.set("action", "set");
    url.searchParams.set("spreadsheetId", scheduleSpreadsheetId);
    url.searchParams.set("sheetName", "DESTAQUES APP");
    url.searchParams.set("date", dateKey);
    url.searchParams.set("sigla", sigla);
    url.searchParams.set("marked", marked ? "true" : "false");
    url.searchParams.set("updatedBy", clientId);
    url.searchParams.set("source", "PWA");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao gravar destaque compartilhado: ${response.status}`);
    }

    const payload = await response.json();
    return normalizeSharedState(payload?.highlights);
  }

  function replaceSiglaCheckState(nextState) {
    const mergedState = mergeSharedState(nextState);
    Object.keys(siglaCheckState).forEach((key) => delete siglaCheckState[key]);
    Object.entries(mergedState).forEach(([stateDateKey, siglas]) => {
      siglaCheckState[stateDateKey] = siglas;
    });
    persistSiglaCheckState();
  }

  function normalizeSharedState(rawState) {
    if (!rawState || typeof rawState !== "object") {
      return {};
    }

    return Object.entries(rawState).reduce((accumulator, [stateDateKey, siglas]) => {
      const normalizedDateKey = normalizeRemoteSharedDateKey(stateDateKey);
      if (!normalizedDateKey || !Array.isArray(siglas)) {
        return accumulator;
      }

      const normalizedSiglas = Array.from(
        new Set(
          siglas
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );

      if (normalizedSiglas.length) {
        accumulator[normalizedDateKey] = normalizedSiglas;
      }

      return accumulator;
    }, {});
  }

  function serializeSiglaState(state) {
    return JSON.stringify(
      Object.keys(state || {})
        .sort()
        .reduce((accumulator, stateDateKey) => {
          accumulator[stateDateKey] = [...(state[stateDateKey] || [])].sort();
          return accumulator;
        }, {})
    );
  }

  function registerPendingSharedUpdate(dateKey, sigla, marked) {
    pendingSharedUpdates.set(buildPendingKey(dateKey, sigla), {
      dateKey,
      sigla,
      marked,
      createdAt: Date.now()
    });
  }

  function mergeSharedState(rawState) {
    const baseState = normalizeSharedState(rawState);
    const now = Date.now();

    pendingSharedUpdates.forEach((entry, key) => {
      if (now - entry.createdAt > sharedPendingTtlMs) {
        pendingSharedUpdates.delete(key);
        return;
      }

      const isReflected = entry.marked
        ? stateHasSigla(baseState, entry.dateKey, entry.sigla)
        : !stateHasSigla(baseState, entry.dateKey, entry.sigla);

      if (isReflected) {
        pendingSharedUpdates.delete(key);
        return;
      }

      if (entry.marked) {
        if (!Array.isArray(baseState[entry.dateKey])) {
          baseState[entry.dateKey] = [];
        }

        if (!baseState[entry.dateKey].includes(entry.sigla)) {
          baseState[entry.dateKey].push(entry.sigla);
          baseState[entry.dateKey].sort();
        }
      } else if (Array.isArray(baseState[entry.dateKey])) {
        baseState[entry.dateKey] = baseState[entry.dateKey].filter((value) => value !== entry.sigla);
        if (baseState[entry.dateKey].length === 0) {
          delete baseState[entry.dateKey];
        }
      }
    });

    return baseState;
  }

  function stateHasSigla(state, dateKey, sigla) {
    return Array.isArray(state[dateKey]) && state[dateKey].includes(sigla);
  }

  function buildPendingKey(dateKey, sigla) {
    return `${dateKey}::${String(sigla || "").toUpperCase()}`;
  }

  function normalizeRemoteSharedDateKey(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return text;
    }

    const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return formatKey(parsed);
  }

  function getOrCreateClientId() {
    try {
      const stored = window.localStorage.getItem(clientIdStorageKey);
      if (stored) {
        return stored;
      }

      const created = `client-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(clientIdStorageKey, created);
      return created;
    } catch (error) {
      return `client-${Date.now()}`;
    }
  }

  function normalizeEndpoint(value) {
    const trimmed = String(value || "").trim();
    return trimmed || "";
  }

  async function handleSiglaClick(sigla, weekdayLabel, dateKey) {
    beginEventLaunch(sigla, dateKey);
    const choices = getMemberChoicesForSigla(sigla, weekdayLabel);

    if (!choices.length) {
      prefillMemberStatus(sigla, dateKey);
      openEventEntryModal();
      return;
    }

    if (choices.length === 1) {
      prefillMemberStatus(choices[0].name, dateKey);
      openEventEntryModal();
      return;
    }

    const selectedChoice = await openSiglaChoiceModal(sigla, choices);
    if (!selectedChoice) {
      cancelActiveEventLaunch();
      return;
    }

    prefillMemberStatus(selectedChoice.name, dateKey);
    openEventEntryModal();
  }

  function openEventEntryModal() {
    if (!elements.eventEntryModal) {
      return;
    }

    clearEventEntryStatus();
    updateEventEntryState();
    elements.eventEntryModal.classList.remove("hidden");
    elements.eventEntryModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeEventEntryModal() {
    if (!elements.eventEntryModal) {
      return;
    }

    elements.eventEntryModal.classList.add("hidden");
    elements.eventEntryModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    cancelActiveEventLaunch();
  }

  function prefillMemberStatus(memberName, dateKey) {
    if (elements.eventDateInput) {
      elements.eventDateInput.value = dateKey || elements.dateInput?.value || todayKey;
    }

    if (elements.memberStatusInput) {
      elements.memberStatusInput.value = memberName || "";
    }

    updateEventEntryState();
  }

  function openSiglaChoiceModal(sigla, choices) {
    if (!elements.siglaChoiceModal || !elements.siglaChoiceOptions) {
      return Promise.resolve(null);
    }

    if (elements.siglaChoiceTitle) {
      elements.siglaChoiceTitle.textContent = `Escolha o membro de ${sigla}`;
    }

    if (elements.siglaChoiceDescription) {
      elements.siglaChoiceDescription.textContent = "Selecione o nome para preencher automaticamente em MEMBRO (AUSENTE/ATRASADO).";
    }

    elements.siglaChoiceOptions.innerHTML = "";

    choices.forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-sheet__option";
      button.textContent = choice.label;
      button.addEventListener("click", () => closeSiglaChoiceModal(choice));
      elements.siglaChoiceOptions.appendChild(button);
    });

    elements.siglaChoiceModal.classList.remove("hidden");
    elements.siglaChoiceModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    return new Promise((resolve) => {
      siglaChoiceResolver = resolve;
    });
  }

  function closeSiglaChoiceModal(selectedChoice) {
    if (!elements.siglaChoiceModal) {
      return;
    }

    elements.siglaChoiceModal.classList.add("hidden");
    elements.siglaChoiceModal.setAttribute("aria-hidden", "true");

    if (!isEventEntryModalOpen()) {
      document.body.classList.remove("modal-open");
    }

    if (typeof siglaChoiceResolver === "function") {
      const resolver = siglaChoiceResolver;
      siglaChoiceResolver = null;
      resolver(selectedChoice || null);
    }
  }

  function isEventEntryModalOpen() {
    return Boolean(elements.eventEntryModal && !elements.eventEntryModal.classList.contains("hidden"));
  }

  function isSiglaChoiceModalOpen() {
    return Boolean(elements.siglaChoiceModal && !elements.siglaChoiceModal.classList.contains("hidden"));
  }

  async function onEventEntrySubmit(event) {
    event.preventDefault();

    if (!validateEventEntryForm()) {
      return;
    }

    const payload = buildEventEntryPayload();
    setEventEntrySubmitting(true);
    setEventEntryStatus("Salvando dados na planilha...", "");

    try {
      const result = await postEventEntryPayload(payload);
      const successMessage = `Enviado para a planilha com sucesso. ${result?.message || "Registro confirmado."}`;
      commitActiveEventLaunch();
      upsertRecentEventRecord(payload);
      renderRecordsForDate(elements.recordsDateInput?.value || todayKey);
      resetEventEntryForm(payload.dataDoEvento);
      hydrateEventRecords().catch(() => {});
      setEventEntryStatus(successMessage, "success");
      window.setTimeout(() => {
        closeEventEntryModal();
        window.alert(successMessage);
      }, 180);
    } catch (error) {
      const detail = String(error?.message || "").trim();
      setEventEntryStatus(
        `Nao foi possivel sincronizar agora.${detail ? ` ${detail}` : " Confira o endpoint e tente novamente."}`,
        "error"
      );
    } finally {
      setEventEntrySubmitting(false);
    }
  }

  function buildEventEntryPayload() {
    const eventDate = String(elements.eventDateInput?.value || "").trim();
    const memberStatus = String(elements.memberStatusInput?.value || "").trim();
    const eventType = String(elements.eventTypeInput?.value || "").trim();
    const eventDescription = String(elements.eventDescriptionInput?.value || "").trim();
    const delayMultiple = String(elements.delayMultipleInput?.value || "").trim();
    const substitute = String(elements.substituteInput?.value || "").trim();
    const shift = String(elements.shiftInput?.value || "").trim();
    const payer = String(elements.payerInput?.value || "").trim();
    const creditor = String(elements.creditorInput?.value || "").trim();
    const amountToPay = String(elements.amountToPayInput?.value || "").trim();
    const origin = "PWA Eventos de escala";
    const createdAtIso = new Date().toISOString();

    return {
      data: eventDate,
      dataDoEvento: eventDate,
      ausente: memberStatus,
      membroAusenteAtrasado: memberStatus,
      evento: eventType,
      tipoDeEvento: eventType,
      eventoDescricao: eventDescription,
      descricaoDoEvento: eventDescription,
      atrasoTempo: delayMultiple,
      multiploDoAtraso: delayMultiple,
      presente: substitute,
      membroSubstituto: substitute,
      turno: shift,
      devedor: payer,
      pagador: payer,
      responsavelPeloOnus: payer,
      credor: creditor,
      resultadoCredor: creditor,
      valorPagar: amountToPay,
      valorAPagar: amountToPay,
      origem: origin,
      criadoEm: createdAtIso,
      criadoEmIso: createdAtIso
    };
  }

  async function postEventEntryPayload(payload) {
    if (!eventEntryConfig.endpointUrl) {
      throw new Error("ENDPOINT_MISSING");
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), eventEntryConfig.requestTimeoutMs || 15000);

    try {
      const response = await fetch(eventEntryConfig.endpointUrl, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const rawText = await response.text().catch(() => "");
      const data = rawText ? JSON.parse(rawText) : {};

      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "REQUEST_FAILED");
      }

      return data;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function resetEventEntryForm(dateKey) {
    if (!elements.eventEntryForm) {
      return;
    }

    elements.eventEntryForm.reset();
    populateEventEntryOptionLists();

    if (elements.eventDateInput) {
      elements.eventDateInput.value = dateKey || elements.dateInput?.value || todayKey;
    }

    if (elements.originInput) {
      elements.originInput.value = "PWA Eventos de escala";
    }

    updateEventEntryState();
  }

  function validateEventEntryForm() {
    if (!elements.eventEntryForm) {
      return false;
    }

    const controls = [
      elements.eventDateInput,
      elements.memberStatusInput,
      elements.eventTypeInput,
      elements.eventDescriptionInput,
      elements.delayMultipleInput,
      elements.substituteInput,
      elements.shiftInput,
      elements.payerInput,
      elements.creditorInput,
      elements.amountToPayInput
    ].filter(Boolean);

    for (const control of controls) {
      const field = control.closest(".entry-field");
      const isVisible = !field?.classList.contains("hidden");
      const isRequired = control.required;
      const isDisabled = control.disabled;
      const value = String(control.value || "").trim();

      if (isVisible && isRequired && !isDisabled && !value) {
        const label = field?.querySelector("span")?.textContent || "campo obrigatorio";
        setEventEntryStatus(`Preencha o campo obrigatorio: ${label}.`, "error");
        control.focus();
        return false;
      }
    }

    if (!elements.eventEntryForm.reportValidity()) {
      return false;
    }

    return true;
  }

  function setEventEntrySubmitting(isSubmitting) {
    if (elements.submitEventEntryButton) {
      elements.submitEventEntryButton.disabled = isSubmitting;
      elements.submitEventEntryButton.textContent = isSubmitting ? "Salvando..." : "Salvar na planilha";
    }
  }

  function clearEventEntryStatus() {
    setEventEntryStatus("", "");
  }

  function setEventEntryStatus(message, tone) {
    if (!elements.eventEntryStatus) {
      return;
    }

    elements.eventEntryStatus.textContent = message;
    elements.eventEntryStatus.classList.toggle("hidden", !message);
    elements.eventEntryStatus.classList.toggle("is-error", tone === "error");
    elements.eventEntryStatus.classList.toggle("is-success", tone === "success");
  }

  async function hydrateMemberDirectory() {
    try {
      const rows = await fetchEventListsRows();
      const nextDirectory = new Map();
      const nextDcOptions = [];
      const nextFieldOptions = {
        eventTypes: [],
        delayMultiples: [],
        substitutes: [],
        shifts: [],
        payers: [],
        creditors: []
      };
      const nextEventTypeDefaults = new Map();

      rows.forEach((row) => {
        const devedorEntry = parseSiglaNameEntry(row[1]);
        if (devedorEntry) {
          nextDirectory.set(devedorEntry.sigla, devedorEntry);
        }

        const dcEntry = parseSiglaNameEntry(row[5]);
        if (dcEntry && !nextDcOptions.some((option) => option.sigla === dcEntry.sigla)) {
          nextDcOptions.push(dcEntry);
        }

        pushUniqueOption(nextFieldOptions.eventTypes, row[0]);
        pushUniqueOption(nextFieldOptions.delayMultiples, row[4]);
        pushUniqueOption(nextFieldOptions.shifts, row[3]);
        pushUniqueOption(nextFieldOptions.payers, row[1]);
        pushUniqueOption(nextFieldOptions.creditors, row[2]);

        const devedorName = extractDisplayName(row[1]);
        const creditorName = extractDisplayName(row[2]);
        if (devedorName && devedorName !== "CAIXA DA EQUIPE") {
          pushUniqueOption(nextFieldOptions.substitutes, devedorName);
        }
        if (creditorName && creditorName !== "CAIXA DA EQUIPE") {
          pushUniqueOption(nextFieldOptions.substitutes, creditorName);
        }

        const eventType = String(row[0] || "").trim();
        if (eventType) {
          nextEventTypeDefaults.set(eventType, {
            delayMultiple: String(row[4] || "").trim(),
            shift: String(row[3] || "").trim(),
            payer: String(row[1] || "").trim(),
            creditor: String(row[2] || "").trim()
          });
        }
      });

      if (nextDirectory.size) {
        memberDirectory = nextDirectory;
      }

      if (nextDcOptions.length) {
        dcMemberOptions = nextDcOptions;
      }

      if (nextFieldOptions.eventTypes.length) {
        eventFieldOptions = nextFieldOptions;
        populateEventEntryOptionLists();
      }

      if (nextEventTypeDefaults.size) {
        eventTypeDefaults = nextEventTypeDefaults;
      }
    } catch (error) {
      // Keep the built-in directory when the list sheet is temporarily unavailable.
    }
  }

  async function hydrateEventRecords() {
    toggle(elements.recordsLoadingState, true);

    try {
      eventRecords = await fetchEventRecordsRows();
    } catch (error) {
      eventRecords = [];
    } finally {
      toggle(elements.recordsLoadingState, false);
      renderRecordsForDate(elements.recordsDateInput?.value || todayKey);
    }
  }

  async function fetchEventRecordsRows() {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${eventListsSpreadsheetId}/gviz/tq`);
    url.searchParams.set("tqx", "out:csv");
    url.searchParams.set("sheet", recordsSheetTitle);
    url.searchParams.set("range", "A2:L2000");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar aba ${recordsSheetTitle}: ${response.status}`);
    }

    const csvText = await response.text();
    return parseCsvRows(csvText)
      .filter((row) => row.some((cell) => String(cell || "").trim()))
      .map((row) => ({
        timestamp: String(row[0] || "").trim(),
        dataDoEvento: normalizeRecordDate(row[1]),
        membro: String(row[2] || "").trim(),
        tipo: String(row[3] || "").trim(),
        descricao: String(row[4] || "").trim(),
        multiplo: String(row[5] || "").trim(),
        substituto: String(row[6] || "").trim(),
        turno: String(row[7] || "").trim(),
        pagador: String(row[8] || "").trim(),
        credor: String(row[9] || "").trim(),
        valor: String(row[10] || "").trim(),
        origem: String(row[11] || "").trim()
      }))
      .filter((record) => record.dataDoEvento);
  }

  function upsertRecentEventRecord(payload) {
    if (!payload) {
      return;
    }

    const nextRecord = {
      timestamp: formatRecordTimestamp(payload.criadoEmIso || payload.criadoEm || new Date().toISOString()),
      dataDoEvento: normalizeRecordDate(payload.dataDoEvento || payload.data),
      membro: String(payload.membroAusenteAtrasado || payload.ausente || "").trim(),
      tipo: String(payload.tipoDeEvento || payload.evento || "").trim(),
      descricao: String(payload.descricaoDoEvento || payload.eventoDescricao || "").trim(),
      multiplo: String(payload.multiploDoAtraso || payload.atrasoTempo || "").trim(),
      substituto: String(payload.membroSubstituto || payload.presente || "").trim(),
      turno: String(payload.turno || "").trim(),
      pagador: String(payload.pagador || payload.devedor || payload.responsavelPeloOnus || "").trim(),
      credor: String(payload.credor || payload.resultadoCredor || "").trim(),
      valor: String(payload.valorAPagar || payload.valorPagar || "").trim(),
      origem: String(payload.origem || "PWA Eventos de escala").trim()
    };

    if (!nextRecord.dataDoEvento) {
      return;
    }

    eventRecords = [
      nextRecord,
      ...eventRecords.filter((record) => !isSameEventRecord(record, nextRecord))
    ];
  }

  function isSameEventRecord(left, right) {
    return [
      left?.timestamp,
      left?.dataDoEvento,
      left?.membro,
      left?.tipo,
      left?.descricao,
      left?.multiplo,
      left?.substituto,
      left?.turno,
      left?.pagador,
      left?.credor,
      left?.valor
    ].join("||") === [
      right?.timestamp,
      right?.dataDoEvento,
      right?.membro,
      right?.tipo,
      right?.descricao,
      right?.multiplo,
      right?.substituto,
      right?.turno,
      right?.pagador,
      right?.credor,
      right?.valor
    ].join("||");
  }

  function formatRecordTimestamp(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value || "").trim();
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(parsed);
  }

  function renderRecordsForDate(dateKey) {
    if (!elements.recordsList || !elements.recordsEmptyState) {
      return;
    }

    const activeDate = String(dateKey || todayKey).trim();
    const records = eventRecords.filter((record) => record.dataDoEvento === activeDate);
    elements.recordsList.innerHTML = "";
    toggle(elements.recordsEmptyState, records.length === 0);

    records.forEach((record, index) => {
      const card = document.createElement("article");
      card.className = `record-card record-card--tone-${(index % 4) + 1}`;

      const title = document.createElement("p");
      title.className = "record-card__title";
      title.textContent = `${record.tipo || "Registro"}${record.timestamp ? ` • ${record.timestamp}` : ""}`;
      card.appendChild(title);

      const rows = document.createElement("div");
      rows.className = "record-card__rows";

      [
        ["Data do Evento", record.dataDoEvento],
        ["Membro", record.membro],
        ["Tipo de Evento", record.tipo],
        ["Descricao do evento", record.descricao],
        ["Multiplo do atraso", record.multiplo],
        ["Substituto", record.substituto],
        ["Turno", record.turno],
        ["Pagador", record.pagador],
        ["Credor", record.credor],
        ["Valor a pagar", record.valor],
        ["Origem", record.origem]
      ]
        .filter(([, value]) => String(value || "").trim())
        .forEach(([label, value]) => {
          const row = document.createElement("div");
          row.className = "record-card__row";

          const labelElement = document.createElement("span");
          labelElement.className = "record-card__label";
          labelElement.textContent = label;

          const valueElement = document.createElement("span");
          valueElement.className = "record-card__value";
          valueElement.textContent = value;

          row.appendChild(labelElement);
          row.appendChild(valueElement);
          rows.appendChild(row);
        });

      card.appendChild(rows);
      elements.recordsList.appendChild(card);
    });
  }

  function normalizeRecordDate(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return formatKey(parsed);
  }

  function populateEventEntryOptionLists() {
    setSelectOptions(elements.eventTypeInput, eventFieldOptions.eventTypes, "Selecione o tipo de evento");
    setSelectOptions(elements.delayMultipleInput, eventFieldOptions.delayMultiples, "Selecione o multiplo");
    setSelectOptions(elements.substituteInput, eventFieldOptions.substitutes, "Selecione o substituto");
    setSelectOptions(elements.shiftInput, eventFieldOptions.shifts, "Selecione o turno");
    setSelectOptions(elements.payerInput, eventFieldOptions.payers, "Selecione o pagador");
    setSelectOptions(elements.creditorInput, eventFieldOptions.creditors, "Selecione o credor");
    updateEventEntryState();
  }

  function setSelectOptions(select, options, placeholder) {
    if (!select) {
      return;
    }

    const currentValue = String(select.value || "").trim();
    select.innerHTML = "";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
    placeholderOption.selected = !currentValue;
    select.appendChild(placeholderOption);

    options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      option.selected = currentValue === optionValue;
      select.appendChild(option);
    });

    if (currentValue && !options.includes(currentValue)) {
      const dynamicOption = document.createElement("option");
      dynamicOption.value = currentValue;
      dynamicOption.textContent = currentValue;
      dynamicOption.selected = true;
      select.appendChild(dynamicOption);
    }
  }

  function applyEventTypeDefaults() {
    const eventType = String(elements.eventTypeInput?.value || "").trim();
    if (!eventType || !eventTypeDefaults.has(eventType)) {
      return;
    }

    const defaults = eventTypeDefaults.get(eventType);

    if (elements.shiftInput && defaults.shift) {
      setSelectControlValue(elements.shiftInput, defaults.shift);
    }

    if (elements.payerInput && defaults.payer) {
      setSelectControlValue(elements.payerInput, defaults.payer);
    }

    if (elements.creditorInput && defaults.creditor) {
      setSelectControlValue(elements.creditorInput, defaults.creditor);
    }
  }

  function updateEventEntryState() {
    const eventType = String(elements.eventTypeInput?.value || "").trim();
    const normalizedEventType = normalizeEventType(eventType);
    const memberName = String(elements.memberStatusInput?.value || "").trim();
    const substitute = String(elements.substituteInput?.value || "").trim();
    const shift = String(elements.shiftInput?.value || "").trim();
    const delayMultiple = Number.parseFloat(String(elements.delayMultipleInput?.value || "").replace(",", "."));
    const rule = getEventEntryRule(normalizedEventType);

    toggleEventField(elements.eventDescriptionInput, rule.showDescription);
    toggleEventField(elements.delayMultipleInput, rule.showDelayMultiple);
    toggleEventField(elements.substituteInput, !rule.hideSubstitute);
    toggleEventField(elements.shiftInput, rule.showShift);

    setFieldDisabled(elements.substituteInput, rule.disableSubstitute);
    setFieldRequired(elements.eventDateInput, true);
    setFieldRequired(elements.memberStatusInput, true);
    setFieldRequired(elements.eventTypeInput, true);
    setFieldRequired(elements.eventDescriptionInput, rule.showDescription);
    setFieldRequired(elements.delayMultipleInput, rule.showDelayMultiple);
    setFieldRequired(elements.substituteInput, !rule.hideSubstitute && !rule.disableSubstitute);
    setFieldRequired(elements.shiftInput, rule.showShift);
    setFieldRequired(elements.payerInput, true);
    setFieldRequired(elements.creditorInput, true);
    setFieldRequired(elements.amountToPayInput, true);

    if (rule.disableSubstitute && elements.substituteInput) {
      elements.substituteInput.value = "";
    }

    if (!rule.showDescription && elements.eventDescriptionInput) {
      elements.eventDescriptionInput.value = "";
    }

    if (!rule.showDelayMultiple && elements.delayMultipleInput) {
      elements.delayMultipleInput.value = "";
    }

    if (!rule.showShift && elements.shiftInput) {
      elements.shiftInput.value = "";
    }

    if (elements.payerInput && rule.autoPayer) {
      setSelectControlValue(elements.payerInput, resolveEventEntryPayer(rule, memberName));
    }

    if (elements.creditorInput && rule.autoCreditor) {
      setSelectControlValue(elements.creditorInput, resolveEventEntryCreditor(rule, substitute));
    }

    if (elements.amountToPayInput && rule.autoAmount) {
      const amount = resolveEventEntryAmount(rule, shift, Number.isFinite(delayMultiple) ? delayMultiple : 0);
      elements.amountToPayInput.value = amount ? formatCurrencyInput(amount) : "";
    }
  }

  function getEventEntryRule(normalizedEventType) {
    if (normalizedEventType === "atraso") {
      return {
        showDescription: false,
        showDelayMultiple: true,
        hideSubstitute: true,
        showShift: false,
        disableSubstitute: true,
        autoPayer: true,
        autoCreditor: true,
        autoAmount: true,
        payerMode: "member",
        creditorMode: "team",
        amountMode: "delay"
      };
    }

    if (normalizedEventType === "suporte" || normalizedEventType === "gestao" || normalizedEventType === "congresso") {
      return {
        showDescription: false,
        showDelayMultiple: false,
        hideSubstitute: false,
        showShift: true,
        disableSubstitute: false,
        autoPayer: true,
        autoCreditor: true,
        autoAmount: false,
        payerMode: "team",
        creditorMode: "substitute",
        amountMode: "manual"
      };
    }

    if (normalizedEventType === "pessoal" || normalizedEventType === "ferias" || normalizedEventType === "saude") {
      return {
        showDescription: false,
        showDelayMultiple: false,
        hideSubstitute: false,
        showShift: true,
        disableSubstitute: false,
        autoPayer: true,
        autoCreditor: true,
        autoAmount: true,
        payerMode: "member",
        creditorMode: "substitute",
        amountMode: "shift"
      };
    }

    if (normalizedEventType === "ausencia" || normalizedEventType === "outros") {
      return {
        showDescription: true,
        showDelayMultiple: false,
        hideSubstitute: false,
        showShift: true,
        disableSubstitute: false,
        autoPayer: true,
        autoCreditor: true,
        autoAmount: false,
        payerMode: "member",
        creditorMode: "substitute",
        amountMode: "manual"
      };
    }

      return {
        showDescription: false,
        showDelayMultiple: false,
        hideSubstitute: false,
        showShift: true,
        disableSubstitute: false,
        autoPayer: false,
        autoCreditor: false,
      autoAmount: false,
      payerMode: "manual",
      creditorMode: "manual",
      amountMode: "manual"
    };
  }

  function normalizeEventType(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function toggleEventField(control, shouldShow) {
    const field = control?.closest(".entry-field");
    if (!field) {
      return;
    }

    field.classList.toggle("hidden", !shouldShow);
  }

  function setFieldDisabled(control, disabled) {
    if (!control) {
      return;
    }

    control.disabled = disabled;
  }

  function setFieldRequired(control, required) {
    if (!control) {
      return;
    }

    control.required = required;
  }

  function setSelectControlValue(select, value) {
    if (!select) {
      return;
    }

    const text = String(value || "").trim();
    if (!text) {
      select.value = "";
      return;
    }

    let option = Array.from(select.options).find((item) => item.value === text);
    if (!option) {
      option = document.createElement("option");
      option.value = text;
      option.textContent = text;
      select.appendChild(option);
    }

    select.value = text;
  }

  function resolveEventEntryPayer(rule, memberName) {
    if (rule.payerMode === "team") {
      return "CAIXA DA EQUIPE";
    }

    if (rule.payerMode === "member") {
      return memberName;
    }

    return String(elements.payerInput?.value || "").trim();
  }

  function resolveEventEntryCreditor(rule, substitute) {
    if (rule.creditorMode === "team") {
      return "CAIXA DA EQUIPE";
    }

    if (rule.creditorMode === "substitute") {
      return substitute;
    }

    return String(elements.creditorInput?.value || "").trim();
  }

  function resolveEventEntryAmount(rule, shift, delayMultiple) {
    if (rule.amountMode === "delay") {
      return delayMultiple > 0 ? delayMultiple * 200 : 0;
    }

    if (rule.amountMode === "shift") {
      const normalizedShift = normalizeShift(shift);
      if (normalizedShift === "manha" || normalizedShift === "tarde") {
        return 1000;
      }

      if (normalizedShift === "integral") {
        return 2000;
      }
    }

    return 0;
  }

  function normalizeShift(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function formatCurrencyInput(value) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(value);
  }

  async function fetchEventListsRows() {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${eventListsSpreadsheetId}/gviz/tq`);
    url.searchParams.set("tqx", "out:csv");
    url.searchParams.set("sheet", eventListsSheetTitle);
    url.searchParams.set("range", "A2:F60");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar aba ${eventListsSheetTitle}: ${response.status}`);
    }

    const csvText = await response.text();
    return parseCsvRows(csvText).filter((row) => row.some((cell) => String(cell || "").trim()));
  }

  function getMemberChoicesForSigla(sigla, weekdayLabel) {
    const normalizedSigla = String(sigla || "").trim().toUpperCase();
    if (!normalizedSigla) {
      return [];
    }

    if (normalizedSigla === "DC") {
      const weekdayAliases = new Set((dcAliasesByWeekday.get(weekdayLabel) || []).map((value) => String(value || "").toUpperCase()));
      const weekdayOptions = dcMemberOptions.filter((option) => weekdayAliases.has(option.sigla));
      return weekdayOptions.length ? weekdayOptions : dcMemberOptions;
    }

    const rawParts = normalizedSigla.split(/[/-]/).map((value) => value.trim()).filter(Boolean);
    const choices = rawParts
      .map((part) => memberDirectory.get(part))
      .filter(Boolean);

    return dedupeMemberChoices(choices);
  }

  function dedupeMemberChoices(choices) {
    const seen = new Set();
    return choices.filter((choice) => {
      const key = `${choice.sigla}::${choice.name}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  function parseSiglaNameEntry(value) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }

    const match = text.match(/^([A-Z0-9]{2})\s*-\s*(.+)$/);
    if (!match) {
      return null;
    }

    return {
      sigla: match[1].trim().toUpperCase(),
      name: match[2].trim(),
      label: text
    };
  }

  function buildFallbackMemberDirectory() {
    return new Map(
      [
        "AA - Adriano Neves de Almeida",
        "AD - Adelson Jose de Macedo",
        "AL - Alexandre de Castro Morais",
        "BA - Barbara Ribeiro Coutinho Leduc",
        "CH - Carlos Humberto Barbosa Ganem",
        "CR - Crelio Viana",
        "DE - Deiler Celio Jeunon",
        "DN - Dener Augusto Diniz",
        "FL - Flavio Maciel Fonseca",
        "FR - Francisco Tadeu da Mota Albuquerque",
        "GB - Gustavo Prosperi Bicalho",
        "GU - Guilherme Vieira Cunha",
        "IG - Igor Fagundes Vieira",
        "JA - Jayme Bueno Castilho",
        "L2 - Leonardo Alves Araujo",
        "LA - Luiz Antonio Carneiro Silva",
        "LC - Lucas Cardoso de Andrade",
        "LD - Leonardo Diniz Correa Pinto",
        "LE - Leonardo Carvalho Figueiredo",
        "LH - Lucia Helena Jacomett",
        "LO - Luiz Otavio Fernandes Andrade",
        "LU - Luciano Costa Ferreira",
        "MA - Marcelo Giovannoni Assis",
        "MH - Marcio Henrique Mendes",
        "PR - Paulo Renato Andrade Silva",
        "RA - Rafael Augusto Carneiro Rezende",
        "RC - Rodrigo Capuano de Rezende Carneiro",
        "RL - Ricardo Lucas da Mota Albuquerque",
        "RO - Rodrigo de Lima e Souza",
        "RU - Rubens Claudio Pinheiro",
        "WE - Wendell Valadares Campos Pereira"
      ]
        .map((value) => parseSiglaNameEntry(value))
        .filter(Boolean)
        .map((entry) => [entry.sigla, entry])
    );
  }

  function buildFallbackDcOptions() {
    return [
      "AD - Adelson Jose de Macedo",
      "CR - Crelio Viana",
      "LH - Lucia Helena Jacomett",
      "LA - Luiz Antonio Carneiro Silva"
    ]
      .map((value) => parseSiglaNameEntry(value))
      .filter(Boolean);
  }

  function buildFallbackEventFieldOptions() {
    return {
      eventTypes: ["Pessoal", "Ferias", "ATRASO", "Suporte", "Gestao", "Congresso", "Saude", "Ausencia", "Outros"],
      delayMultiples: ["0", "1", "2", "3", "4", "5", "6"],
      substitutes: [
        "Fernando Astrogildo",
        "Bernardo Guimaraes",
        "Lucas Marques",
        "Carolina Valadares",
        "Jessica Karine",
        "Bruna Candida",
        "Adelson Jose de Macedo",
        "Adriano Neves de Almeida",
        "Alexandre de Castro Morais",
        "Barbara Ribeiro Coutinho Leduc",
        "Carlos Humberto Barbosa Ganem",
        "Crelio Viana",
        "Deiler Celio Jeunon",
        "Dener Augusto Diniz",
        "Flavio Maciel Fonseca",
        "Francisco Tadeu da Mota Albuquerque",
        "Guilherme Vieira Cunha",
        "Gustavo Prosperi Bicalho",
        "Igor Fagundes Vieira",
        "Jayme Bueno Castilho",
        "Leonardo Alves Araujo",
        "Leonardo Carvalho Figueiredo",
        "Leonardo Diniz Correa Pinto",
        "Lucas Cardoso de Andrade",
        "Lucia Helena Jacomett",
        "Luciano Costa Ferreira",
        "Luiz Antonio Carneiro Silva",
        "Luiz Otavio Fernandes Andrade",
        "Marcelo Giovannoni Assis",
        "Marcio Henrique Mendes",
        "Paulo Renato Andrade Silva",
        "Rafael Augusto Carneiro Rezende",
        "Ricardo Lucas da Mota Albuquerque",
        "Rodrigo Capuano de Rezende Carneiro",
        "Rodrigo de Lima e Souza",
        "Rubens Claudio Pinheiro",
        "Wendell Valadares Campos Pereira"
      ],
      shifts: ["Manha", "Tarde", "Integral"],
      payers: [
        "CAIXA DA EQUIPE",
        "AD - Adelson Jose de Macedo",
        "AA - Adriano Neves de Almeida",
        "AL - Alexandre de Castro Morais",
        "BA - Barbara Ribeiro Coutinho Leduc",
        "CH - Carlos Humberto Barbosa Ganem",
        "CR - Crelio Viana"
      ],
      creditors: [
        "Fernando Astrogildo",
        "Bernardo Guimaraes",
        "Lucas Marques",
        "Carolina Valadares",
        "Jessica Karine",
        "Bruna Candida",
        "CAIXA DA EQUIPE"
      ]
    };
  }

  function buildFallbackEventTypeDefaults() {
    return new Map([
      ["Pessoal", { delayMultiple: "0", shift: "Manha", payer: "CAIXA DA EQUIPE", creditor: "Fernando Astrogildo" }],
      ["Ferias", { delayMultiple: "1", shift: "Tarde", payer: "AD - Adelson Jose de Macedo", creditor: "Bernardo Guimaraes" }],
      ["ATRASO", { delayMultiple: "2", shift: "Integral", payer: "AA - Adriano Neves de Almeida", creditor: "Lucas Marques" }],
      ["Suporte", { delayMultiple: "3", shift: "", payer: "AL - Alexandre de Castro Morais", creditor: "Carolina Valadares" }],
      ["Gestao", { delayMultiple: "4", shift: "", payer: "BA - Barbara Ribeiro Coutinho Leduc", creditor: "Jessica Karine" }],
      ["Congresso", { delayMultiple: "5", shift: "", payer: "CH - Carlos Humberto Barbosa Ganem", creditor: "Bruna Candida" }],
      ["Saude", { delayMultiple: "6", shift: "", payer: "CR - Crelio Viana", creditor: "CAIXA DA EQUIPE" }]
    ]);
  }

  function pushUniqueOption(list, value) {
    const text = String(value || "").trim();
    if (!text || list.includes(text)) {
      return;
    }

    list.push(text);
  }

  function extractDisplayName(value) {
    const entry = parseSiglaNameEntry(value);
    if (entry) {
      return entry.name;
    }

    return String(value || "").trim();
  }

  function renderVacationLabel() {
    toggle(elements.vacationCard, true);
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
