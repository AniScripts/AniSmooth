"""Duplicate ("deadframe") detection for anime / AMV footage.

Rewritten for speed and accuracy. Anime is animated on 2s/3s, so the same drawn
cel is held for several consecutive frames; "deadframes" are those exact (or
near-exact, after compression) repeats. The job is therefore to compare each new
frame against the *last kept* frame and drop it when almost nothing changed.

Design notes (why this replaces the previous multi-signal implementation):

* The old detector blended six hand-weighted signals (regions, Farneback optical
  flow, edges, pHash, block-motion, center-similarity) plus camera-motion and
  "static-subject" compensation. That was slow (dense optical flow + nested
  Python block-matching every frame pair) and over-aggressive - it would mark
  genuinely different frames as ``camera_only`` duplicates.
* It also had a correctness bug: ``self.prev_phash`` / ``self.prev_edges`` were
  cached on *every* call, including dropped duplicates, while the actual anchor
  (``prev_frame`` in the processor) only advanced on kept frames. The hash/edge
  comparisons therefore referenced a different frame than the pixel comparisons.

This version derives every signal from the exact frames passed in (no
desynchronised cache), runs entirely on a small fixed-size thumbnail, and is
fully vectorised - no per-frame Python loops, no optical flow.

Two cheap, complementary signals decide a duplicate:

1. ``frac_changed`` - fraction of thumbnail pixels whose absolute difference
   exceeds ``pixel_threshold``. A per-pixel threshold ignores codec noise while
   still catching small *localised* motion (a blink, a mouth moving).
2. ``phash_distance`` - normalised Hamming distance of a DCT perceptual hash,
   a robust *global/structural* backstop that survives compression artifacts.

A frame is a duplicate when *both* stay at or below the user difference
threshold (``1 - base_threshold``). Taking the max of the two means either
signal alone is enough to mark a frame as unique, which is the safe bias for
deadframe removal (never silently drop real animation).
"""

import cv2
import numpy as np
from collections import deque
from typing import Dict, List

class CadenceDetector:
    """Detects a repeating duplicate/unique pattern (e.g. on-2s, on-3s)."""

    def __init__(self, window_size: int = 24):
        self.window_size = window_size
        self.duplicate_pattern = deque(maxlen=window_size)

    def add_frame_result(self, is_duplicate: bool):
        self.duplicate_pattern.append(1 if is_duplicate else 0)

    def detect_cadence(self) -> Dict:
        if len(self.duplicate_pattern) < self.window_size // 2:
            return {'detected': False, 'pattern': None}
        pattern = list(self.duplicate_pattern)
        for period in [2, 3, 4, 5, 6]:
            if self._check_pattern_period(pattern, period):
                return {'detected': True, 'period': period, 'pattern': pattern[:period]}
        return {'detected': False, 'pattern': None}

    def _check_pattern_period(self, pattern: List[int], period: int) -> bool:
        if len(pattern) < period * 3:
            return False
        matches = sum(1 for i in range(len(pattern) - period) if pattern[i] == pattern[i + period])
        total = len(pattern) - period
        return (matches / total) > 0.8 if total > 0 else False

class AdvancedDuplicateRemover:
    """Fast consecutive near-duplicate detector.

    The constructor keeps the previous keyword arguments so it remains a
    drop-in replacement for the processor; signals that are no longer used
    (optical flow / camera compensation / region grid) are accepted and
    ignored. ``base_threshold`` is treated as a *similarity* threshold in
    [0, 1]: a frame is a duplicate when its difference from the anchor is at or
    below ``1 - base_threshold``.
    """

    def __init__(
        self,
        base_threshold: float = 0.95,
        pixel_threshold: int = 12,
        thumb_size: int = 128,
        hash_size: int = 8,
        min_changed_regions: int = 1,
        use_gpu: bool = False,
        **_ignored,
    ):
        
        self.diff_threshold = float(min(1.0, max(0.0, 1.0 - base_threshold)))
        
        
        self.pixel_threshold = int(pixel_threshold)
        self.thumb_size = int(thumb_size)
        self.hash_size = int(hash_size)
        
        
        
        self.min_frac = max(0.0, (int(min_changed_regions) - 1) * 0.01)

        
        
        self._anchor = None
        self._anchor_small = None
        self._anchor_hash = None

        self.frame_cadence_detector = CadenceDetector(window_size=24)

    

    def _to_gray_small(self, frame: np.ndarray) -> np.ndarray:
        if frame.ndim == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame
        small = cv2.resize(gray, (self.thumb_size, self.thumb_size),
                           interpolation=cv2.INTER_AREA)
        return small.astype(np.float32)

    def _phash(self, small: np.ndarray) -> np.ndarray:
        
        
        side = self.hash_size * 4
        img = cv2.resize(small, (side, side), interpolation=cv2.INTER_AREA)
        dct = cv2.dct(img)
        low = dct[:self.hash_size, :self.hash_size]
        return (low > np.median(low)).flatten()

    def _features(self, frame: np.ndarray):
        small = self._to_gray_small(frame)
        return small, self._phash(small)

    

    def analyze_frame_difference(self, frame1: np.ndarray, frame2: np.ndarray) -> Dict:
        """Compare ``frame2`` (candidate) against ``frame1`` (last kept frame).

        ``frame1`` is the anchor the processor advances only on kept frames, so
        caching its features by object identity stays correct.
        """
        if frame1 is None or frame2 is None:
            return {'is_duplicate': False, 'confidence': 0.0, 'motion_type': 'none'}

        
        if self._anchor is not frame1 or self._anchor_small is None:
            self._anchor = frame1
            self._anchor_small, self._anchor_hash = self._features(frame1)

        cur_small, cur_hash = self._features(frame2)

        absd = np.abs(self._anchor_small - cur_small)
        frac_changed = float(np.count_nonzero(absd > self.pixel_threshold)) / absd.size
        phash_distance = float(np.count_nonzero(self._anchor_hash != cur_hash)) / self._anchor_hash.size

        
        diff = max(frac_changed, phash_distance)
        effective_threshold = max(self.diff_threshold, self.min_frac)
        is_duplicate = diff <= effective_threshold

        return {
            'is_duplicate': is_duplicate,
            'confidence': float(min(1.0, abs(diff - effective_threshold) + 0.5)),
            'motion_type': 'none' if is_duplicate else 'local',
            'diff': diff,
            'frac_changed': frac_changed,
            'phash_distance': phash_distance,
        }
