# AGENTS.md - AniSmooth

Free local After Effects extension for AI frame interpolation and video upscaling. Windows-only. NVIDIA GPU required.

## AI Agent Instructions

- **Update this file** when adding/removing files, changing architecture, adding new build steps, or introducing conventions.
- **Commit style:** prefix tag in parentheses: `(add)` new features, `(fix)` bug fixes, `(update)` refactors/formatting/chores. Title case after colon. Example: `(fix) Clamp work area bounds to prevent AE out-of-range error`.
- **Commit author:** always commit under the user's account. Do NOT add a `Co-Authored-By: Claude` trailer or any self-attribution; keep Claude out of the commit entirely.
- **Commit per task:** make a separate commit after each task / logical change. Do not batch unrelated changes into one commit.
- **No code comments:** do NOT add comments when writing or modifying code. Put any needed explanation in the commit message or this file, not inline.
- **No em dashes:** never use the `—` character in any prose, docs, README, or commit messages (it reads as AI-written). Use a comma, colon, parentheses, or a plain hyphen `-` instead.
- **Communication mode:** ultra caveman per user request. Fragment style, drop articles/filler. Code/commits/docs full clarity. Revert on "stop caveman".

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
- **`jsx/host.jsx` is compiled to JSXBIN at build** (source edits need a rebuild before they take effect in AE).

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
├── tabs/*.html                # Tab fragments: interpolation, upscale, flowframes,
│                              #   deadframes, queue, sysmon, console, settings, stopwatch (tabLoader.js)
├── js/
│   ├── CSInterface.js         # Adobe boilerplate (NOT obfuscated)
│   ├── console.js             # dbg(level, source, msg) global logger
│   ├── main.js                # App singleton: init, tabs, GPU, settings, presets
│   ├── components/            # One panel controller per tab
│   │   ├── interpolationPanel.js
│   │   ├── upscalePanel.js
│   │   ├── flowframesPanel.js # Standalone Flowframes tab (no shared queue)
│   │   ├── deadframesPanel.js
│   │   ├── queuePanel.js
│   │   ├── consolePanel.js
│   │   ├── sysmonPanel.js
│   │   └── toolsSetup.js      # First-run wizard
│   └── utils/
│       ├── fileSystem.js      # Node fs/path/os/child_process wrappers + PS dialogs
│       ├── storage.js         # localStorage wrapper (keys: anismooth_*)
│       ├── modelHandler.js    # Singleton: spawns Python for all 3 modes
│       ├── flowframesHandler.js # Singleton: spawns Flowframes.exe, tails session log
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

- **All JS modules:** IIFE-wrapped globals on `window`, no ES modules, no bundler
- **Indentation:** 2-space, K&R braces
- **Naming:** camelCase vars/fns, PascalCase modules, snake_case localStorage keys
- **Async:** callbacks only, no Promises, no async/await
- **DOM:** vanilla `document.getElementById`, `addEventListener`, `classList`
- **Logging:** `dbg(level, source, message)`; levels: debug, info, warn, error, success
- **`var` only** (no let/const, CEP Chromium is old)
- **Python:** snake_case, `argparse` subcommands, lazy/cached model loading
- **ExtendScript:** ES3 with AE DOM, JSON by string concat

## Critical Paths

| File | Role |
|---|---|
| `queueManager.js` | **Two decoupled pipelines.** Render: `add()` sets status `rendering` and calls `_pumpRender()` (serialised by `_renderBusy`, `_doAERender()` runs the AE render) so the clip is captured at ENQUEUE time, correct even if added while another job runs or the AE selection later changes. Model: `_processNext()` (guarded by `_running`) picks a `queued` item → `_beginModel()` uses the stored `inputPath` (falls back to on-demand render if missing) → `_runModel()` → `ModelHandler.*Clip()`. Status flow: `rendering → queued → processing → done/error`. Pre-rendered temp inputs are dropped on restore (`init`) since the temp file may be gone |
| `modelHandler.js` | Singleton `activeProcess` + `_cancelling` flag prevents concurrent Python spawns. `executeModel()` spawns, `cancelActiveProcess()` kills via `taskkill /F /T` |
| `host.jsx` | `renderSelectedLayer()` renders one layer to a temp AVI. **Time-coord trap, three different spaces:** `layer.inPoint/outPoint` are DISPLAY-relative (offset by `displayStartTime`); `comp.workAreaStart` is ABSOLUTE 0-based (range `[0, duration]`); `RenderQueueItem.timeSpanStart` is DISPLAY-relative (range `[displayStartTime, displayStartTime+duration]`). Compute `absStart = toAbsRenderTime(inPoint)`, then `workAreaStart = absStart` but `timeSpanStart = absStart + displayStartTime`. Mixing them throws "value out of range" or the "timeSpanStart of 0 ... blank frames" warning (one-frame render). **Precomp:** if `layer.source instanceof CompItem`, queue that source comp at its full duration (no solo) instead of soloing the precomp in the parent; soloing renders the parent's slot, which is often offset/empty → black frames. `importFileToAE()`: capture `selectedLayers` BEFORE `layers.add()` (add reselects to the new layer, so `moveAfter` would target itself) |
| `main.py` | `argparse` → dispatch. Quality presets at top of file. Scene detection threshold: 0.40 |

## Flowframes Integration

The Flowframes tab runs through the **shared queue** (`mode: "flowframes"`), but with its **own engine**: it does NOT use `modelHandler.js` or the Python backend. `flowframesPanel.js` only collects params and calls `QueueManager.add()`. The queue pre-renders the AE layer at enqueue time (same as other modes), then `_runModel`'s flowframes branch calls `FlowframesHandler.run(input, jobOutDir, opts, cb)` instead of a `ModelHandler.*Clip`. Cancellation is routed by `_cancelActive()` (which checks `_currentMode`) to `FlowframesHandler.cancel()`. Since Flowframes names its own output, `onComplete(producedPath)` moves it to the AniSmooth output name.

`FlowframesHandler.run()` spawns the external **`Flowframes.exe`** (auto-detected at `%LOCALAPPDATA%/Flowframes/Flowframes.exe`, override via `settings.flowframesPath` / `anismooth_flowframes_path`). Hard-won quirks, change with care:

- **Use `Flowframes.exe`, not `FlowframesCmd.exe`.** The latter is an IPC shim that only forwards args to an already-running instance.
- **Single-instance.** A running instance silently swallows new launches (args forwarded/ignored). Always `taskkill /IM Flowframes.exe` before spawning.
- **`-a` autorun** runs and exits after; window still appears (not truly headless). Args: `-a -nc -mdc -f <factor> -ai <impl> -m "<model>" -vf Mp4 -ve <enc> -pf Yuv420P -o <dir> <input>`. Pass via `spawn(exe, [array])`; args with spaces (model names, paths) only survive as separate array elements.
- **Must strip `NoDefaultCurrentDirectoryInExePath` from the child env.** If set, Flowframes' bare-name `ffprobe` (run after `cd` into its pkg dir) fails → empty packet list → `Failed to initialize MediaFile: Sequence contains no elements` → import hangs. AE's own env is clean; only matters if a parent shell injected it.
- **No stdout.** Progress/errors are logged to `FlowframesData/logs/<session>/sessionlog.txt`; tail the newest session dir created after launch. Output filename is chosen by Flowframes → locate the newest media file in the `-o` dir.
- Model names come from `pkgs/<ai>/models.json` (`name` field, e.g. `RIFE 4.26`); model list depends on the `-ai` implementation.
- **Never use VapourSynth implementations (`-ai RifeNcnnVs`, and the CUDA ones).** They run `rife.py` → `core.ffms2.Source()`, which throws `No attribute with the name ffms2` on installs missing the VapourSynth ffms2 plugin (common). `RifeNcnn` (pure Vulkan NCNN, no Python) is equivalent for our use and always works. The AI dropdown no longer offers `RifeNcnnVs`; `run()` also downgrades any incoming `RifeNcnnVs` to `RifeNcnn`, and the log poller surfaces a specific hint on ffms2 errors.
- **Hang watchdog must key off new log lines, not file readability.** Flowframes can stop responding mid-job (process alive, session log frozen) after some time; the 60s progress watchdog exists for exactly this. The bug: `lastLogTime` was refreshed on every poll tick whenever the log file merely read successfully, so a frozen-but-readable log kept resetting the timer and the watchdog never fired (job hung until the user manually paused). Fix: only bump `lastLogTime` when `lines.length > lastLineCount` (real new output). A grace check exempts a quiet encode phase by resetting the timer while the newest output file is still growing (`watchdogSize`).
- **Run-token guards cross-run contamination.** `FlowframesHandler` is a singleton; a cancelled run's async teardown (`proc.on('close')` fires ~2.5s late) used to null the *next* run's `activeProcess` and kill its process, surfacing as "Flowframes is already running" / "exited without producing an output file" on pause→resume. Each `run()`/`cancel()` bumps `_runToken`; every async handler (poll, finalize, close, error) no-ops when its captured token is stale. `run()` no longer hard-rejects on a live `activeProcess` (the queue serialises jobs, so it is always stale) - it supersedes and force-kills instead.

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
- Three AE targets need different manifest version ranges, patched at build
- CSP restricts to `'self'` except Font Awesome CDN
- No macOS support, Windows-only (PowerShell, taskkill, Inno Setup)
