import ctypes
import ctypes.wintypes
import time

u32 = ctypes.windll.user32
EP = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)

def gwt(h):
    b = ctypes.create_unicode_buffer(512)
    u32.GetWindowTextW(h, b, 512)
    return b.value

wins, btns = [], []

def _fw(h, _):
    if 'Flowframes' in gwt(h) and u32.IsWindowVisible(h):
        wins.append(h)
    return True

def _fb(h, _):
    if 'Interpolate' in gwt(h):
        btns.append(h)
    return True

fw = EP(_fw)
fb = EP(_fb)

deadline = time.time() + 120
while time.time() < deadline:
    time.sleep(0.8)
    del wins[:]
    u32.EnumWindows(fw, 0)
    if not wins:
        continue
    del btns[:]
    u32.EnumChildWindows(wins[0], fb, 0)
    if btns and u32.IsWindowEnabled(btns[0]):
        u32.SendMessageW(btns[0], 0xF5, 0, 0)
        break
