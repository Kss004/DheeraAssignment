"""Download MediaPipe Tasks model files into ./models.

Idempotent — skips files that already exist.
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

MODELS = {
    "hand_landmarker.task": (
        "https://storage.googleapis.com/mediapipe-models/"
        "hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
    ),
    "gesture_recognizer.task": (
        "https://storage.googleapis.com/mediapipe-models/"
        "gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task"
    ),
}


def main() -> int:
    target = Path(__file__).parent / "models"
    target.mkdir(exist_ok=True)
    for name, url in MODELS.items():
        path = target / name
        if path.exists() and path.stat().st_size > 0:
            print(f"[skip] {name} already present ({path.stat().st_size} bytes)")
            continue
        print(f"[get ] {name} <- {url}")
        urllib.request.urlretrieve(url, path)
        print(f"[ok  ] {name} ({path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
