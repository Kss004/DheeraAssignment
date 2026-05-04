"""MediaPipe-based hand detection + gesture recognition.

Wraps the Tasks API (HandLandmarker + GestureRecognizer) into a single
detector that returns normalized landmarks, bounding boxes, handedness,
and (optional) gesture labels.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

MODELS_DIR = Path(__file__).parent / "models"


@dataclass
class HandResult:
    landmarks: list[dict[str, float]]   # 21 entries of {x,y,z}, normalized 0..1
    bbox: dict[str, float]              # {x,y,w,h} normalized 0..1
    handedness: str                     # "Left" | "Right"
    handedness_score: float
    gesture: str | None
    gesture_score: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class HandDetector:
    """Single-frame (IMAGE mode) hand + gesture detector."""

    def __init__(self, num_hands: int = 2, min_confidence: float = 0.5) -> None:
        gesture_path = MODELS_DIR / "gesture_recognizer.task"
        if not gesture_path.exists():
            raise FileNotFoundError(
                f"Missing {gesture_path}. Run `uv run python download_models.py` first."
            )

        # GestureRecognizer also returns hand landmarks + handedness, so a single
        # task is enough — no need to also load HandLandmarker.
        opts = mp_vision.GestureRecognizerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(gesture_path)),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_hands=num_hands,
            min_hand_detection_confidence=min_confidence,
            min_hand_presence_confidence=min_confidence,
            min_tracking_confidence=min_confidence,
        )
        self._recognizer = mp_vision.GestureRecognizer.create_from_options(opts)

    def detect(self, bgr_frame: np.ndarray) -> list[HandResult]:
        rgb = bgr_frame[:, :, ::-1].copy()  # BGR -> RGB, contiguous
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._recognizer.recognize(mp_image)

        hands: list[HandResult] = []
        if not result.hand_landmarks:
            return hands

        for i, lm_list in enumerate(result.hand_landmarks):
            landmarks = [{"x": float(p.x), "y": float(p.y), "z": float(p.z)} for p in lm_list]
            xs = [p["x"] for p in landmarks]
            ys = [p["y"] for p in landmarks]
            pad = 0.02
            x0 = max(0.0, min(xs) - pad)
            y0 = max(0.0, min(ys) - pad)
            x1 = min(1.0, max(xs) + pad)
            y1 = min(1.0, max(ys) + pad)
            bbox = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}

            handedness = "Unknown"
            handedness_score = 0.0
            if i < len(result.handedness) and result.handedness[i]:
                top = result.handedness[i][0]
                handedness = top.category_name
                handedness_score = float(top.score)

            gesture = None
            gesture_score = 0.0
            if i < len(result.gestures) and result.gestures[i]:
                top = result.gestures[i][0]
                if top.category_name and top.category_name != "None":
                    gesture = top.category_name
                    gesture_score = float(top.score)

            hands.append(
                HandResult(
                    landmarks=landmarks,
                    bbox=bbox,
                    handedness=handedness,
                    handedness_score=handedness_score,
                    gesture=gesture,
                    gesture_score=gesture_score,
                )
            )
        return hands

    def close(self) -> None:
        self._recognizer.close()
