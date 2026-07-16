import cv2
import numpy as np
import subprocess
import shutil
import sys
from pathlib import Path

from duplicate_frame_remover.core import (
    DeadFrameDetector,
    _get_video_info,
    _get_audio_info,
    _decisions_to_segments,
    _smooth_decisions,
    _build_ffmpeg_cmd,
    _build_audio_filter,
)

_CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


def run_deadframes(
    input_path,
    output_path,
    ffmpeg_path="ffmpeg",
    ffprobe_path="ffprobe",
    flow_threshold=0.5,
    motion_area_fraction=0.15,
    homography_inlier_ratio=0.5,
    orb_features=500,
    min_matches=8,
    ransac_threshold=5.0,
    detect_scale=1.0,
    keep_talking=False,
    keep_camera=False,
    parallax_mode=False,
    auto=False,
    auto_sample_limit=0,
    cadence=3,
    small_movements=None,
    no_audio=False,
    progress_cb=None,
):
    if detect_scale >= 1.0:
        info = _get_video_info(input_path, ffprobe_path)
        detect_scale = min(1.0, 360.0 / max(1, info["height"]))

    detector = DeadFrameDetector(
        flow_threshold=flow_threshold,
        motion_area_fraction=motion_area_fraction,
        homography_inlier_ratio=homography_inlier_ratio,
        orb_features=orb_features,
        min_matches=min_matches,
        ransac_threshold=ransac_threshold,
        detect_scale=detect_scale,
        keep_talking=keep_talking,
        keep_camera=keep_camera,
        parallax_mode=parallax_mode,
    )

    if small_movements is not None:
        detector.flow_threshold = small_movements

    decisions = detector.process_video(
        input_path,
        auto=auto,
        auto_sample_limit=auto_sample_limit,
        progress_cb=progress_cb,
    )

    if progress_cb:
        progress_cb(70, "Smoothing cadence")

    decisions = _smooth_decisions(decisions, cadence)

    info = _get_video_info(input_path, ffprobe_path)
    fps = info["fps"]
    pix_fmt = info["pix_fmt"]

    segments = _decisions_to_segments(decisions, fps)
    total = len(decisions)
    kept = sum(1 for d in decisions if d)
    dropped = total - kept

    if dropped == 0 or kept == 0:
        if progress_cb:
            progress_cb(90, "Copying input")
        shutil.copy2(input_path, output_path)
        return {
            "total_frames": total,
            "kept_frames": kept,
            "dropped_frames": dropped,
            "segments": segments,
            "duration_after": sum(e - s for s, e in segments) if segments else 0,
            "flow_threshold": detector.flow_threshold,
            "motion_area_fraction": detector.motion_area_fraction,
        }

    has_audio = False
    audio_filter = ""
    if not no_audio:
        audio_info = _get_audio_info(input_path, ffprobe_path)
        if audio_info is not None:
            has_audio = True

    if has_audio:
        audio_filter = _build_audio_filter(segments)

    if progress_cb:
        progress_cb(75, "Building FFmpeg command")

    cmd = _build_ffmpeg_cmd(
        input_path=input_path,
        output_path=output_path,
        segments=segments,
        fps=fps,
        pix_fmt=pix_fmt,
        ffmpeg_path=ffmpeg_path,
        ffprobe_path=ffprobe_path,
        no_audio=no_audio,
        audio_filter=audio_filter,
    )

    if progress_cb:
        progress_cb(80, "Encoding")

    try:
        subprocess.run(cmd, check=True, creationflags=_CREATE_NO_WINDOW)
    except subprocess.CalledProcessError as e:
        raise RuntimeError("FFmpeg failed: " + str(e))

    if progress_cb:
        progress_cb(100, "Done")

    return {
        "total_frames": total,
        "kept_frames": kept,
        "dropped_frames": dropped,
        "segments": segments,
        "duration_after": sum(e - s for s, e in segments),
        "flow_threshold": detector.flow_threshold,
        "motion_area_fraction": detector.motion_area_fraction,
    }
