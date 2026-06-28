# AGENTS.md — AniSmooth

Free local After Effects extension for AI frame interpolation and video upscaling. Windows-only. NVIDIA GPU required.

## AI Agent Instructions

- **Update this file** when adding/removing files, changing architecture, adding new build steps, or introducing conventions.
- **Commit style:** prefix tag in parentheses — `(add)` new features, `(fix)` bug fixes, `(update)` refactors/formatting/chores. Title case after colon. Example: `(fix) Clamp work area bounds to prevent AE out-of-range error`.
- **Commit author:** always commit under the user's account. Do NOT add a `Co-Authored-By: Claude` trailer or any self-attribution — keep Claude out of the commit entirely.
- **Commit per task:** make a separate commit after each task / logical change. Do not batch unrelated changes into one commit.
- **No code comments:** do NOT add comments when writing or modifying code. Put any needed explanation in the commit message or this file, not inline.

## Build & Run

```bash
cd tools && npm install          # devDeps: javascript-obfuscator, jsxbin, zxp-sign-cmd
cd .. && npm run build:all       # 2018 + 2020 + 2022 + docs (root forwards to tools via --prefix)
```

Root `package.json` is a thin shim; real scripts live in `tools/package.json`:

| Command | Action |
|---|---|
| `npm run build` | Single ZXP, default target 2020 |
| `npm run build:2018\|2020\|2022` | Single target |
| `npm run build:all` | All 3 targets + `generate-docs.js` |
| `npm run docs` | Regenerate docs only |

- No test framework. No lint/typecheck.
- Build pipeline (`tools/build.js`): strip comments (`remove_comments.py`) → obfuscate JS → compile JSXBIN → patch manifest per target → sign ZXP. Installer EXE via Inno Setup (`tools/installer.iss`).
- CI: `.github/workflows/build.yml`.
- **`jsx/host.jsx` is compiled to JSXBIN at build** — source edits need a rebuild before they take effect in AE.

## Tech Stack

| Layer | Tech |
|---|---|
| Extension | Adobe CEP 6.0–10.0, CSXS |
| UI | Vanilla JS (no framework), HTML, CSS custom properties |
| AE bridge | CEP CSInterface.js + ExtendScript (`jsx/host.jsx`) |
| Node.js | CEF `--enable-nodejs --mixed-context` → `require('fs')`, `child_process` |
| Backend | Python 3.10–3.13 CLI (`python/main.py`) via `child_process.spawn` |
| ML | PyTorch CUDA, spandrel 0.3.4, TensorRT (optional) |
| Video | OpenCV, FFmpeg/FFprobe |

## Directory Map

Repo root holds build tooling; the CEP extension itself lives in `AniSmooth/`.

```
<repo root>/
├── package.json               # Shim → tools scripts via --prefix
├── .github/workflows/build.yml
├── tools/
│   ├── build.js               # Obfuscate → JSXBIN → patch manifest → sign ZXP
│   ├── generate-docs.js
│   ├── remove_comments.py
│   └── installer.iss          # Inno Setup script
└── AniSmooth/                 # ← the extension (everything below)
├── CSXS/manifest.xml          # CEP manifest (patched per AE target at build)
├── index.html                 # SPA shell: topbar nav + tab containers
├── css/style.css              # Dark/light theme, ~860 lines
├── css/toolsSetup.css         # First-run wizard styles
├── tabs/*.html                # Tab fragments: interpolation, upscale, deadframes,
│                              #   queue, sysmon, console, settings, stopwatch (tabLoader.js)
├── js/
│   ├── CSInterface.js         # Adobe boilerplate (NOT obfuscated)
│   ├── console.js             # dbg(level, source, msg) global logger
│   ├── main.js                # App singleton: init, tabs, GPU, settings, presets
│   ├── components/            # One panel controller per tab
│   │   ├── interpolationPanel.js
│   │   ├── upscalePanel.js
│   │   ├── deadframesPanel.js
│   │   ├── queuePanel.js
│   │   ├── consolePanel.js
│   │   ├── sysmonPanel.js
│   │   └── toolsSetup.js      # First-run wizard
│   └── utils/
│       ├── fileSystem.js      # Node fs/path/os/child_process wrappers + PS dialogs
│       ├── storage.js         # localStorage wrapper (keys: anismooth_*)
│       ├── modelHandler.js    # Singleton: spawns Python for all 3 modes
│       ├── queueManager.js    # Batch queue: pause/cancel/retry/persist
│       ├── customSelect.js
│       └── tabLoader.js
├── jsx/host.jsx               # ExtendScript: AE render, layer info, file import
└── python/
    ├── main.py                # CLI entry: --mode interpolate|upscale|dedupe|gpu-info
    ├── setup.py               # Bootstrap: venv, pip, FFmpeg download
    ├── models/
    │   ├── rife/              # RIFEModel: CUDA + TensorRT
    │   ├── upscale/           # ShuffleCUGAN (spandrel fallback)
    │   ├── weight_loader.py   # Download/cache/verify model weights
    │   └── tensorrt_engine.py
    ├── duplicate_frame_remover/  # Perceptual hash + pixel diff
    └── utils/
        ├── device.py          # GPU detection, nvidia-smi
        └── video.py           # OpenCV I/O + FFmpeg pipe/mux/re-encode
```

## Key Architecture

### Frontend JS → After Effects

CEP `evalScript()` calls ExtendScript functions in `host.jsx`, returns JSON string via callback. No `JSON.stringify` in ExtendScript → custom `jsonEscape()` builds JSON by hand.

```
Panel JS → evalScript('renderSelectedLayer(dir, name, idx)') → host.jsxbin → AE render → JSON callback
```

### Frontend JS → Python Backend

```
Panel JS → ModelHandler.*Clip() → spawn(python, [main.py, --mode, ...]) → stdout JSON lines → callbacks
```

Python stdout format: `{"type":"info|warn|error|success|progress","msg":"...","pct":...}`. JS reads line-by-line from `proc.stdout.on('data')`.

### Pipeline Flow

1. AE renders selected layer to temp AVI (ExtendScript)
2. Python processes frame-by-frame (OpenCV → model → FFmpeg pipe)
3. Python muxes original audio (FFmpeg)
4. JS imports output back into AE (`importFileToAE`)

## Code Conventions

- **All JS modules:** IIFE-wrapped globals on `window` — no ES modules, no bundler
- **Indentation:** 2-space, K&R braces
- **Naming:** camelCase vars/fns, PascalCase modules, snake_case localStorage keys
- **Async:** callbacks only — no Promises, no async/await
- **DOM:** vanilla `document.getElementById`, `addEventListener`, `classList`
- **Logging:** `dbg(level, source, message)` — levels: debug, info, warn, error, success
- **`var` only** (no let/const — CEP Chromium is old)
- **Python:** snake_case, `argparse` subcommands, lazy/cached model loading
- **ExtendScript:** ES3 with AE DOM, JSON by string concat

## Critical Paths

| File | Role |
|---|---|
| `queueManager.js` | **Two decoupled pipelines.** Render: `add()` sets status `rendering` and calls `_pumpRender()` (serialised by `_renderBusy`, `_doAERender()` runs the AE render) so the clip is captured at ENQUEUE time — correct even if added while another job runs or the AE selection later changes. Model: `_processNext()` (guarded by `_running`) picks a `queued` item → `_beginModel()` uses the stored `inputPath` (falls back to on-demand render if missing) → `_runModel()` → `ModelHandler.*Clip()`. Status flow: `rendering → queued → processing → done/error`. Pre-rendered temp inputs are dropped on restore (`init`) since the temp file may be gone |
| `modelHandler.js` | Singleton `activeProcess` + `_cancelling` flag prevents concurrent Python spawns. `executeModel()` spawns, `cancelActiveProcess()` kills via `taskkill /F /T` |
| `host.jsx` | `renderSelectedLayer()` renders one layer to a temp AVI. **Time-coord trap — three different spaces:** `layer.inPoint/outPoint` are DISPLAY-relative (offset by `displayStartTime`); `comp.workAreaStart` is ABSOLUTE 0-based (range `[0, duration]`); `RenderQueueItem.timeSpanStart` is DISPLAY-relative (range `[displayStartTime, displayStartTime+duration]`). Compute `absStart = toAbsRenderTime(inPoint)`, then `workAreaStart = absStart` but `timeSpanStart = absStart + displayStartTime`. Mixing them throws "value out of range" or the "timeSpanStart of 0 ... blank frames" warning (one-frame render). **Precomp:** if `layer.source instanceof CompItem`, queue that source comp at its full duration (no solo) instead of soloing the precomp in the parent — soloing renders the parent's slot, which is often offset/empty → black frames. `importFileToAE()`: capture `selectedLayers` BEFORE `layers.add()` — add reselects to the new layer, so `moveAfter` would target itself |
| `main.py` | `argparse` → dispatch. Quality presets at top of file. Scene detection threshold: 0.40 |

## Python Path Resolution

1. `%APPDATA%/com.moongetsu.extensions/AniSmooth/backend/.venv/Scripts/python.exe`
2. User-configured `settings.pythonPath` (default `"python"`)
3. `findLocalPython()` scans `%LOCALAPPDATA%/Programs/Python/`

## Storage

- `localStorage` keys: `anismooth_*` (settings, processing queue, python path, GPU cache)
- Filesystem: `%APPDATA%/com.moongetsu.extensions/AniSmooth/backend/` (venv, FFmpeg, weights, presets)
- Output: user-configurable, defaults to `~/Downloads/AniSmooth/`

## CEP Quirks

- Must have `PlayerDebugMode = 1` in registry for unsigned extensions
- Three AE targets need different manifest version ranges — patched at build
- CSP restricts to `'self'` except Font Awesome CDN
- No macOS support — Windows-only (PowerShell, taskkill, Inno Setup)
