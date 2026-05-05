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

  if (mode === "heatmap") {
    drawHeatmap(ctx, hands, w, h);
    for (const hand of hands) {
      drawLabel(ctx, hand, colorForId(hand.id), w, h);
    }
    return;
  }

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

function drawHeatmap(ctx, hands, w, h) {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  octx.globalCompositeOperation = "lighter";

  const radius = Math.max(w, h) * 0.06;

  for (const hand of hands) {
    for (const lm of hand.landmarks) {
      // z is roughly [-0.2, 0.2]; clamp + map to 0..1 for hue.
      const t = Math.max(0, Math.min(1, 0.5 - (lm.z ?? 0) * 2));
      const hue = (1 - t) * 240; // far = blue (240), near = red (0)
      const grad = octx.createRadialGradient(
        lm.x * w, lm.y * h, 0,
        lm.x * w, lm.y * h, radius,
      );
      grad.addColorStop(0, `hsla(${hue}, 100%, 55%, 0.9)`);
      grad.addColorStop(1, `hsla(${hue}, 100%, 55%, 0)`);
      octx.fillStyle = grad;
      octx.fillRect(lm.x * w - radius, lm.y * h - radius, radius * 2, radius * 2);
    }
  }

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
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
