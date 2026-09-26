# Ascent Academia · Exam Clock

A clean, full-screen digital clock (with seconds) for running VCE trial exams at Ascent Academia.
It is built to be projected on a large TV or 4K projector and works in any modern browser with nothing to install.

## Features

- **Large, animated clock** (HH:MM:SS). Each digit rolls smoothly when it changes. It scales from a phone up to a 4K screen.
- **Ascent Academia branding**: the official logo (`brand/`), brand violet `#8c68ac` and the Manrope typeface, bundled so it works offline.
- **VCE presets**: one click sets the standard reading and writing time for Mathematical Methods, Specialist and General Mathematics (Exams 1 and 2), Physics and Chemistry. All use 15 minutes of reading time.
- **Exam timing**: optional reading time, then writing time. It shows the start time, time elapsed, time remaining, the finish time and a progress bar.
- **Time-check announcements**: a full-screen banner such as "10 minutes have passed" appears every 5/10/15/20/30/60 minutes (you choose). Warnings appear at 60/30/15/10/5/1 minutes remaining, plus "Time is up — pens down" at the end. An optional soft chime can play with each one.
- **Accurate time**
  - Updates are aligned to the exact start of each second, and a watchdog fixes any late timer within 0.2 s.
  - Elapsed and remaining times are worked out from timestamps, not by counting ticks, so they never drift.
  - The device clock is checked against internet time (the web server's clock) when the page loads, every 30 minutes, and on demand under Settings → Time accuracy. If the device clock is out by more than a second, the display is corrected automatically.
- **Pause / resume** for interruptions such as fire drills. The finish time moves forward to match.
- **Scheduled start**: set a start time (e.g. 09:00) and the clock counts down, then starts itself.
- **Survives a refresh**: the running exam is saved in the browser. Two tabs on the same computer (e.g. a laptop plus a TV on an extended display) stay in sync.
- **Full screen** with one click, the <kbd>F</kbd> key or a double-click. The screen is kept awake (Wake Lock), and the mouse cursor and controls hide when idle.
- **Accessible**: Midnight, Daylight and High-contrast themes, full keyboard control, screen-reader announcements, and a reduce-motion option (it also follows the OS setting).
- **Works offline** once loaded (a service worker caches the app), so a Wi-Fi drop mid-exam doesn't matter.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>F</kbd> | Toggle full screen |
| <kbd>Space</kbd> | Start / pause / resume the exam |
| <kbd>S</kbd> | Open settings |
| <kbd>T</kbd> | Cycle theme |
| <kbd>R</kbd> | Reset the exam |
| <kbd>Esc</kbd> | Dismiss an announcement |

## Running it

It is a static site (`index.html`, `styles.css`, `app.js`) with no build step.

- **Quickest:** open `index.html` in a browser. Everything works except the internet-time check and offline caching, which need the page to be served over http(s).
- **Locally over http:** `npx http-server .` (or `python3 -m http.server`) and open the printed address.
- **Share with everyone (GitHub Pages):** in the repository go to *Settings → Pages*, choose *Deploy from a branch*, select `main` and `/ (root)`. The clock will then be at `https://<owner>.github.io/ascent-clock/`.

## Tips for exam rooms

1. Open the clock on the computer connected to the TV or projector and press <kbd>F</kbd>.
2. Press <kbd>S</kbd> to open the settings panel, pick a VCE preset or set the exam title, reading and writing time, and how often to announce.
3. Press **Start exam** (or <kbd>Space</kbd>) when reading time begins, or set a *Scheduled start*.
4. Check *Settings → Time accuracy* says the clock is verified.
