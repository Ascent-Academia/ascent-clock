/* Ascent Academia · Exam Clock
 * Plain JavaScript, no build step. Open index.html in any modern browser.
 */
(() => {
  "use strict";

  const MIN = 60 * 1000;
  const STORAGE_SETTINGS = "ascent-clock:settings";
  const STORAGE_EXAM = "ascent-clock:exam";
  const THEMES = ["dark", "light", "contrast"];

  // Standard VCE end-of-year exam timings (15 minutes reading time + writing time).
  // Check the current VCAA timetable if a study design changes.
  const PRESETS = [
    { id: "methods-1", name: "Mathematical Methods — Exam 1", readingMin: 15, durationMin: 60 },
    { id: "methods-2", name: "Mathematical Methods — Exam 2", readingMin: 15, durationMin: 120 },
    { id: "specialist-1", name: "Specialist Mathematics — Exam 1", readingMin: 15, durationMin: 60 },
    { id: "specialist-2", name: "Specialist Mathematics — Exam 2", readingMin: 15, durationMin: 120 },
    { id: "general-1", name: "General Mathematics — Exam 1", readingMin: 15, durationMin: 90 },
    { id: "general-2", name: "General Mathematics — Exam 2", readingMin: 15, durationMin: 90 },
    { id: "physics", name: "Physics", readingMin: 15, durationMin: 150 },
    { id: "chemistry", name: "Chemistry", readingMin: 15, durationMin: 150 },
  ];

  const DEFAULTS = {
    examName: "Trial Exam",
    readingMin: 15,
    durationMin: 120,
    scheduledStart: "",
    timingMode: "duration",   // "duration" (lengths) or "clock" (fixed clock times)
    readingStart: "",
    writingStart: "",
    endTime: "",
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

  // Only display and announcement preferences are remembered between visits.
  // Exam details and any running exam start fresh on every page load.
  const PREF_KEYS = ["intervalMin", "warnings", "bannerSec", "sound", "hour12", "theme", "showDate", "reduceMotion"];

  function loadPrefs() {
    const saved = store.get(STORAGE_SETTINGS) || {};
    const prefs = {};
    for (const k of PREF_KEYS) if (k in saved) prefs[k] = saved[k];
    return prefs;
  }

  function savePrefs() {
    const prefs = {};
    for (const k of PREF_KEYS) prefs[k] = settings[k];
    store.set(STORAGE_SETTINGS, prefs);
  }

  let settings = { ...DEFAULTS, ...loadPrefs() };

  // exam: { startAt: ms, pausedAt: ms|null, pausedTotal: ms } or null.
  // Never restored after a refresh; also clear what older versions saved.
  let exam = null;
  store.remove(STORAGE_EXAM);

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    app: $("app"),
    examName: $("exam-name"),
    examNameInner: $("exam-name-inner"),
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
    skipBtn: $("skip-btn"),
    skipLabel: $("skip-label"),
    announceDismiss: $("announce-dismiss"),
    timingSummary: $("timing-summary"),
    startTimeField: $("start-time-field"),
    timingDuration: $("timing-duration"),
    timingClock: $("timing-clock"),
    exitBtn: $("exit-btn"),
    exitConfirm: $("exit-confirm"),
    settingsTitle: $("settings-title"),
    settingsSave: $("settings-save"),
    themeBtn: $("theme-btn"),
    settingsBtn: $("settings-btn"),
    fsBtn: $("fullscreen-btn"),
    fsIcon: $("fs-icon"),
    fsLabel: $("fs-label"),
    dialog: $("settings"),
    form: $("settings-form"),
    settingsClose: $("settings-close"),
    settingsCancel: $("settings-cancel"),
    preset: $("preset"),
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

  // Australian date style, e.g. "Saturday 26 September 2026"
  // "9:25" / "09:25" for progress-bar labels (no seconds or AM/PM, to save space)
  function formatShortTime(date) {
    const h = date.getHours();
    return `${settings.hour12 ? (h % 12 || 12) : pad(h)}:${pad(date.getMinutes())}`;
  }

  const dateFormatter = new Intl.DateTimeFormat("en-AU", {
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
    // Writing time left. It holds at the full writing time until writing
    // starts, so it only counts down once the exam proper has begun.
    const remaining = openEnded ? null : Math.min(D, Math.max(0, R + D - e));
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
      list.push({ at: 0, tone: "reading", kicker: formatMinutesWords(settings.readingMin), title: "Reading time",
        sub: "No writing yet", short: true });
    }
    if (within(R)) {
      list.push({ at: R, tone: "info", kicker: openEnded ? "Writing time" : formatMinutesWords(settings.durationMin),
        title: "Start writing", sub: "", short: true });
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
  let hideEndTimer = null;

  function announce(evt) {
    // If a banner is already up, swap its contents in place with a quick pop
    // rather than fading the whole overlay out and back in.
    const wasShowing = el.announce.classList.contains("show");
    clearTimeout(hideEndTimer);
    el.announce.className = "announce";
    if (evt.tone !== "accent") el.announce.classList.add(`tone-${evt.tone}`);
    el.announceKicker.textContent = evt.kicker;
    el.announceTitle.textContent = evt.title;
    el.announceSub.textContent = evt.sub || "";
    // Force reflow so the entrance animation restarts for back-to-back events
    void el.announce.offsetWidth;
    el.announce.classList.add("show");
    if (wasShowing) el.announce.classList.add("swap");

    el.live.textContent = `${evt.title}. ${evt.sub || ""}`.trim();

    el.app.classList.remove("flash");
    void el.app.offsetWidth;
    el.app.classList.add("flash");

    if (settings.sound) chime(evt.tone === "danger" ? 3 : 2);

    clearTimeout(announceTimer);
    // Reading/writing banners are brief; "Time is up" stays up longer
    const sec = evt.short ? Math.min(5, settings.bannerSec)
      : evt.title === "Time is up" ? Math.max(30, settings.bannerSec)
      : settings.bannerSec;
    const ms = sec * 1000;
    announceTimer = setTimeout(hideAnnouncement, ms);
  }

  function hideAnnouncement() {
    clearTimeout(announceTimer);
    el.app.classList.remove("flash");
    if (!el.announce.classList.contains("show")) return;
    el.announce.classList.remove("show", "swap");
    el.announce.classList.add("hiding");
    clearTimeout(hideEndTimer);
    hideEndTimer = setTimeout(() => el.announce.classList.remove("hiding"), 200);
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

    const addLabel = (min) => {
      const s = document.createElement("span");
      s.style.left = `${(min / total) * 100}%`;
      s.dataset.at = String(min);
      el.milestones.appendChild(s);
    };

    addLabel(0);
    if (R) addLabel(R);

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
          addLabel(at);
        }
      }
    }
    addLabel(total);
    updateMarkTimes();
  }

  // Label each mark with its clock time. Called every second so the labels
  // move along if the exam is paused.
  function updateMarkTimes() {
    if (!exam) return;
    const t = now();
    const pausedMs = (exam.pausedTotal || 0) + (exam.pausedAt ? t - exam.pausedAt : 0);
    const base = exam.startAt + pausedMs;
    for (const s of el.milestones.children) {
      const text = formatShortTime(new Date(base + Number(s.dataset.at) * MIN));
      if (s.textContent !== text) s.textContent = text;
    }
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
    el.exitBtn.hidden = !exam;

    updateStartButton(st);
    updateSkipButton(st);

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
      el.statRemainingLabel.textContent = st.phase === "finished" ? "Finished"
        : st.phase === "writing" ? "Time remaining" : "Writing time";
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

      updateMarkTimes();
      const eMin = st.e / MIN;
      for (const s of el.milestones.children) {
        s.classList.toggle("passed", eMin >= Number(s.dataset.at));
      }
    }
  }

  // "Skip to writing" during reading time; "Start now" while counting down
  function updateSkipButton(st) {
    const phase = st && !st.paused ? st.phase : null;
    const show = phase === "reading" || phase === "upcoming";
    el.skipBtn.hidden = !show;
    if (!show) { disarmSkip(); return; }
    if (!skipArmed) el.skipLabel.textContent = phase === "reading" ? "Skip to writing" : "Start now";
  }

  function updateStartButton(st) {
    el.startBtn.hidden = !!st && st.phase === "upcoming" && !st.paused;
    if (!exam) {
      el.startLabel.textContent = "Start exam";
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
  function scheduledStartMs(hhmm = settings.scheduledStart) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(now());
    d.setHours(h, m, 0, 0);
    // If that time already passed more than 6 hours ago, assume tomorrow
    if (now() - d.getTime() > 6 * 60 * MIN) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  /** Start the exam configured in settings: now, or at its scheduled time. */
  function beginExam() {
    const t = now();
    exam = { startAt: scheduledStartMs() ?? t, pausedAt: null, pausedTotal: 0 };
    const e = examElapsed(t);
    // Announce the start if it's happening now; don't replay announcements
    // when joining a clock-time exam that is already under way.
    lastE = e < 0 ? null : e < 5000 ? -1 : e;
    buildProgressMarks();
    requestWakeLock();
    if (settings.sound) chime(1); // also unlocks audio on first user gesture
    render(false);
  }

  function startOrPause() {
    const t = now();
    const st = examState(t);
    if (!exam || (st && st.phase === "finished")) {
      // Starting an exam goes through the setup panel first
      openSettings("start");
      return;
    } else if (exam.pausedAt) {
      exam.pausedTotal += t - exam.pausedAt;
      exam.pausedAt = null;
      el.live.textContent = "Exam resumed";
    } else {
      exam.pausedAt = t;
      el.live.textContent = "Exam paused";
    }
    render(false);
  }

  // Skipping ahead also needs a second press, so it can't happen by accident
  let skipArmed = null;

  function disarmSkip() {
    if (!skipArmed) return;
    clearTimeout(skipArmed);
    skipArmed = null;
    el.skipBtn.classList.remove("btn-danger");
  }

  function skipAhead() {
    const t = now();
    const st = examState(t);
    if (!st || st.paused || (st.phase !== "reading" && st.phase !== "upcoming")) return;
    if (!skipArmed) {
      skipArmed = setTimeout(() => { disarmSkip(); render(false); }, 5000);
      el.skipBtn.classList.add("btn-danger");
      el.skipLabel.textContent = st.phase === "reading" ? "Press again to skip reading" : "Press again to start now";
      el.live.textContent = "Press again to confirm";
      wake();
      return;
    }
    disarmSkip();
    // Move the exam's start earlier so it is now at the start of writing
    // (or the start of the exam), keeping everything else consistent.
    const target = st.phase === "reading" ? st.R : 0;
    exam.startAt -= target - st.e;
    if (st.phase === "upcoming") lastE = -1; // announce the start right away
    render(false);
  }

  // Exiting a running exam asks for confirmation first (an in-page dialog,
  // since browser confirm() pop-ups are blocked in some embedded viewers).
  function requestExit() {
    if (!exam) return;
    const st = examState(now());
    if (!st || st.phase === "finished") { exitExam(); return; }
    if (el.exitConfirm.open) return;
    el.exitConfirm.returnValue = "";
    wake();
    if (typeof el.exitConfirm.showModal === "function") el.exitConfirm.showModal();
    else el.exitConfirm.setAttribute("open", "");
  }

  function exitExam() {
    exam = null;
    hideAnnouncement();
    buildProgressMarks();
    render(false);
    el.live.textContent = "Exam ended. Showing the clock.";
  }

  // ---------- Long exam titles scroll ----------
  const prefersReducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function updateTitleScroll() {
    const outer = el.examName;
    outer.classList.remove("is-scrolling");
    const overflow = el.examNameInner.scrollWidth - outer.clientWidth;
    const still = settings.reduceMotion || (prefersReducedMotion && prefersReducedMotion.matches);
    if (overflow <= 2 || still) return;   // fits, or motion is off: keep the "…"
    const shift = overflow + outer.clientWidth * 0.04;  // a little past the end
    // Glide at a comfortable reading speed, relative to the text size
    const pxPerSec = parseFloat(getComputedStyle(outer).fontSize) * 2.2;
    const glideSec = Math.max(2, shift / pxPerSec);
    outer.style.setProperty("--title-shift", `${-shift}px`);
    outer.style.setProperty("--title-duration", `${(glideSec / 0.3).toFixed(1)}s`);
    outer.classList.add("is-scrolling");
  }

  if ("ResizeObserver" in window) new ResizeObserver(() => updateTitleScroll()).observe(el.examName.parentElement);
  else window.addEventListener("resize", updateTitleScroll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateTitleScroll);
  if (prefersReducedMotion && prefersReducedMotion.addEventListener) prefersReducedMotion.addEventListener("change", updateTitleScroll);

  // ---------- Theme / motion / display ----------
  function applySettings() {
    document.documentElement.dataset.clockTheme = settings.theme;
    if (settings.reduceMotion) document.documentElement.dataset.motion = "reduced";
    else delete document.documentElement.dataset.motion;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#120d19";
    el.examNameInner.textContent = settings.examName || DEFAULTS.examName;
    updateTitleScroll();
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
    savePrefs();
    applySettings();
    const names = { dark: "Midnight", light: "Daylight", contrast: "High contrast" };
    el.live.textContent = `${names[settings.theme]} theme`;
  }

  // ---------- Settings dialog ----------
  let settingsMode = "settings";

  /** mode "start": set up and start an exam. mode "settings": everything. */
  function openSettings(mode = "settings") {
    settingsMode = mode === "start" ? "start" : "settings";
    el.dialog.classList.toggle("start-mode", settingsMode === "start");
    el.settingsTitle.textContent = settingsMode === "start" ? "Start an exam" : "Settings";
    const f = el.form.elements;
    f.examName.value = settings.examName;
    f.readingMin.value = settings.readingMin;
    f.durationMin.value = settings.durationMin;
    f.scheduledStart.value = settings.scheduledStart;
    f.startWhen.value = settings.scheduledStart ? "later" : "now";
    f.timingMode.value = settings.timingMode === "clock" ? "clock" : "duration";
    f.readingStart.value = settings.readingStart;
    f.writingStart.value = settings.writingStart;
    f.endTime.value = settings.endTime;
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
    f.preset.value = (PRESETS.find((p) => p.name === settings.examName &&
      p.readingMin === settings.readingMin && p.durationMin === settings.durationMin) || {}).id || "";
    updateTimingForm();
    wake();
    el.dialog.classList.remove("closing");
    if (typeof el.dialog.showModal === "function") el.dialog.showModal();
    else el.dialog.setAttribute("open", "");
    f.preset.focus();
  }

  // In start mode the main button says what will happen
  function updateSaveLabel() {
    if (settingsMode !== "start") { el.settingsSave.textContent = "Save"; return; }
    const f = el.form.elements;
    let later = false;
    if (f.timingMode.value === "clock") {
      const r = readClockTimes(f);
      later = !r.error && scheduledStartMs(r.start) > now();
    } else if (chosenStart(f)) {
      later = scheduledStartMs(chosenStart(f)) > now();
    }
    el.settingsSave.textContent = later ? "Schedule exam" : "Start exam";
  }

  // Slide the panel out before actually closing it
  let closingTimer = null;
  function closeSettings() {
    if (!el.dialog.open || el.dialog.classList.contains("closing")) return;
    const finish = () => {
      clearTimeout(closingTimer);
      el.dialog.removeEventListener("animationend", onEnd);
      el.dialog.classList.remove("closing");
      if (typeof el.dialog.close === "function") el.dialog.close();
      else el.dialog.removeAttribute("open");
      // Return focus to the button that matches what the panel was for, so
      // Space then pauses a just-started exam rather than reopening settings
      (settingsMode === "start" ? el.startBtn : el.settingsBtn).focus({ preventScroll: true });
    };
    const onEnd = (e) => { if (e.target === el.dialog) finish(); };
    el.dialog.addEventListener("animationend", onEnd);
    el.dialog.classList.add("closing");
    closingTimer = setTimeout(finish, 450); // in case animations are disabled
  }

  // ---------- Exam times: by length or by clock time ----------
  const hmToMin = (v) => {
    if (!v) return null;
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  };
  const minToHm = (min) => {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  };
  const hmLabel = (v) => {
    const [h, m] = v.split(":").map(Number);
    return formatClockTime(new Date(2000, 0, 1, h, m));
  };

  /** Work out reading/writing lengths from the three clock-time fields. */
  function readClockTimes(f) {
    const ws = hmToMin(f.writingStart.value);
    const end = hmToMin(f.endTime.value);
    if (ws === null) return { error: "Enter when writing starts.", field: f.writingStart };
    if (end === null) return { error: "Enter when the exam ends.", field: f.endTime };
    const rs = hmToMin(f.readingStart.value) ?? ws;
    const R = (ws - rs + 1440) % 1440;
    const D = (end - ws + 1440) % 1440;
    if (R > 60) return { error: "Reading time can be at most 60 minutes. Check the start times.", field: f.readingStart };
    if (D === 0 || D > 600) return { error: "The exam must end after writing starts (and within 10 hours).", field: f.endTime };
    return { R, D, start: minToHm(rs), writing: minToHm(ws), end: minToHm(end) };
  }

  // The start time only counts when "At a set time" is chosen
  const chosenStart = (f) => (f.startWhen.value === "later" ? f.scheduledStart.value : "");

  /** Show the schedule as a small timeline: one row for reading, one for writing. */
  function setTimingSummary({ note = "", rows = [], error = "" }) {
    const box = el.timingSummary;
    box.textContent = "";
    box.classList.toggle("is-error", !!error);
    if (error) { box.textContent = error; return; }
    const make = (tag, cls, text) => {
      const n = document.createElement(tag);
      n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    if (note) box.appendChild(make("div", "tl-note", note));
    for (const r of rows) {
      const row = make("div", `tl-row ${r.kind}`);
      row.appendChild(make("span", "tl-dot"));
      row.appendChild(make("span", "tl-name", r.name));
      const time = make("span", "tl-time");
      time.append(r.from, make("span", "tl-arrow", "→"), r.to);
      row.appendChild(time);
      row.appendChild(make("span", "tl-len", r.len));
      box.appendChild(row);
    }
  }

  function scheduleRows(startMin, R, D) {
    const rows = [];
    if (R) rows.push({ kind: "reading", name: "Reading", from: hmLabel(minToHm(startMin)),
      to: hmLabel(minToHm(startMin + R)), len: formatShortMinutes(R) });
    rows.push({ kind: "writing", name: "Writing", from: hmLabel(minToHm(startMin + R)),
      to: D ? hmLabel(minToHm(startMin + R + D)) : "no set end", len: D ? formatShortMinutes(D) : "" });
    return rows;
  }

  function updateTimingForm() {
    const f = el.form.elements;
    const clock = f.timingMode.value === "clock";
    el.timingDuration.hidden = clock;
    el.timingClock.hidden = !clock;
    const later = f.startWhen.value === "later";
    el.startTimeField.hidden = !later;

    if (clock) {
      const r = readClockTimes(f);
      if (r.error) {
        const empty = !f.readingStart.value && !f.writingStart.value && !f.endTime.value;
        setTimingSummary({ error: empty ? "" : r.error });
      } else {
        setTimingSummary({ note: "Schedule", rows: scheduleRows(hmToMin(r.start), r.R, r.D) });
      }
    } else {
      const R = clampInt(f.readingMin.value, 0, 60, 0);
      const D = clampInt(f.durationMin.value, 0, 600, 0);
      const st = hmToMin(chosenStart(f));
      if (later && st === null) {
        setTimingSummary({ error: "Choose a start time." });
      } else {
        const d = new Date(now());
        const startMin = st ?? d.getHours() * 60 + d.getMinutes();
        setTimingSummary({ note: st === null ? "If you start now" : "Schedule", rows: scheduleRows(startMin, R, D) });
      }
    }
    updateSaveLabel();
  }

  // Switching modes carries the current times across
  function onTimingModeChange() {
    const f = el.form.elements;
    if (f.timingMode.value === "clock") {
      const st = hmToMin(chosenStart(f));
      if (st !== null && !f.writingStart.value && !f.endTime.value) {
        const R = clampInt(f.readingMin.value, 0, 60, 0);
        const D = clampInt(f.durationMin.value, 0, 600, 0);
        f.readingStart.value = minToHm(st);
        f.writingStart.value = minToHm(st + R);
        if (D) f.endTime.value = minToHm(st + R + D);
      }
    } else {
      const r = readClockTimes(f);
      if (!r.error) {
        f.readingMin.value = r.R;
        f.durationMin.value = r.D;
        f.scheduledStart.value = r.start;
        f.startWhen.value = "later";
      }
    }
    updateTimingForm();
  }

  function fillPresetOptions() {
    for (const p of PRESETS) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.name} (${p.readingMin} + ${p.durationMin} min)`;
      el.preset.appendChild(o);
    }
    el.preset.addEventListener("change", () => {
      const p = PRESETS.find((x) => x.id === el.preset.value);
      if (!p) return;
      const f = el.form.elements;
      f.examName.value = p.name;
      f.readingMin.value = p.readingMin;
      f.durationMin.value = p.durationMin;
      // In clock-time mode, keep the start and move the other times to match
      const rs = hmToMin(f.readingStart.value) ??
        (hmToMin(f.writingStart.value) !== null ? hmToMin(f.writingStart.value) - p.readingMin : null);
      if (rs !== null) {
        f.readingStart.value = minToHm(rs);
        f.writingStart.value = minToHm(rs + p.readingMin);
        f.endTime.value = minToHm(rs + p.readingMin + p.durationMin);
      }
      updateTimingForm();
    });
    el.form.addEventListener("input", (e) => {
      if (e.target.name === "timingMode") onTimingModeChange();
      else updateTimingForm();
      if (e.target.name === "startWhen" && e.target.value === "later") el.form.elements.scheduledStart.focus();
    });
  }

  const clampInt = (v, lo, hi, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };

  function saveSettings(e) {
    e.preventDefault();
    const f = el.form.elements;
    const clockMode = f.timingMode.value === "clock";
    let clockTimes = null;
    if (clockMode) {
      clockTimes = readClockTimes(f);
      if (clockTimes.error) {
        setTimingSummary({ error: clockTimes.error });
        clockTimes.field.focus();
        return;
      }
    }
    if (!clockMode && f.startWhen.value === "later" && !f.scheduledStart.value) {
      setTimingSummary({ error: "Choose a start time, or pick “When I press Start”." });
      f.scheduledStart.focus();
      return;
    }
    const prev = settings;
    settings = {
      ...settings,
      examName: f.examName.value.trim() || DEFAULTS.examName,
      readingMin: clampInt(f.readingMin.value, 0, 60, DEFAULTS.readingMin),
      durationMin: clampInt(f.durationMin.value, 0, 600, DEFAULTS.durationMin),
      scheduledStart: chosenStart(f),
      intervalMin: clampInt(f.intervalMin.value, 0, 60, DEFAULTS.intervalMin),
      bannerSec: clampInt(f.bannerSec.value, 3, 60, DEFAULTS.bannerSec),
      sound: f.sound.checked,
      hour12: f.hour12.value === "true",
      theme: THEMES.includes(f.theme.value) ? f.theme.value : "dark",
      showDate: f.showDate.checked,
      reduceMotion: f.reduceMotion.checked,
      warnings: [...el.form.querySelectorAll('input[name="warn"]:checked')].map((cb) => Number(cb.value)),
      timingMode: clockMode ? "clock" : "duration",
      readingStart: f.readingStart.value,
      writingStart: f.writingStart.value,
      endTime: f.endTime.value,
    };
    if (clockTimes) {
      // Clock times are stored as the equivalent lengths plus a start time,
      // so the rest of the clock works the same way in both modes.
      settings.readingMin = clockTimes.R;
      settings.durationMin = clockTimes.D;
      settings.scheduledStart = clockTimes.start;
      const changed = prev.timingMode !== "clock" || prev.scheduledStart !== settings.scheduledStart ||
        prev.readingMin !== settings.readingMin || prev.durationMin !== settings.durationMin;
      // A running clock-time exam follows edited times
      const st = exam && examState(now());
      if (st && st.phase !== "finished" && changed && settingsMode !== "start") {
        exam.startAt = scheduledStartMs();
      }
    }
    savePrefs();
    // Don't replay announcements that are now "in the past" because of changed durations
    lastE = exam ? examElapsed(now()) : null;
    applySettings();
    closeSettings();
    if (settingsMode === "start") beginExam();
    else if (settings.sound) chime(1);
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
  el.exitBtn.addEventListener("click", requestExit);
  el.exitConfirm.addEventListener("close", () => {
    if (el.exitConfirm.returnValue === "exit") exitExam();
  });
  el.skipBtn.addEventListener("click", skipAhead);
  el.announceDismiss.addEventListener("click", (e) => { e.stopPropagation(); hideAnnouncement(); });
  el.themeBtn.addEventListener("click", cycleTheme);
  el.settingsBtn.addEventListener("click", () => openSettings("settings"));
  el.fsBtn.addEventListener("click", toggleFullscreen);
  el.form.addEventListener("submit", saveSettings);
  el.settingsClose.addEventListener("click", closeSettings);
  el.settingsCancel.addEventListener("click", closeSettings);
  el.announce.addEventListener("click", hideAnnouncement);
  // Clicking the dialog backdrop closes it
  el.dialog.addEventListener("click", (e) => { if (e.target === el.dialog) closeSettings(); });
  // Esc: animate the panel out instead of closing instantly
  el.dialog.addEventListener("cancel", (e) => { e.preventDefault(); closeSettings(); });

  document.addEventListener("fullscreenchange", updateFsButton);
  document.addEventListener("webkitfullscreenchange", updateFsButton);

  ["mousemove", "mousedown", "touchstart", "keydown", "focusin"].forEach((t) =>
    document.addEventListener(t, wake, { passive: true }));

  // Double-click anywhere on the clock to toggle full screen
  $("stage").addEventListener("dblclick", toggleFullscreen);

  document.addEventListener("keydown", (e) => {
    if (el.dialog.open || el.exitConfirm.open || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "select", "textarea"].includes(tag)) return;
    const onButton = tag === "button";
    switch (e.key.toLowerCase()) {
      case "f": toggleFullscreen(); break;
      case "s": e.preventDefault(); openSettings("settings"); break;
      case "t": cycleTheme(); break;
      case "e":
      case "r": requestExit(); break;
      case "w": skipAhead(); break;
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

  // Keep display preferences in step across open tabs
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_SETTINGS) {
      settings = { ...settings, ...loadPrefs() };
      applySettings();
    }
  });

  // ---------- Boot ----------
  fillPresetOptions();
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
