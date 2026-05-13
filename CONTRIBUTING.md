# Contributing

Thanks for your interest in improving **editlp**. The project is small and self-contained, so contributions of any size are welcome — typo fixes, new features, bug reports, or just feedback.

## Ground rules

- Be kind. This is a hobby project; let's keep the tone friendly.
- Open an issue *before* a large change so we can agree on scope.
- Keep PRs focused — one logical change per PR is much easier to review.

## Development setup

editlp is plain HTML / CSS / JavaScript — no build step, no toolchain. Clone the repo and serve `static/`:

```sh
git clone https://github.com/ewertones/editlp.git
cd editlp
# any of these will do:
python -m http.server 8080 -d static
npx serve static
# ...or just open static/index.html directly in your browser
```

Edit anything under [`static/`](static/) and hard-refresh the browser (`Ctrl+F5`).

### Live site

`main` is auto-deployed to <https://ewertones.github.io/editlp/> by [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). PR merges go live within a minute.

## Project layout

```
.
├── static/
│   ├── index.html          # two-pane UI
│   ├── app.js              # parser, serializer, sync, preview, undo/redo, drag, etc.
│   └── style.css
├── docs/screenshot.webp
├── .github/workflows/      # GitHub Pages deploy
├── LICENSE
├── README.md
└── CONTRIBUTING.md
```

## Style

- **JavaScript** — vanilla, no framework, no build step. Match the surrounding style. Avoid pulling in dependencies unless there's a strong reason.
- **CSS** — CSS variables are defined at `:root`; reuse them rather than hardcoding colours. Verse-type palettes live as `--t-{type}-{bg,border,ink}`.
- **HTML** — semantic-ish; keep the markup short.

## Commit messages

Short imperative subject line ("add minify button", not "added a minify button"). Wrap the body at ~72 characters if there is one. Reference issues with `Fixes #N` where appropriate.

## Reporting bugs

Open an issue with:

1. A short description of what you expected vs. what happened.
2. Steps to reproduce (XML you fed in, buttons you clicked).
3. Browser + OS.

If you can paste the offending XML inline, even better.
