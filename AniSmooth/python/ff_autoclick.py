import ctypes
import ctypes.wintypes
import time
import json
import re
import sys
import os
import tempfile

u32 = ctypes.windll.user32
EP = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
WM_GETTEXT = 0x000D
WM_GETTEXTLENGTH = 0x000E
BM_CLICK = 0xF5

progress_file = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'anismooth_ff_progress.json')


def write_progress(progress, done=False, error=None):
    try:
        data = {'progress': progress, 'done': done}
        if error:
            data['error'] = error
        with open(progress_file, 'w') as f:
            json.dump(data, f)
    except Exception:
        pass


def gwt(h):
    b = ctypes.create_unicode_buffer(512)
    u32.GetWindowTextW(h, b, 512)
    return b.value


def get_ctrl_text(h):
    length = u32.SendMessageW(h, WM_GETTEXTLENGTH, 0, 0)
    if not length:
        return ''
    buf = ctypes.create_unicode_buffer(length + 1)
    u32.SendMessageW(h, WM_GETTEXT, length + 1, buf)
    return buf.value


_wins = []
_children = []
_texts = []


def _fw(h, _):
    if 'Flowframes' in gwt(h) and u32.IsWindowVisible(h):
        _wins.append(h)
    return True


def _fc(h, _):
    _children.append(h)
    return True


def _ft(h, _):
    try:
        t = get_ctrl_text(h)
        if t and len(t) > 5:
            _texts.append(t)
    except Exception:
        pass
    return True


fw = EP(_fw)
fc = EP(_fc)
ft = EP(_ft)


def find_ff():
    del _wins[:]
    u32.EnumWindows(fw, 0)
    return _wins[0] if _wins else None


def find_btn(ff_hwnd):
    del _children[:]
    u32.EnumChildWindows(ff_hwnd, fc, 0)
    for h in _children:
        if 'Interpolate' in gwt(h):
            return h
    return None


def get_ff_text(ff_hwnd):
    del _texts[:]
    u32.EnumChildWindows(ff_hwnd, ft, 0)
    return '\n'.join(_texts)


write_progress(0)

# Phase 1: click Interpolate button
deadline = time.time() + 120
ff = None
clicked = False
while time.time() < deadline:
    time.sleep(0.8)
    ff = find_ff()
    if not ff:
        continue
    btn = find_btn(ff)
    if btn and u32.IsWindowEnabled(btn):
        u32.SendMessageW(btn, BM_CLICK, 0, 0)
        clicked = True
        break

if not clicked:
    write_progress(0, error='Timeout: Interpolate button not found')
    sys.exit(1)

# Phase 2: monitor progress
deadline = time.time() + 7200
last_pct = 0
while time.time() < deadline:
    time.sleep(1.5)
    ff = find_ff()
    if not ff:
        write_progress(100, done=True)
        sys.exit(0)

    text = get_ff_text(ff)

    m = re.search(r'Interpolated\s+(\d+)\s*/\s*(\d+)', text, re.IGNORECASE)
    if m:
        done_f, total_f = int(m.group(1)), int(m.group(2))
        if total_f > 0:
            pct = round(done_f / total_f * 100)
            if pct != last_pct:
                last_pct = pct
                write_progress(pct)
            if done_f >= total_f:
                time.sleep(3)
                write_progress(100, done=True)
                sys.exit(0)

    if re.search(r'Done interpolating|Interpolation done|Encoding finished|\[Done\]|All done', text, re.IGNORECASE):
        write_progress(100, done=True)
        sys.exit(0)

write_progress(last_pct, error='Monitoring timeout')
sys.exit(1)
