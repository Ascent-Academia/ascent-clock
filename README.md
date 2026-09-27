<p align="center">
  <img src="brand/ascent-full-logo-purple.svg" alt="Ascent Academia" width="260">
</p>

# Exam Clock

A clean, full-screen exam clock for running VCE trial exams at Ascent Academia.
It shows the time with seconds, reading and writing time, regular time checks and the time remaining. It is designed to be projected on a large TV or 4K projector.

**Open the clock:** https://ascent-academia.github.io/ascent-clock/

It works in any modern browser (Chrome, Edge, Safari, Firefox) on a laptop, TV, tablet or phone, with nothing to install.

---

## On exam day

1. Open the clock on the computer connected to the TV or projector, and press <kbd>F</kbd> for full screen.
2. Press **Start exam** (or <kbd>Space</kbd>). A setup panel opens. Nothing starts until you confirm.
3. Pick a **VCE preset** (or type your own title), then set the times one of two ways:
   - **Length**: reading and writing time in minutes. Choose whether the exam starts **when you press Start** or **at a set time**.
   - **Clock time**: when reading starts, when writing starts and when the exam ends (e.g. 9:00 / 9:15 / 11:45).

   The schedule box below shows exactly when reading and writing run, e.g. Reading 9:00 → 9:15, Writing 9:15 → 11:15.
4. Press **Start exam**. If the start is in the future the button says **Schedule exam**, and the clock counts down and starts by itself.
5. When you're finished, press **Exit exam** to go back to the plain clock.

Before an exam starts, the screen shows only the clock and date. The controls and mouse cursor fade out after a few seconds; move the mouse or press a key to bring them back.

## Features

### The clock
- Large HH:MM:SS display with smoothly rolling digits, sized to fill anything from a phone to a 4K screen.
- 24-hour or 12-hour format, and the date in Australian style ("Saturday 26 September 2026").
- Three themes: **Midnight** (dark, the default for projectors), **Daylight** (for bright rooms) and **High contrast** (black and white, for maximum legibility).
- The exam title sits beside the Ascent Academia logo. A title too long to fit glides sideways to show the rest, then back (it stays still with "…" when Reduce motion is on).

### Exam timing
- Optional **reading time**, then **writing time**, set either as lengths or as clock times (reading starts / writing starts / exam ends).
- The panel below the clock shows when writing began, time elapsed, time remaining and the finish time. **Time remaining** counts down writing time only: before writing starts (during a countdown or reading time) it shows the full writing time and holds still.
- A progress bar marked with the actual clock times (e.g. 9:25, 9:35 … 11:45).
- **Skip to writing** ends reading time early and starts writing time straight away. While counting down to a scheduled start, the same button reads **Start now**. Both need a second press to confirm.
- **Pause / resume** for interruptions such as fire drills. The finish time moves forward by the time spent paused.
- **Exit exam** stops the timer and returns to the plain clock, after a confirmation.
- Writing time of `0` gives an open-ended timer that just counts up.

### Announcements
- A large banner appears across the screen at regular intervals (every 5, 10, 15, 20, 30 or 60 minutes), for example "30 minutes have passed · 1 hour 30 minutes remaining".
- Warnings when 60, 30, 15, 10, 5 or 1 minutes remain (choose any combination).
- Short banners mark the start of reading time and writing time (they close after 5 seconds), and "Time is up — please put your pens down" shows at the end.
- Close any banner early with **Dismiss**, a tap or click anywhere on it, or <kbd>Esc</kbd>.
- An optional soft chime can play with each announcement. It is off by default.

### VCE presets

| Preset | Reading | Writing |
| --- | --- | --- |
| Mathematical Methods — Exam 1 | 15 min | 1 hour |
| Mathematical Methods — Exam 2 | 15 min | 2 hours |
| Specialist Mathematics — Exam 1 | 15 min | 1 hour |
| Specialist Mathematics — Exam 2 | 15 min | 2 hours |
| General Mathematics — Exam 1 | 15 min | 1 hour 30 min |
| General Mathematics — Exam 2 | 15 min | 1 hour 30 min |
| Physics | 15 min | 2 hours 30 min |
| Chemistry | 15 min | 2 hours 30 min |

Check these against the current VCAA exam timetable each year. The presets are set in `PRESETS` near the top of `app.js`.

### Accurate time
- The display updates exactly on the start of each second, and a safety check catches any late update within 0.2 s.
- Elapsed and remaining times are worked out from the exam's start time, not by counting ticks, so they never drift, even over a three-hour exam.
- The computer's clock is checked against internet time when the page opens, every 30 minutes, and when you press **Check clock now** (in ⚙ Settings). If the computer's clock is wrong by more than a second, the display corrects itself, shows a small note under the date, and explains it in the settings panel.
- If there is no internet connection, the clock uses the computer's own time. Make sure the computer's date and time are set automatically.

### Reliability and accessibility
- **Refresh for a clean start:** refreshing the page clears any running exam and resets the exam setup. Display and announcement preferences (theme, 12/24-hour, date, reduce motion, chime, announcement interval and warnings) are remembered.
- **Works offline** once it has been opened, so a Wi-Fi drop mid-exam doesn't matter.
- **Keeps the screen awake** while an exam is running or the clock is in full screen, where the browser supports it.
- Full keyboard control, screen-reader announcements for each time check, and a **Reduce motion** option (it also follows the computer's accessibility setting).

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>F</kbd> (or double-click the clock) | Full screen on / off |
| <kbd>Space</kbd> | Start an exam (opens setup), or pause / resume a running one |
| <kbd>S</kbd> | Open settings (display, announcements, time accuracy) |
| <kbd>T</kbd> | Switch theme |
| <kbd>W</kbd>, then <kbd>W</kbd> again | Skip to writing time (or start now during a countdown) |
| <kbd>E</kbd> | Exit the exam (asks to confirm) |
| <kbd>Esc</kbd> | Close a banner, the settings panel or the exit confirmation |

## Hosting

The site is published with GitHub Pages from the `main` branch. To set it up (one time only): in the repository open **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)` and **Save**. After each change to `main`, the live clock updates within a minute or two.

To run it on your own computer instead:

- Open `index.html` in a browser. Everything works except the internet-time check and offline mode, which need the page to be served from a web address.
- Or serve the folder: `npx http-server .` (or `python3 -m http.server`) and open the address it prints.

## Project files

| Path | What it is |
| --- | --- |
| `index.html` | Page structure, including the inline logo and the settings panel |
| `styles.css` | Layout, themes and animations. Brand colours are the `--brand-*` variables at the top |
| `app.js` | Clock, exam timing, announcements, time check and settings |
| `sw.js` | Offline support. Increase `CACHE` (e.g. `ascent-clock-v3`) whenever you change a file, so browsers pick up the new version |
| `brand/` | Official Ascent Academia logo files (brand violet `#8c68ac`) |
| `fonts/` | Manrope typeface, stored locally so the clock works offline |
| `icon.svg`, `favicon-*.png`, `apple-touch-icon.png`, `icon-*.png`, `icon-app.svg`, `manifest.webmanifest` | Browser tab icons, home-screen / installed-app icons and install-as-app details |

There is no build step. Edit the files and push.

## Credits

Manrope by Mikhail Sharanda, used under the [SIL Open Font License 1.1](https://openfontlicense.org).
Logo and brand © Ascent Academia.
