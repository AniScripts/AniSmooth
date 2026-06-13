import cv2
import sys
import json
import subprocess
import os
import shutil
from pathlib import Path

def log(msg_type, msg, **kw):
    out = {"type": msg_type, "msg": str(msg)}
    out.update(kw)
    print(json.dumps(out), flush=True)

def _find_ffmpeg():
    script_dir = Path(__file__).parent.parent
    local = script_dir / "ffmpeg.exe"
    if local.exists():
        return str(local)
    which = shutil.which("ffmpeg")
    if which:
        return which
    return None

def mux_audio(video_path, audio_source_path):
    """
    Copy the audio stream from audio_source_path into video_path.
    If no audio exists in the source, does nothing. Overwrites video_path in-place.
    """
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        log("warn", "FFmpeg not found, cannot mux audio")
        return False

    probe_cmd = [
        ffmpeg, "-i", str(audio_source_path),
        "-f", "null", "-"
    ]
    has_audio = False
    try:
        r = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        if "Audio:" in r.stderr:
            has_audio = True
    except Exception:
        pass

    if not has_audio:
        log("info", "No audio stream in source, skipping audio mux")
        return False

    tmp = str(video_path) + ".tmp.mp4"
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(video_path),
        "-i", str(audio_source_path),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-movflags", "+faststart",
        tmp
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            log("warn", f"Audio mux failed: {result.stderr.strip()}")
            if os.path.exists(tmp):
                os.unlink(tmp)
            return False
        os.replace(tmp, str(video_path))
        log("info", "Audio stream copied from source")
        return True
    except Exception as e:
        log("warn", f"Audio mux error: {e}")
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass
        return False

class VideoProcessor:
    def __init__(self, input_path, output_path):
        self.input_path = input_path
        self.output_path = output_path
        self.cap = cv2.VideoCapture(input_path)
        if not self.cap.isOpened():
            log("error", f"Failed to open input video: {input_path}")
            sys.exit(1)
            
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        
        
        total = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.total_frames = total if total > 0 else 1
        self.writer = None

    def get_info(self):
        return self.width, self.height, self.fps, self.total_frames

    def setup_writer(self, output_fps, scale=1):
        out_w = self.width * scale
        out_h = self.height * scale
        
        
        ext = self.output_path.split('.')[-1].lower()
        if ext == 'avi':
            fourcc = cv2.VideoWriter_fourcc(*'XVID')
        elif ext in ['mov', 'm4v']:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        else:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')

        self.writer = cv2.VideoWriter(self.output_path, fourcc, output_fps, (out_w, out_h))
        return self.writer

    def read_frames(self):
        while True:
            ret, frame = self.cap.read()
            if not ret:
                break
            yield frame

    def close(self):
        self.cap.release()
        if self.writer:
            self.writer.release()
