/* Ascent Academia · Exam Clock
 * Plain JavaScript, no build step. Open index.html in any modern browser.
 */
(() => {
  "use strict";

  const MIN = 60 * 1000;
  const STORAGE_SETTINGS = "ascent-clock:settings";
  const STORAGE_EXAM = "ascent-clock:exam";
  const THEMES = ["dark", "light", "contrast"];

  const DEFAULTS = {
    examName: "Trial Examination",
    readingMin: 10,
    durationMin: 120,
    scheduledStart: "",
    intervalMin: 10,
    warnings: [30, 5],
    bannerSec: 10,
    sound: false,
    hour12: false,
    theme: "dark",
    showDate: true,
    reduceMotion: false,
  };

  // ---------- Storage helpers (storage can be unavailable in private modes) ----------
  const store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    },
  };

  let settings = { ...DEFAULTS, ...(store.get(STORAGE_SETTINGS) || {}) };

  // exam: { startAt: ms, pausedAt: ms|null, pausedTotal: ms } or null
  let exam = store.get(STORAGE_EXAM);

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    app: $("app"),
    examName: $("exam-name"),
    clock: $("clock"),
    clockSr: $("clock-sr"),
    ampm: $("ampm"),
    date: $("date"),
    phasePill: $("phase-pill"),
    phaseText: $("phase-text"),
    panel: $("exam-panel"),
    statStart: $("stat-start"),
    statElapsed: $("stat-elapsed"),
    statElapsedLabel: $("stat-elapsed-label"),
    statRemaining: $("stat-remaining"),
    statRemainingLabel: $("stat-remaining-label"),
    statRemainingWrap: $("stat-remaining-wrap"),
    statEnd: $("stat-end"),
    statEndWrap: $("stat-end-wrap"),
    progress: $("progress"),
    progressFill: $("progress-fill"),
    progressReading: $("progress-reading"),
    progressTicks: $("progress-ticks"),
    milestones: $("milestones"),
    announce: $("announce"),
    announceKicker: $("announce-kicker"),
    announceTitle: $("announce-title"),
    announceSub: $("announce-sub"),
    live: $("live"),
    startBtn: $("start-btn"),
    startLabel: $("start-label"),
    startIcon: $("start-icon"),
    resetBtn: $("reset-btn"),
    resetLabel: $("reset-label"),
    themeBtn: $("theme-btn"),
    settingsBtn: $("settings-btn"),
    fsBtn: $("fullscreen-btn"),
    fsIcon: $("fs-icon"),
    fsLabel: $("fs-label"),
    dialog: $("settings"),
    form: $("settings-form"),
    settingsClose: $("settings-close"),
    settingsCancel: $("settings-cancel"),
  };

  const ICON_PLAY = "M8 5v14l11-7z";
  const ICON_PAUSE = "M6 5h4v14H6zm8 0h4v14h-4z";
  const ICON_FS_ENTER = "M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 3v-3h2v5h-5v-2z";
  const ICON_FS_EXIT = "M7 4h2v5H4V7h3zm8 0h2v3h3v2h-5zM4 15h5v5H7v-3H4zm11 0h5v2h-3v3h-2z";

  // ---------- Accurate time ----------
  // All times come from now(): the device clock plus a correction that is only
  // applied when the device clock is measurably wrong (see syncTime below).
  let clockOffset = 0;          // ms to add to the device clock
  let syncInfo = { state: "pending" };

  const now = () => Date.now() + clockOffset;

  /**
   * Check the device clock against the web server's clock (the HTTP "Date"
   * header). The header only has whole-second resolution, so we take a burst
   * of samples spread across a second and intersect the possible ranges:
   * each response says the server time was in [date, date + 1s) at some local
   * moment between sending the request and receiving the reply. Intersecting
   * those windows narrows the true offset to roughly the network round trip.
   */
  async function syncTime() {
    if (!location.protocol.startsWith("http") || !navigator.onLine) {
      syncInfo = { state: "unavailable" };
      renderSyncStatus();
      return;
    }
    syncInfo = { state: "checking" };
    renderSyncStatus();

    let lo = -Infinity, hi = Infinity, samples = 0;
    try {
      for (let i = 0; i < 12; i++) {
        const sent = Date.now();
        const res = await fetch(`${location.pathname}?time-check=${sent}-${i}`, {
          method: "HEAD", cache: "no-store",
        });
        const received = Date.now();
        const header = res.headers.get("date");
        const server = header ? Date.parse(header) : NaN;
        if (!Number.isFinite(server)) continue;
        samples++;
        lo = Math.max(lo, server - received);
        hi = Math.min(hi, server + 1000 - sent);
        if (hi - lo < 120) break;   // precise enough
        // Spread requests across the second so one lands near a tick boundary
        await new Promise((r) => setTimeout(r, 90 + Math.random() * 60));
      }
    } catch { /* offline */ }

    if (!samples || !(hi >= lo)) {
      syncInfo = { state: "unavailable" };
    } else {
      const offset = Math.round((lo + hi) / 2);
      const uncertainty = Math.round((hi - lo) / 2);
      // Trust the device (normally synced by the OS to within a few ms) unless
      // it is clearly out by more than a second.
      const apply = uncertainty < 1000 && Math.abs(offset) > Math.max(1000, uncertainty * 2);
      const prevOffset = clockOffset;
      clockOffset = apply ? offset : 0;
      syncInfo = { state: apply ? "corrected" : "ok", offset, uncertainty, at: Date.now() };
      if (clockOffset !== prevOffset && lastE !== null && exam) {
        // Keep the exam anchored so a correction doesn't replay announcements
        lastE = examElapsed(now());
      }
    }
    renderSyncStatus();
    render(false);
  }

  function describeOffset(ms) {
    const abs = Math.abs(ms);
    const s = abs / 1000;
    const text = s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
    return `${text} ${ms > 0 ? "slow" : "fast"}`;
  }

  function renderSyncStatus() {
    const box = document.getElementById("sync-status");
    const badge = document.getElementById("sync-badge");
    let text = "";
    switch (syncInfo.state) {
      case "checking": text = "Checking the device clock against internet time…"; break;
      case "unavailable": text = "Couldn't reach a time server — using this device's clock. Make sure the device's date & time are set automatically."; break;
      case "ok": text = `Device clock verified ✓ (within ±${Math.max(syncInfo.uncertainty, 50)} ms of internet time).`; break;
      case "corrected": text = `This device's clock is ${describeOffset(syncInfo.offset)}. The display has been corrected automatically (±${syncInfo.uncertainty} ms).`; break;
      default: text = "Not checked yet.";
    }
    if (box) box.textContent = text;
    if (badge) {
      badge.hidden = syncInfo.state !== "corrected";
      badge.title = text;
    }
  }

  // ---------- Formatting ----------
  const pad = (n) => String(n).padStart(2, "0");

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  // Countdowns round up so "0:00" only shows once time has truly run out
  const formatCountdown = (ms) => formatDuration(Math.ceil(Math.max(0, ms) / 1000) * 1000);

  function formatMinutesWords(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const parts = [];
    if (h) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
    if (m) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
    return parts.join(" ") || "0 minutes";
  }

  function formatShortMinutes(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function formatClockTime(date, withSeconds = false) {
    let h = date.getHours();
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    let suffix = "";
    if (settings.hour12) {
      suffix = h >= 12 ? " PM" : " AM";
      h = h % 12 || 12;
    } else {
      h = pad(h);
    }
    return `${h}:${m}${withSeconds ? ":" + s : ""}${suffix}`;
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // ---------- Animated clock ----------
  // The clock is built from fixed "slots". Each digit slot animates only when
  // its own value changes, so seconds roll smoothly without re-rendering hours.
  const slots = [];

  function buildClock() {
    el.clock.textContent = "";
    slots.length = 0;
    const layout = ["d", "d", ":", "d", "d", ":", "d", "d"];
    layout.forEach((kind, i) => {
      const span = document.createElement("span");
      if (kind === ":") {
        span.className = "sep";
        span.textContent = ":";
        if (i === 5) span.classList.add("secs");
      } else {
        span.className = "digit" + (i >= 6 ? " secs" : "");
        span.dataset.value = "";
        slots.push(span);
      }
      el.clock.appendChild(span);
    });
  }

  function setDigit(slot, value, animate) {
    if (slot.dataset.value === value) return;
    slot.dataset.value = value;

    const next = document.createElement("span");
    next.textContent = value;

    const prev = slot.querySelector("span:not(.out)");
    if (prev && animate) {
      prev.classList.remove("in");
      prev.classList.add("out");
      prev.addEventListener("animationend", () => prev.remove(), { once: true });
      // Fallback in case animations are disabled / the tab is hidden
      setTimeout(() => prev.isConnected && prev.remove(), 800);
      next.classList.add("in");
    } else if (prev) {
      prev.remove();
    }
    // Leading blank for 12-hour clock ("9:05" rather than "09:05")
    slot.style.visibility = value === "" ? "hidden" : "";
    slot.appendChild(next);
  }

  function renderClock(now, animate) {
    let h = now.getHours();
    let hStr;
    if (settings.hour12) {
      el.ampm.textContent = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      hStr = String(h).padStart(2, " ");
    } else {
      el.ampm.textContent = "";
      hStr = pad(h);
    }
    const str = hStr + pad(now.getMinutes()) + pad(now.getSeconds());
    for (let i = 0; i < 6; i++) {
      const ch = str[i] === " " ? "" : str[i];
      setDigit(slots[i], ch, animate);
    }
  }

  // ---------- Exam model ----------
  function examElapsed(now) {
    if (!exam) return 0;
    const pausedExtra = exam.pausedAt ? now - exam.pausedAt : 0;
    return now - exam.startAt - (exam.pausedTotal || 0) - pausedExtra;
  }

  /** Returns the full state of the exam at time `now` (ms). */
  function examState(now) {
    if (!exam) return null;
    const R = settings.readingMin * MIN;
    const D = settings.durationMin * MIN;
    const openEnded = D === 0;
    const e = examElapsed(now);

    let phase;
    if (e < 0) phase = "upcoming";
    else if (e < R) phase = "reading";
    else if (openEnded || e < R + D) phase = "writing";
    else phase = "finished";

    const writingElapsed = Math.max(0, e - R);
    const remaining = openEnded ? null : Math.max(0, R + D - e);
    // Wall-clock finish time accounts for time spent paused
    const pausedMs = (exam.pausedTotal || 0) + (exam.pausedAt ? now - exam.pausedAt : 0);
    const writingStartAt = exam.startAt + R + pausedMs;
    const endAt = openEnded ? null : exam.startAt + R + D + pausedMs;

    return { e, R, D, openEnded, phase, writingElapsed, remaining, writingStartAt, endAt, paused: !!exam.pausedAt };
  }

  /**
   * Collect announcements whose threshold lies in (prevE, e].
   * Each has { at: examElapsedMs, kicker, title, sub, tone }.
   */
  function collectEvents(prevE, e) {
    const R = settings.readingMin * MIN;
    const D = settings.durationMin * MIN;
    const openEnded = D === 0;
    const list = [];
    const within = (t) => t > prevE && t <= e;

    if (R > 0 && within(0)) {
      list.push({ at: 0, tone: "reading", kicker: "Reading time", title: "Reading time has begun",
        sub: `${formatMinutesWords(settings.readingMin)} · no writing` });
    }
    if (within(R)) {
      list.push({ at: R, tone: "info", kicker: "Writing time", title: "You may now begin writing",
        sub: openEnded ? "" : `${formatMinutesWords(settings.durationMin)} of writing time` });
    }

    const I = settings.intervalMin * MIN;
    if (I > 0) {
      const first = Math.max(1, Math.floor((prevE - R) / I) + 1);
      for (let k = first; ; k++) {
        const t = R + k * I;
        if (t > e) break;
        if (!openEnded && k * I >= D) break;
        const mins = k * settings.intervalMin;
        list.push({ at: t, tone: "accent", kicker: "Time check", title: `${formatMinutesWords(mins)} ${mins === 1 ? "has" : "have"} passed`,
          sub: openEnded ? "" : `${formatMinutesWords(settings.durationMin - mins)} remaining` });
      }
    }

    if (!openEnded) {
      for (const w of settings.warnings) {
        if (w >= settings.durationMin) continue;
        const t = R + D - w * MIN;
        if (within(t)) {
          list.push({ at: t + 1, tone: w <= 5 ? "danger" : "warning", kicker: "Time remaining",
            title: `${formatMinutesWords(w)} remaining`, sub: "" });
        }
      }
      if (within(R + D)) {
        list.push({ at: R + D + 2, tone: "danger", kicker: "End of exam", title: "Time is up",
          sub: "Please put your pens down" });
      }
    }

    list.sort((a, b) => a.at - b.at);
    return list;
  }

  // ---------- Announcements ----------
  let announceTimer = null;

  function announce(evt) {
    el.announce.className = "announce";
    if (evt.tone !== "accent") el.announce.classList.add(`tone-${evt.tone}`);
    el.announceKicker.textContent = evt.kicker;
    el.announceTitle.textContent = evt.title;
    el.announceSub.textContent = evt.sub || "";
    // Force reflow so the entrance animation restarts for back-to-back events
    void el.announce.offsetWidth;
    el.announce.classList.add("show");

    el.live.textContent = `${evt.title}. ${evt.sub || ""}`.trim();

    el.app.classList.remove("flash");
    void el.app.offsetWidth;
    el.app.classList.add("flash");

    if (settings.sound) chime(evt.tone === "danger" ? 3 : 2);

    clearTimeout(announceTimer);
    // "Time is up" stays up longer
    const ms = (evt.tone === "danger" && evt.title === "Time is up" ? Math.max(30, settings.bannerSec) : settings.bannerSec) * 1000;
    announceTimer = setTimeout(hideAnnouncement, ms);
  }

  function hideAnnouncement() {
    clearTimeout(announceTimer);
    el.announce.classList.remove("show");
    el.app.classList.remove("flash");
  }

  // Soft two-tone chime using Web Audio (no audio files needed)
  let audioCtx = null;
  function chime(count = 2) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const notes = [880, 659.25, 523.25];
      for (let i = 0; i < count; i++) {
        const t = audioCtx.currentTime + i * 0.45;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = notes[i % notes.length];
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 1.5);
      }
    } catch { /* audio not available */ }
  }

  // ---------- Progress bar ticks & milestone labels ----------
  function buildProgressMarks() {
    el.progressTicks.textContent = "";
    el.milestones.textContent = "";
    const R = settings.readingMin;
    const D = settings.durationMin;
    if (!exam || D === 0) return;
    const total = R + D;

    const addLabel = (min, text) => {
      const s = document.createElement("span");
      s.style.left = `${(min / total) * 100}%`;
      s.dataset.at = String(min);
      s.textContent = text;
      el.milestones.appendChild(s);
    };

    addLabel(0, R ? "Reading" : "Start");
    if (R) addLabel(R, "Writing");

    const I = settings.intervalMin;
    if (I > 0) {
      // Keep labels readable: at most ~12 labels across the bar
      const labelEvery = Math.max(1, Math.ceil((D / I) / 12));
      for (let k = 1; k * I < D; k++) {
        const at = R + k * I;
        const tick = document.createElement("i");
        tick.style.left = `${(at / total) * 100}%`;
        el.progressTicks.appendChild(tick);
        if (k % labelEvery === 0 && (D - k * I) >= I * labelEvery * 0.5) {
          addLabel(at, `+${formatShortMinutes(k * I)}`);
        }
      }
    }
    addLabel(total, "End");
  }

  // ---------- Rendering ----------
  let lastE = null;
  let lastMinuteSr = -1;
  let lastPhase = null;

  let shownSecond = 0;

  function render(animate = true) {
    const nowMs = now();
    shownSecond = Math.floor(nowMs / 1000);
    const date = new Date(nowMs);

    renderClock(date, animate);

    if (date.getMinutes() !== lastMinuteSr) {
      lastMinuteSr = date.getMinutes();
      el.clockSr.textContent = `Current time ${formatClockTime(date)}`;
      el.date.textContent = dateFormatter.format(date);
    }

    const st = examState(nowMs);
    el.app.classList.toggle("exam-on", !!st);
    el.app.classList.toggle("finished", !!st && st.phase === "finished");
    el.panel.hidden = !st;
    el.phasePill.hidden = !st;
    el.resetBtn.hidden = !exam;

    updateStartButton(st);

    if (!st) {
      lastE = null;
      lastPhase = null;
      return;
    }

    // Fire announcements that happened since the previous tick. If many were
    // skipped (e.g. the laptop slept), only show the most recent one.
    if (lastE !== null && st.e > lastE) {
      const events = collectEvents(lastE, st.e);
      if (events.length) announce(events[events.length - 1]);
    }
    lastE = st.e;

    // Phase pill
    let phaseKey = st.phase;
    let phaseLabel = {
      upcoming: "Exam starts soon",
      reading: "Reading time",
      writing: "Writing time",
      finished: "Time is up",
    }[st.phase];
    if (st.paused) { phaseKey = "paused"; phaseLabel = "Paused"; }
    else if (st.phase === "writing" && st.remaining !== null && st.remaining <= 5 * MIN) {
      phaseKey = "warning"; phaseLabel = "Final minutes";
    }
    el.phasePill.className = `phase-pill phase-${phaseKey}`;
    if (phaseKey !== lastPhase) {
      el.phaseText.textContent = phaseLabel;
      // retrigger entrance animation
      el.phasePill.style.animation = "none";
      void el.phasePill.offsetWidth;
      el.phasePill.style.animation = "";
      lastPhase = phaseKey;
    }

    // Stats
    el.statStart.textContent = formatClockTime(new Date(st.phase === "upcoming" || st.phase === "reading" ? exam.startAt : st.writingStartAt));
    el.statStart.previousElementSibling.textContent =
      st.phase === "upcoming" ? "Starts" : st.phase === "reading" ? "Reading began" : "Writing began";

    if (st.phase === "upcoming") {
      el.statElapsedLabel.textContent = "Starts in";
      el.statElapsed.textContent = formatCountdown(-st.e);
    } else if (st.phase === "reading") {
      el.statElapsedLabel.textContent = "Reading time left";
      el.statElapsed.textContent = formatCountdown(st.R - st.e);
    } else {
      el.statElapsedLabel.textContent = "Writing elapsed";
      el.statElapsed.textContent = formatDuration(Math.min(st.writingElapsed, st.openEnded ? Infinity : st.D));
    }

    el.statRemainingWrap.hidden = st.openEnded;
    el.statEndWrap.hidden = st.openEnded;
    el.progress.hidden = st.openEnded;
    el.milestones.hidden = st.openEnded;

    if (!st.openEnded) {
      el.statRemainingLabel.textContent = st.phase === "finished" ? "Finished" : "Time remaining";
      el.statRemaining.textContent = formatCountdown(st.remaining);
      el.statEnd.textContent = formatClockTime(new Date(st.endAt));

      const warn = st.phase === "writing" && st.remaining <= 15 * MIN && st.remaining > 5 * MIN;
      const danger = st.phase === "finished" || (st.phase === "writing" && st.remaining <= 5 * MIN);
      el.statRemainingWrap.classList.toggle("is-warning", warn);
      el.statRemainingWrap.classList.toggle("is-danger", danger);
      el.progress.classList.toggle("is-warning", warn);
      el.progress.classList.toggle("is-danger", danger);

      const total = st.R + st.D;
      const clampE = Math.min(Math.max(st.e, 0), total);
      el.progressReading.style.width = `${(Math.min(clampE, st.R) / total) * 100}%`;
      el.progressFill.style.left = `${(st.R / total) * 100}%`;
      el.progressFill.style.width = `${(Math.max(0, clampE - st.R) / total) * 100}%`;
      const pct = Math.round((clampE / total) * 100);
      el.progress.setAttribute("aria-valuenow", String(pct));
      el.progress.setAttribute("aria-valuetext", `${pct}% of exam time used`);

      const eMin = st.e / MIN;
      for (const s of el.milestones.children) {
        s.classList.toggle("passed", eMin >= Number(s.dataset.at));
      }
    }
  }

  function updateStartButton(st) {
    if (!exam) {
      el.startLabel.textContent = settings.scheduledStart ? `Start at ${settings.scheduledStart}` : "Start exam";
      el.startIcon.setAttribute("d", ICON_PLAY);
    } else if (st && st.phase === "finished") {
      el.startLabel.textContent = "New exam";
      el.startIcon.setAttribute("d", ICON_PLAY);
    } else if (exam.pausedAt) {
      el.startLabel.textContent = "Resume";
      el.startIcon.setAttribute("d", ICON_PLAY);
    } else {
      el.startLabel.textContent = "Pause";
      el.startIcon.setAttribute("d", ICON_PAUSE);
    }
  }

  // ---------- Ticking (aligned to the start of each second) ----------
  let tickTimer = null;
  function tick() {
    render(true);
    clearTimeout(tickTimer);
    tickTimer = setTimeout(tick, 1000 - (now() % 1000) + 8);
  }

  // ---------- Exam controls ----------
  function saveExam() {
    if (exam) store.set(STORAGE_EXAM, exam); else store.remove(STORAGE_EXAM);
  }

  function scheduledStartMs() {
    if (!settings.scheduledStart) return null;
    const [h, m] = settings.scheduledStart.split(":").map(Number);
    const d = new Date(now());
    d.setHours(h, m, 0, 0);
    // If that time already passed more than 6 hours ago, assume tomorrow
    if (now() - d.getTime() > 6 * 60 * MIN) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function startOrPause() {
    const t = now();
    const st = examState(t);
    if (!exam || (st && st.phase === "finished")) {
      const scheduled = exam ? null : scheduledStartMs();
      exam = { startAt: scheduled ?? t, pausedAt: null, pausedTotal: 0 };
      // Seed so the "reading/writing has begun" announcement fires right away
      lastE = examElapsed(t) >= 0 ? -1 : null;
      buildProgressMarks();
      requestWakeLock();
      if (settings.sound) chime(1); // also unlocks audio on first user gesture
    } else if (exam.pausedAt) {
      exam.pausedTotal += t - exam.pausedAt;
      exam.pausedAt = null;
      el.live.textContent = "Exam resumed";
    } else {
      exam.pausedAt = t;
      el.live.textContent = "Exam paused";
    }
    saveExam();
    render(false);
  }

  // Resetting a running exam needs a second press within a few seconds
  // (browser confirm() dialogs are blocked in some embedded viewers).
  let resetArmed = null;

  function disarmReset() {
    clearTimeout(resetArmed);
    resetArmed = null;
    el.resetBtn.classList.remove("btn-danger");
    el.resetLabel.textContent = "Reset";
  }

  function resetExam() {
    if (!exam) return;
    const st = examState(now());
    if (st && st.phase !== "finished" && !resetArmed) {
      resetArmed = setTimeout(disarmReset, 5000);
      el.resetBtn.classList.add("btn-danger");
      el.resetLabel.textContent = "Press again to reset";
      el.live.textContent = "Press reset again to confirm";
      wake();
      return;
    }
    disarmReset();
    exam = null;
    saveExam();
    hideAnnouncement();
    buildProgressMarks();
    render(false);
    el.live.textContent = "Exam timer reset";
  }

  // ---------- Theme / motion / display ----------
  function applySettings() {
    document.documentElement.dataset.clockTheme = settings.theme;
    if (settings.reduceMotion) document.documentElement.dataset.motion = "reduced";
    else delete document.documentElement.dataset.motion;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0b1020";
    el.examName.textContent = settings.examName || "Trial Examination";
    document.title = `${settings.examName || "Exam"} · Ascent Academia Clock`;
    el.date.hidden = !settings.showDate;
    lastMinuteSr = -1;
    buildProgressMarks();
    // Re-render digits without animation (format may have changed)
    slots.forEach((s) => { s.dataset.value = "\u0000"; });
    render(false);
  }

  function cycleTheme() {
    settings.theme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length];
    store.set(STORAGE_SETTINGS, settings);
    applySettings();
    const names = { dark: "Midnight", light: "Daylight", contrast: "High contrast" };
    el.live.textContent = `${names[settings.theme]} theme`;
  }

  // ---------- Settings dialog ----------
  function openSettings() {
    const f = el.form.elements;
    f.examName.value = settings.examName;
    f.readingMin.value = settings.readingMin;
    f.durationMin.value = settings.durationMin;
    f.scheduledStart.value = settings.scheduledStart;
    f.intervalMin.value = String(settings.intervalMin);
    f.bannerSec.value = String(settings.bannerSec);
    f.sound.checked = settings.sound;
    f.hour12.value = String(settings.hour12);
    f.theme.value = settings.theme;
    f.showDate.checked = settings.showDate;
    f.reduceMotion.checked = settings.reduceMotion;
    for (const cb of el.form.querySelectorAll('input[name="warn"]')) {
      cb.checked = settings.warnings.includes(Number(cb.value));
    }
    wake();
    if (typeof el.dialog.showModal === "function") el.dialog.showModal();
    else el.dialog.setAttribute("open", "");
    f.examName.focus();
  }

  function closeSettings() {
    if (typeof el.dialog.close === "function") el.dialog.close();
    else el.dialog.removeAttribute("open");
  }

  const clampInt = (v, lo, hi, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };

  function saveSettings(e) {
    e.preventDefault();
    const f = el.form.elements;
    settings = {
      ...settings,
      examName: f.examName.value.trim() || DEFAULTS.examName,
      readingMin: clampInt(f.readingMin.value, 0, 60, DEFAULTS.readingMin),
      durationMin: clampInt(f.durationMin.value, 0, 600, DEFAULTS.durationMin),
      scheduledStart: f.scheduledStart.value,
      intervalMin: clampInt(f.intervalMin.value, 0, 60, DEFAULTS.intervalMin),
      bannerSec: clampInt(f.bannerSec.value, 3, 60, DEFAULTS.bannerSec),
      sound: f.sound.checked,
      hour12: f.hour12.value === "true",
      theme: THEMES.includes(f.theme.value) ? f.theme.value : "dark",
      showDate: f.showDate.checked,
      reduceMotion: f.reduceMotion.checked,
      warnings: [...el.form.querySelectorAll('input[name="warn"]:checked')].map((cb) => Number(cb.value)),
    };
    store.set(STORAGE_SETTINGS, settings);
    // Don't replay announcements that are now "in the past" because of changed durations
    lastE = exam ? examElapsed(now()) : null;
    applySettings();
    closeSettings();
    if (settings.sound) chime(1);
  }

  // ---------- Full screen ----------
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;

  function toggleFullscreen() {
    const root = document.documentElement;
    if (!fsElement()) {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) {
        const p = req.call(root, { navigationUI: "hide" });
        if (p && p.catch) p.catch(() => {});
      }
      requestWakeLock();
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }

  function updateFsButton() {
    const on = !!fsElement();
    el.fsIcon.setAttribute("d", on ? ICON_FS_EXIT : ICON_FS_ENTER);
    el.fsLabel.textContent = on ? "Exit full screen" : "Enter full screen";
    el.fsBtn.title = on ? "Exit full screen (F)" : "Full screen (F)";
  }

  // Hide the button entirely on browsers without the Fullscreen API (e.g. iPhone Safari)
  if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) {
    el.fsBtn.hidden = true;
  }

  // ---------- Keep the screen awake while projecting ----------
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch { /* not supported or denied */ }
  }

  // ---------- Idle: hide controls and cursor ----------
  let idleTimer = null;
  function wake() {
    el.app.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (el.dialog.open) wake();
      else el.app.classList.add("idle");
    }, 3500);
  }

  // ---------- Events ----------
  el.startBtn.addEventListener("click", startOrPause);
  el.resetBtn.addEventListener("click", resetExam);
  el.themeBtn.addEventListener("click", cycleTheme);
  el.settingsBtn.addEventListener("click", openSettings);
  el.fsBtn.addEventListener("click", toggleFullscreen);
  el.form.addEventListener("submit", saveSettings);
  el.settingsClose.addEventListener("click", closeSettings);
  el.settingsCancel.addEventListener("click", closeSettings);
  el.announce.addEventListener("click", hideAnnouncement);
  // Clicking the dialog backdrop closes it
  el.dialog.addEventListener("click", (e) => { if (e.target === el.dialog) closeSettings(); });

  document.addEventListener("fullscreenchange", updateFsButton);
  document.addEventListener("webkitfullscreenchange", updateFsButton);

  ["mousemove", "mousedown", "touchstart", "keydown", "focusin"].forEach((t) =>
    document.addEventListener(t, wake, { passive: true }));

  // Double-click anywhere on the clock to toggle full screen
  $("stage").addEventListener("dblclick", toggleFullscreen);

  document.addEventListener("keydown", (e) => {
    if (el.dialog.open || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "select", "textarea"].includes(tag)) return;
    const onButton = tag === "button";
    switch (e.key.toLowerCase()) {
      case "f": toggleFullscreen(); break;
      case "s": e.preventDefault(); openSettings(); break;
      case "t": cycleTheme(); break;
      case "r": resetExam(); break;
      case " ":
        if (onButton) return; // let the focused button handle Space
        e.preventDefault(); startOrPause(); break;
      case "escape": hideAnnouncement(); break;
      default: return;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
      tick();
    }
  });

  // Keep multiple open tabs/windows (e.g. a laptop + a TV) in sync
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_EXAM) {
      exam = store.get(STORAGE_EXAM);
      lastE = exam ? examElapsed(now()) : null;
      buildProgressMarks();
      render(false);
    } else if (e.key === STORAGE_SETTINGS) {
      settings = { ...DEFAULTS, ...(store.get(STORAGE_SETTINGS) || {}) };
      lastE = exam ? examElapsed(now()) : null;
      applySettings();
    }
  });

  // ---------- Boot ----------
  buildClock();
  applySettings();
  updateFsButton();
  // Don't replay announcements for an exam restored from a previous session
  lastE = exam ? examElapsed(now()) : null;
  tick();
  wake();
  if (exam) requestWakeLock();

  // Safety net: if a timer fires late (busy CPU, throttling), catch up within
  // a fraction of a second so the displayed second is never stale.
  setInterval(() => {
    const s = Math.floor(now() / 1000);
    if (s !== shownSecond) tick();
  }, 200);

  // Verify the device clock now, then every 30 minutes and whenever we come back online
  syncTime();
  setInterval(syncTime, 30 * MIN);
  window.addEventListener("online", syncTime);
  document.getElementById("sync-now").addEventListener("click", syncTime);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // Small hook for testing / debugging from the console
  window.ascentClock = {
    get settings() { return { ...settings }; },
    get exam() { return exam && { ...exam }; },
    announce,
  };
})();
