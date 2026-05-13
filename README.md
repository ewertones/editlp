# editlp

[![Deploy](https://github.com/ewertones/editlp/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ewertones/editlp/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Made with vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow)](static/app.js)
[![Live demo](https://img.shields.io/badge/demo-online-2da44e)](https://ewertones.github.io/editlp/)

> A zero-dependency, browser-based editor, parser, and viewer for [OpenLP](https://openlp.org/) song XML.

![editlp screenshot — two-pane editor with XML on the left and structured form on the right](docs/screenshot.webp)

editlp opens, edits, validates, and previews the XML blob that OpenLP stores in the `songs.lyrics` column — the canonical format below. Everything runs client-side, so the live demo is just static files on GitHub Pages.

```xml
<?xml version='1.0' encoding='UTF-8'?>
<song version="1.0">
  <lyrics>
    <verse label="1" type="v"><![CDATA[Line one
Line two]]></verse>
    <verse label="1" type="c"><![CDATA[Chorus line one
Chorus line two]]></verse>
  </lyrics>
</song>
```

Verse `type` codes: `v` verse, `c` chorus, `p` pre-chorus, `b` bridge, `i` intro, `e` ending, `o` other. `label` is a per-type number — the `(type, label)` pair identifies a verse (`v1`, `c1`, …).

---

## Table of contents

- [Try it](#try-it)
- [Features](#features)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Running it locally](#running-it-locally)
- [Notes & limitations](#notes--limitations)
- [Contributing](#contributing)
- [License](#license)

## Try it

### Hosted

**<https://ewertones.github.io/editlp/>** — nothing to install.

### Locally / offline

There's no build step and no runtime to install. Clone the repo and open the file in your browser, or serve `static/` with any one-liner static server.

```sh
git clone https://github.com/ewertones/editlp.git
cd editlp
# pick whichever you have handy:
python -m http.server 8080 -d static     # Python
npx serve static                         # Node
# ...or just open static/index.html directly in your browser
```

Then visit <http://localhost:8080>. Air-gapped worship laptops welcome.

## Features

- **File open** — drop a `.xml` onto the left pane, or pick one with the file input in the navbar.
- **Prettify / Minify** — toggle the textarea between multi-line-per-verse (each `<verse>` on its own line, CDATA indented, `</verse>` on its own line) and a single-line whole-document layout. Both modes are sticky until toggled off; the default is the compact one-verse-per-line form.
- **Autonumber** — re-number labels per type, top-down (`v c v v` → `v1 c1 v2 v3`).
- **Duplicate verse** — per-verse `copy` button next to up/down/remove.
- **Drag-and-drop reorder** — grab a verse by its `⋮⋮` handle and drop above or below another verse.
- **Per-verse formatting toolbar** — wraps the selection in OpenLP formatting tags: `{st}` bold, `{it}` italic, `{u}` underline, `{su}` superscript, `{sb}` subscript, `{r}` red, `{br}` line break. Preview faithfully renders all of these. See [OpenLP's display tags](https://manual.openlp.org/display_tags.html) for the full list.
- **Verse-order field** — round-tripped as `<properties><verseOrder>` inside `<song>`.
- **Validation** — flags duplicate `(type, label)` pairs, empty bodies, non-numeric labels, and verse-order tokens that don't match any verse.
- **Color-coded verse types** — light pastels in the form and preview; chorus is bold + italic in the preview.
- **Semantic version editor** — three fields (major / minor / patch) with one-click ▲ bump (resets lower parts) and ▼ decrement.
- **Undo / redo** — Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z), with sticky snapshots across form/XML edits.
- **Persistence** — current XML and verse order auto-saved to `localStorage`.
- **Timestamped filename** — placeholder and download fallback are `song-YYYYMMDDHHMMSS.xml`.

## Keyboard shortcuts

| Shortcut                    | Action          |
| --------------------------- | --------------- |
| `Ctrl+Z`                    | Undo            |
| `Ctrl+Y` / `Ctrl+Shift+Z`   | Redo            |
| `Ctrl+S`                    | Download `.xml` |
| `Ctrl+Enter`                | Add verse       |

(macOS users: substitute `⌘` for `Ctrl`.)

## How it works

- The entire editor lives in [`static/app.js`](static/app.js): DOMParser-based XML parsing, manual serialization with CDATA-safe escaping, validation, undo/redo, drag-and-drop, and the preview render.
- **Left pane** — raw XML textarea.
- **Right pane** — structured form with an inline live preview tab.
- Both sides are editable; a change on either side re-syncs the other.

## Project layout

```
.
├── static/
│   ├── index.html          # two-pane UI
│   ├── app.js              # parser, serializer, sync, preview, undo/redo, drag, etc.
│   └── style.css
├── docs/
│   └── screenshot.webp
├── .github/workflows/      # GitHub Pages deploy
├── LICENSE
├── README.md
└── CONTRIBUTING.md
```

## Running it locally

You don't need anything installed. Three equally good options:

| Method                            | Command                                           |
| --------------------------------- | ------------------------------------------------- |
| Open the file directly            | Double-click `static/index.html`                  |
| Python (any 3.x)                  | `python -m http.server 8080 -d static`            |
| Node                              | `npx serve static`                                |

Opening `index.html` over `file://` works for most features. If something feels off (rare), use a real HTTP server — that's what GitHub Pages uses too.

There's no build step. Edit anything under [`static/`](static/) and hard-refresh (`Ctrl+F5`).

## Notes & limitations

- CDATA content containing `]]>` is split across multiple CDATA sections on serialization (the only valid way to escape it).
- The editor exposes `version`, the verse list, and `verseOrder`. Any other attributes on `<song>` are preserved as-is across round-trips.
- Native textarea undo is overridden by our global Ctrl+Z (which snapshots the full XML state). Granular character-level undo of one textarea isn't preserved; the trade-off is a consistent app-wide undo stack.
- `verseOrder` doesn't live inside OpenLP's internal `songs.lyrics` blob — we round-trip it as a `<properties><verseOrder>` sibling so it survives our editor. Strip that element before re-inserting into the SQLite column.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, style, and ground rules.

If editlp saves you a few hours of hand-editing XML, consider [buying me a coffee](https://www.buymeacoffee.com/ewertones) ☕.

## License

[MIT](LICENSE) © 2026 Ewerton Souza
