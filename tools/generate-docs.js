const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'AniSmooth';
const BUNDLE_ID = 'com.anismooth.extension';
const EXTENSION_DISPLAY_NAME = 'AniSmooth Extension';

const GENERAL_INFO = `
## What is ${EXTENSION_NAME}?
${EXTENSION_NAME} is an After Effects extension that helps you remove duplicate frames, make videos smoother, and upscale clips directly inside After Effects using your local graphics card (GPU).

## Features
- **Remove Duplicate Frames** - Find and remove duplicate or frozen frames, even if the camera is moving.
- **RIFE Interpolation** - Make video playback smoother using the RIFE model at custom speeds (2x, 4x, etc.).
- **Video Upscaling** - Make clips larger and clearer using ShuffleCUGAN and spandrel models.
- **System Monitor** - See your CPU, RAM, and GPU usage in real time.
- **Setup Check** - A guide that checks if Python, FFmpeg, and other required tools are set up.
`;

const ROOT_README = `<h1 align="center">
  <img src="AniSmooth/AniSmooth-Logo.png" height="48" alt="AniSmooth"/>
  <br />
 </h1>
<p align="center">
  <b>Frame Interpolation & Video Upscaling directly in After Effects.</b><br>
  <i>Remove duplicates, make video smoother, and make clips larger using your graphics card.</i>
</p>

<hr>

## 🎬 About

**AniSmooth** is a free local After Effects extension built to help you remove duplicate frames, make videos smoother with RIFE, and upscale video clips locally on your computer with a Python backend.

Unlike other large and heavy extensions, AniSmooth is built with a **small, clean, and highly compact codebase**. The code is split into simple, organized files to ensure the extension loads instantly and runs smoothly alongside other tools without slowing down After Effects.

> [!NOTE]
> **Compatibility:** Supports **After Effects CC 2018 through CC 2026+** (v15.0+). Windows primary support.

---

## 🚀 Features

### Duplicate Frame Removal

![Duplicate Frame Removal](previews/AniSmooth_DeadframesRemover.png)

- **Threshold Slider** - Adjust how sensitive the check is for duplicate frames.
- **Motion Tracking** - Tells the difference between slow motion and frozen frames.
- **Frozen Character Detection** - Finds frames where the background moves but characters are completely frozen.

### Frame Interpolation

![Frame Interpolation](previews/AniSmooth_Interpolation.png)

- **RIFE Models** - Supports RIFE 4.25 models (running on CUDA or TensorRT).
- **Custom Multipliers** - Choose speed multipliers (2x, 4x, 6x, 8x, 10x) or write a custom number up to 64x.

### Video Upscaling

![Video Upscaling](previews/AniSmooth_Upscaling.png)

- **Upscaling Multipliers** - Make clips 2x or 4x larger.
- **Model Support** - ShuffleCUGAN models built for anime and detailed clips.

### System & Environment

![System Monitor](previews/AniSmooth_SystemMonitor.png)
![Console Log](previews/AniSmooth_Console.png)

- **Usage Monitor** - Shows RAM usage, GPU usage, and GPU temperature.
- **Setup Wizard** - Installer checker that helps you download and set up Python, FFmpeg, and model files.

### Settings & Customization

![Settings](previews/AniSmooth_Settings.png)
![Settings 2](previews/AniSmooth_Settings2.png)

- **GPU Diagnostics** - Shows VRAM usage and your graphics card model.
- **Output Preferences** - Set where files save, customize names, prevent overwriting files, and automatically import completed clips into your composition.
- **Interface Toggles** - Hide tabs you do not use and choose which models appear in the dropdown list.
- **Config Presets** - Save, import, and export your settings to share them or keep backups.

---

## 🧠 Supported Models

AniSmooth supports local hardware-accelerated models for both frame interpolation and video upscaling.

> [!NOTE]
> **Beta Stage:** We plan to add more models in the future. Right now, because the extension is in beta, we are keeping only these selected models - which are currently considered the best ones available - until we make sure the extension is 100% stable.

### 1. Frame Interpolation Models (RIFE 4.25)

| Model Key | Model Name | Parameters | VRAM Required | Engine / Acceleration | Description & Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| \`rife4.25\` | RIFE 4.25 Cuda | 1.3M | ~2GB | PyTorch CUDA | Fast, lightweight model for quick renders and older graphics cards. |
| \`rife4.25-heavy\` | RIFE 4.25 HEAVY Cuda | 5.1M | ~6GB | PyTorch CUDA | Larger model that gives the best motion results but needs a stronger graphics card. |
| \`rife4.25-tensorrt\` | RIFE 4.25 TensorRT | 1.3M | ~2GB | NVIDIA TensorRT | Optimized version that runs up to 1.8x faster on compatible NVIDIA cards. |
| \`rife4.25-heavy-tensorrt\` | RIFE 4.25 HEAVY TensorRT | 5.1M | ~6GB | NVIDIA TensorRT | The high-quality model optimized to run much faster on NVIDIA cards. |

### 2. Video Upscaling Models

| Model Key | Model Name | Parameters | VRAM Required | Engine / Acceleration | Description & Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| \`adore\` | Adore Cuda | 4M | ~3GB | PyTorch CUDA | Keeps lines sharp and retains details when upscaling. |
| \`fallin_soft\` | Fallin Soft Cuda | 3.9M | ~4GB | PyTorch CUDA | Built for anime, making colors smooth, backgrounds clean, and lines look sharp. |

---

## 📦 Installation

### Method 1: ZXP Installer (Easiest)
1. Pick your After Effects version folder (AE2018 / AE2020 / AE2022).
2. Download [ZXP Installer](https://aescripts.com/learn/post/zxp-installer) (Windows & macOS).
3. Drag \`AniSmooth_AE2020.zxp\` (or corresponding version) onto the ZXP Installer window.
4. Restart After Effects, go to \`Window > Extensions > AniSmooth\`.

### Method 2: Windows Setup Wizard (.exe)
1. Open your version folder and run \`AniSmoothSetup_AE2020.exe\`.
2. Follow the setup wizard - it handles file placement and registry keys automatically.

### Method 3: Manual Folder Installation
1. Copy the \`AniSmooth\` folder from your desired version folder to:
  - Windows: \`C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions\\\`
2. Enable PlayerDebugMode: double-click \`Add-Keys.reg\` or run \`Add-Keys.bat\` as admin.
3. Restart After Effects.

---

## 🛠️ Building from Source
\`\`\`bash
cd tools && npm install
cd .. && npm run build:all
\`\`\`

---

## ⚠️ Usage Notice

This extension runs local Python and AI models on your system. Make sure you meet the VRAM requirements (2GB+ for basic, 6GB+ for heavy models) and have an NVIDIA GPU for CUDA acceleration.
`;

const INSTALL_GUIDE_TXT = `================================================================================
${EXTENSION_NAME.toUpperCase()} AFTER EFFECTS EXTENSION - COMPLETE INSTALLATION GUIDE
================================================================================

${GENERAL_INFO}

Each version folder (AE2018 / AE2020 / AE2022) contains:
 - AniSmooth/           Unpacked extension files
 - AniSmooth_AEXXXX.zxp Signed ZXP package
 - AniSmoothSetup_AEXXXX.exe Windows setup wizard
 - Install-Windows.bat  One-click batch installer (copies files + enables debug mode)

Root-level helper files (version-agnostic):
 - Add-Keys.reg         Double-click to enable PlayerDebugMode (CSXS.9-13)
 - Add-Keys.bat         Run as admin to enable PlayerDebugMode (CSXS.9-13)

--------------------------------------------------------------------------------
METHOD 1: ZXP INSTALLATION (Easiest & Most Recommended)
--------------------------------------------------------------------------------
1. Open your After Effects version folder (AE2018 / AE2020 / AE2022).
2. Download the free ZXP Installer utility:
   --> https://aescripts.com/learn/post/zxp-installer (Windows & macOS)
3. Launch ZXP Installer.
4. Drag "AniSmooth_AEXXXX.zxp" into the ZXP Installer window.
5. Restart After Effects.
6. Open the extension from: Window > Extensions > ${EXTENSION_NAME}.

--------------------------------------------------------------------------------
METHOD 2: WINDOWS SETUP WIZARD (.exe Installer)
--------------------------------------------------------------------------------
1. Open your version folder and run "AniSmoothSetup_AEXXXX.exe".
2. Follow the setup wizard instructions.
3. The installer handles file placement and registry configuration.
4. Open After Effects, go to: Window > Extensions > ${EXTENSION_NAME}.

--------------------------------------------------------------------------------
METHOD 3: MANUAL FOLDER INSTALLATION
--------------------------------------------------------------------------------
1. Copy the "AniSmooth" folder from your desired version folder to the Adobe CEP extensions dir:
  - Windows: C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions\\${EXTENSION_NAME}\\

2. Enable PlayerDebugMode (so Adobe loads unsigned extensions):
   Choose one of the following:
  - Double-click "Add-Keys.reg" (recommended, one-click)
  - Run "Add-Keys.bat" as administrator
  - Run "Install-Windows.bat" from your version folder (copies files + keys in one step)
  - Or add the keys manually (Command Prompt as Admin):
      reg add "HKCU\\Software\\Adobe\\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f
      reg add "HKCU\\Software\\Adobe\\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f
      reg add "HKCU\\Software\\Adobe\\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
      reg add "HKCU\\Software\\Adobe\\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f
      reg add "HKCU\\Software\\Adobe\\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f

3. Restart After Effects and launch via: Window > Extensions > ${EXTENSION_NAME}.
================================================================================
`;

const AESCRIPTS_SUBMISSION_INFO = `# aescripts + aeplugins Submission Metadata

Use this info when submitting the extension to aescripts.com:

================================================================================
PRODUCT INFORMATION
================================================================================
- **Product Name:** ${EXTENSION_DISPLAY_NAME}
- **Extension Bundle ID:** ${BUNDLE_ID}
- **Extension Type:** After Effects CEP Panel
- **Required Run Time:** CSXS 6.0 or newer
- **Host Compatibility:** Adobe After Effects CC 2017 (14.0) to CC 2026+ (99.9)

================================================================================
INSTALLATION TEXT FOR CUSTOMERS
================================================================================
To install the ${EXTENSION_NAME} extension:
1. Download and run the aescripts + aeplugins manager app OR the ZXP Installer.
2. Pick your AE version, drag the ZXP package onto the installer.
3. Restart After Effects and launch the extension from Window > Extensions > ${EXTENSION_NAME}.

Refer to the guide: https://aescripts.com/learn/post/zxp-installer
`;

const REG_KEYS = `Windows Registry Editor Version 5.00

; Enable PlayerDebugMode for After Effects CEP extensions (CSXS.9 - CSXS.13)
; Double-click this file and confirm to add the keys, then restart After Effects.

[HKEY_CURRENT_USER\\Software\\Adobe\\CSXS.9]
"PlayerDebugMode"="1"

[HKEY_CURRENT_USER\\Software\\Adobe\\CSXS.10]
"PlayerDebugMode"="1"

[HKEY_CURRENT_USER\\Software\\Adobe\\CSXS.11]
"PlayerDebugMode"="1"

[HKEY_CURRENT_USER\\Software\\Adobe\\CSXS.12]
"PlayerDebugMode"="1"

[HKEY_CURRENT_USER\\Software\\Adobe\\CSXS.13]
"PlayerDebugMode"="1"
`;

const REG_BAT = `@echo off
:: Enable PlayerDebugMode for After Effects CEP extensions (CSXS.9 - CSXS.13)
:: Right-click and "Run as administrator", then restart After Effects.

reg add "HKCU\\Software\\Adobe\\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add "HKCU\\Software\\Adobe\\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add "HKCU\\Software\\Adobe\\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add "HKCU\\Software\\Adobe\\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add "HKCU\\Software\\Adobe\\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f

echo.
echo PlayerDebugMode keys added successfully.
echo Restart After Effects for changes to take effect.
echo.
pause
`;

function generateDocs() {
    const rootDir = path.join(__dirname, '..');
    const distDir = path.join(rootDir, 'dist');

    console.log('📝 Generating documentation files...');

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    fs.writeFileSync(path.join(rootDir, 'README.md'), ROOT_README.trim() + '\n', 'utf8');
    console.log(' - Generated: README.md (Root)');

    fs.writeFileSync(path.join(distDir, 'INSTALL_GUIDE.txt'), INSTALL_GUIDE_TXT.trim() + '\n', 'utf8');
    console.log(' - Generated: dist/INSTALL_GUIDE.txt');

    fs.writeFileSync(path.join(distDir, 'aescripts_submission_info.txt'), AESCRIPTS_SUBMISSION_INFO.trim() + '\n', 'utf8');
    console.log(' - Generated: dist/aescripts_submission_info.txt');

    fs.writeFileSync(path.join(distDir, 'Add-Keys.reg'), REG_KEYS.trim() + '\r\n', 'utf8');
    console.log(' - Generated: dist/Add-Keys.reg');

    fs.writeFileSync(path.join(distDir, 'Add-Keys.bat'), REG_BAT.trim() + '\r\n', 'utf8');
    console.log(' - Generated: dist/Add-Keys.bat');

    console.log('✨ Documentation generation complete!');
}

module.exports = { generateDocs };

if (require.main === module) {
    generateDocs();
}
