// Canvas drawing for hand landmarks, bounding boxes, and gesture labels.

// MediaPipe hand connections (pairs of landmark indices).
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                 // palm
];

function colorForId(id) {
  // Deterministic hue per ID for stable per-hand color.
  const hue = (id * 47) % 360;
  return `hsl(${hue}, 80%, 60%)`;
}

export function drawHands(ctx, hands, mode) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  for (const hand of hands) {
    const color = colorForId(hand.id);

    if (mode === "landmarks" || mode === "both") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = hand.landmarks[a];
        const pb = hand.landmarks[b];
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
      }
      ctx.stroke();

      ctx.fillStyle = "#fff";
      for (const lm of hand.landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (mode === "bbox" || mode === "both") {
      const bx = hand.bbox.x * w;
      const by = hand.bbox.y * h;
      const bw = hand.bbox.w * w;
      const bh = hand.bbox.h * h;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);
    }

    // Label always shown — useful for ID tracking and gestures.
    drawLabel(ctx, hand, color, w, h);
  }
}

function drawLabel(ctx, hand, color, w, h) {
  const x = hand.bbox.x * w;
  const y = hand.bbox.y * h;
  const parts = [`#${hand.id}`, hand.handedness];
  if (hand.gesture) {
    parts.push(`${hand.gesture} (${(hand.gesture_score * 100).toFixed(0)}%)`);
  }
  const text = parts.join(" · ");

  ctx.font = "600 13px -apple-system, system-ui, sans-serif";
  const metrics = ctx.measureText(text);
  const padX = 8;
  const padY = 4;
  const tw = metrics.width + padX * 2;
  const th = 20;
  const labelY = Math.max(0, y - th - 2);

  ctx.fillStyle = color;
  ctx.fillRect(x, labelY, tw, th);

  ctx.fillStyle = "#0b0d12";
  ctx.fillText(text, x + padX, labelY + th - padY - 1);
}
