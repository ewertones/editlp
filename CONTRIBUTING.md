# Contributing

Thanks for your interest in improving **editlp**. The project is small and self-contained, so contributions of any size are welcome — typo fixes, new features, bug reports, or just feedback.

## Ground rules

- Be kind. This is a hobby project; let's keep the tone friendly.
- Open an issue *before* a large change so we can agree on scope.
- Keep PRs focused — one logical change per PR is much easier to review.

## Development setup

You need [Go 1.21+](https://go.dev/dl/) installed; that's it. There's no npm, no build step for the frontend, no database.

```sh
git clone https://github.com/ewertones/editlp.git
cd editlp
go run .
```

Open <http://localhost:8080>. The Go process is a static file server only — all of the editor logic lives in [`static/app.js`](static/app.js). Edit the files under `static/` and refresh the page.

### Useful flags

- `-addr :9000` change the listen address (default `:8080`)
- `-dir some/path` serve a different static directory (default `static`)

### Smoke test

```sh
go build ./...
go vet ./...
```

CI runs these on every push and PR via [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Project layout

```
.
├── main.go                 # static file server (no business logic)
├── go.mod
├── static/
│   ├── index.html          # two-pane UI
│   ├── app.js              # parser, serializer, sync, preview, undo/redo
│   └── style.css
├── .github/workflows/      # CI
├── LICENSE
├── README.md
└── CONTRIBUTING.md
```

## Style

- **JavaScript** — vanilla, no framework, no build step. Match the surrounding style (no semicolons-vs-semicolons debates, just look at neighbouring lines). Avoid pulling in dependencies unless there's a strong reason.
- **CSS** — CSS variables are defined at `:root`; reuse them rather than hardcoding colours. Verse-type palettes live as `--t-{type}-{bg,border,ink}`.
- **Go** — only the file server lives here, so just `gofmt` and `go vet`.

## Commit messages

Short imperative subject line ("add minify button", not "added a minify button"). Wrap the body at ~72 characters if there is one. Reference issues with `Fixes #N` where appropriate.

## Reporting bugs

Open an issue with:

1. A short description of what you expected vs. what happened.
2. Steps to reproduce (XML you fed in, buttons you clicked).
3. Browser + OS.

If you can paste the offending XML inline, even better.
