# VWS Journal

**The journal built for learning your preferred system.**

Log every trade with your system context: market condition, location, setup, direction, evidence, invalidation, target and psychology. Then track your progress in applying the system. The focus is not on profit and loss, but on learning to execute the system well.

**Open the journal: [vwsjournal.com](https://vwsjournal.com)**

Private by design: no account, no subscription, no cloud. Your journal lives in a folder on your own computer.

---

## Features

- **Every trade with its system context.** Pick symbol, market condition, location, setup, direction, evidence, invalidation, target, psychology and result with one click each. The form remembers your last symbol and market condition.
- **Chart screenshots.** Paste, drop or upload a screenshot, or connect your charting window once and capture it with one click (**Auto-Capture**).
- **Weekly calendar.** See wins, losses and break-evens per day at a glance and jump between days and weeks.
- **Card and list view.** Full trade cards with the screenshot, or a compact list you can expand per trade.
- **Track your progress.** 11 built-in charts, such as execution growth, setup effectiveness, invalidation losses and psychology, by day, symbol, market condition, location and setup. Filter by year, month, week or day.
- **Custom charts.** Turn your own questions into a chart, for example "How does Return to Value do in a balanced market?"
- **Made to fit how you trade.** Edit all lists (locations, setups, evidence, targets, psychology) in Settings and switch sections on or off, so the journal matches the way you trade.
- **Dark and light mode**, keyboard shortcuts, and installable as a desktop app.

## Requirements

- **Google Chrome** or **Microsoft Edge** on a desktop or laptop (Windows, macOS, Linux or ChromeOS).
- The journal does not work in Safari or Firefox, or on phones and tablets. It needs access to a folder on your computer, which only these browsers on a computer support.

## Getting started

1. Create an empty folder on your computer, for example `VWAP Journal`.
2. Open [vwsjournal.com](https://vwsjournal.com) in Chrome or Edge.
3. Click **Connect Folder**, select the folder and allow access.
4. Click **Add Trade** and log your first trade.

Next time you open the journal, Chrome asks for permission once and you continue where you left off.

**Already have a settings file?** Put your `settings.json` in the folder before you connect it, and the journal uses your own lists.

### Install as a desktop app (optional)

In Chrome, open the menu (three dots, top right), choose **Cast, save and share** and then **Install page as app...**. The journal then opens in its own window, like any other program.

## Your data

Everything is saved in the folder you connected:

| File | What it holds |
| --- | --- |
| `vwap-journal.json` | All your trades |
| `settings.json` | Your lists, enabled sections and preferences |
| `img/` | The screenshots of your trades |

Your trades never leave your computer. To make a backup, copy the folder. To move to another computer, copy the folder there and connect it.

## Keyboard shortcuts

| Action | Mac | Windows |
| --- | --- | --- |
| New trade | Option + N | Alt + N |
| Dark / light mode | Option + M | Alt + M |
| Jump to today | Option + T | Alt + T |
| Previous / next day | Arrow Left / Right | Arrow Left / Right |
| Previous / next week (same weekday) | Shift + Arrow Left / Right | Shift + Arrow Left / Right |
| Save trade (in the trade popup) | Option + S | Alt + S |
| Close the trade popup | Option + C | Alt + C |
| Delete trade (in the trade popup) | Option + Backspace | Alt + Backspace |

Day and week shortcuts work on the dashboard when you are not typing in a field.

## Project structure

The journal is a static web app: plain HTML, CSS and JavaScript, hosted on GitHub Pages. There is no build step and nothing is loaded from other websites at runtime, apart from privacy-friendly Cloudflare Web Analytics.

| File | Purpose |
| --- | --- |
| `index.html` | The app: layout, pages and popups |
| `styles.css` | All styling, including dark and light theme |
| `globals.js` | Shared state and helpers |
| `storage.js` | Reading and writing the journal folder |
| `gate.js` | The start screen: connecting a folder, unsupported browsers and devices |
| `tradeform.js` | The Add Trade form |
| `ui.js` | Dashboard, weekly calendar, trade cards and settings |
| `charts.js` | Statistics page |
| `customcharts.js` | Custom charts |
| `app.js` | Start-up, navigation and keyboard shortcuts |
| `settings.json` | Default settings |
| `vendor/` | Chart.js 4.5.1 and Flatpickr 4.6.13, stored in the repo at a fixed version |

### Running it locally

Serve the folder with any static web server and open it in Chrome or Edge, for example:

```bash
python3 -m http.server 8000
```

Then go to `http://localhost:8000`. Folder access works on `localhost` as well.

## Support

Questions, ideas or a bug? Mail **hello.ordercraft@gmail.com**.

## Made by Order Craft

Order Craft makes tools for traders who want to get better at their trading system, including [Stream Deck icons for DOM scalping](https://marketplace.elgato.com/@ordercraft).
