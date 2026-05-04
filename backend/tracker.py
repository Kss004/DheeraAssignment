"""Tiny centroid-based tracker that assigns stable IDs to hands across frames.

MediaPipe's per-frame ordering is not stable, so we match new detections to
existing tracks by the palm landmark (index 0) using greedy nearest-neighbor
in normalized image coordinates.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class _Track:
    id: int
    centroid: tuple[float, float]
    missing: int = 0


class CentroidTracker:
    def __init__(self, max_missing: int = 10, max_distance: float = 0.18) -> None:
        self._tracks: dict[int, _Track] = {}
        self._next_id = 1
        self._max_missing = max_missing
        self._max_distance = max_distance

    @staticmethod
    def _palm_centroid(hand: dict[str, Any]) -> tuple[float, float]:
        # Landmark 0 = wrist; 9 = middle-finger MCP. Average for a stable palm point.
        lm = hand["landmarks"]
        cx = (lm[0]["x"] + lm[9]["x"]) / 2.0
        cy = (lm[0]["y"] + lm[9]["y"]) / 2.0
        return (cx, cy)

    @staticmethod
    def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
        return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5

    def update(self, hands: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Annotate each hand with a stable ``id`` and return the new list.

        Hands not matched age existing tracks. Tracks missing more than
        ``max_missing`` frames are dropped.
        """
        if not hands:
            for t in self._tracks.values():
                t.missing += 1
            self._reap()
            return []

        det_centroids = [self._palm_centroid(h) for h in hands]
        unmatched_det = set(range(len(hands)))
        unmatched_trk = set(self._tracks.keys())

        # Greedy: build all (track, detection) distances, sort, take smallest first.
        pairs: list[tuple[float, int, int]] = []
        for tid, trk in self._tracks.items():
            for di, dc in enumerate(det_centroids):
                d = self._dist(trk.centroid, dc)
                if d <= self._max_distance:
                    pairs.append((d, tid, di))
        pairs.sort()

        assignment: dict[int, int] = {}  # det_index -> track_id
        for _, tid, di in pairs:
            if tid in unmatched_trk and di in unmatched_det:
                assignment[di] = tid
                unmatched_trk.discard(tid)
                unmatched_det.discard(di)

        # New tracks for unmatched detections.
        for di in unmatched_det:
            tid = self._next_id
            self._next_id += 1
            self._tracks[tid] = _Track(id=tid, centroid=det_centroids[di])
            assignment[di] = tid

        # Update matched tracks.
        for di, tid in assignment.items():
            self._tracks[tid].centroid = det_centroids[di]
            self._tracks[tid].missing = 0

        # Age unmatched tracks.
        for tid in unmatched_trk:
            self._tracks[tid].missing += 1
        self._reap()

        out: list[dict[str, Any]] = []
        for di, hand in enumerate(hands):
            out.append({**hand, "id": assignment[di]})
        return out

    def _reap(self) -> None:
        dead = [tid for tid, t in self._tracks.items() if t.missing > self._max_missing]
        for tid in dead:
            del self._tracks[tid]
