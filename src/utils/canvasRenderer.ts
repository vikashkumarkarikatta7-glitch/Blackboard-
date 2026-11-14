import {
  BOARD_BACKGROUNDS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BoardElement,
  BoardImageObject,
  BoardPage,
  MathNodeObject,
  ShapeObject,
  StrokeObject,
} from '../types/board';
import { compileMathExpression } from './mathParser';

// In-memory decoded HTMLImageElement cache for zero-flicker 60fps canvas rendering
const imageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  const existing = imageCache.get(src);
  if (existing) {
    if (existing.complete && existing.naturalWidth > 0) return existing;
    return null;
  }
  const img = new Image();
  img.onload = () => {
    imageCache.set(src, img);
    onLoad?.();
  };
  img.src = src;
  imageCache.set(src, img);
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export async function preloadPageImages(page: BoardPage): Promise<void> {
  const images = page.elements.filter((el): el is BoardImageObject => el.kind === 'image');
  await Promise.all(
    images.map(
      (item) =>
        new Promise<void>((resolve) => {
          const existing = imageCache.get(item.src);
          if (existing && existing.complete && existing.naturalWidth > 0) {
            resolve();
            return;
          }
          const img = new Image();
          img.onload = () => {
            imageCache.set(item.src, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = item.src;
        })
    )
  );
}

export function drawBoardBackground(ctx: CanvasRenderingContext2D, page: BoardPage) {
  const palette = BOARD_BACKGROUNDS[page.background];
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  const gridColor = palette.grid;
  ctx.save();
  if (page.paper === 'grid') {
    const step = 45;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let x = step; x < BOARD_WIDTH; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BOARD_HEIGHT);
    }
    for (let y = step; y < BOARD_HEIGHT; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
    }
    ctx.stroke();
  } else if (page.paper === 'dotted') {
    const step = 42;
    ctx.fillStyle = gridColor;
    for (let x = step; x < BOARD_WIDTH; x += step) {
      for (let y = step; y < BOARD_HEIGHT; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (page.paper === 'ruled') {
    const step = 64;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let y = 140; y < BOARD_HEIGHT - 60; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
    }
    ctx.stroke();
    ctx.strokeStyle =
      page.background === 'white' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(248, 113, 113, 0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(116, 0);
    ctx.lineTo(116, BOARD_HEIGHT);
    ctx.stroke();
  } else if (page.paper === 'axes') {
    const step = 45;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= BOARD_WIDTH; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BOARD_HEIGHT);
    }
    for (let y = 0; y <= BOARD_HEIGHT; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
    }
    ctx.stroke();

    const cx = BOARD_WIDTH / 2;
    const cy = BOARD_HEIGHT / 2;
    ctx.strokeStyle =
      page.background === 'white' ? 'rgba(15, 23, 42, 0.48)' : 'rgba(248, 250, 252, 0.48)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(40, cy);
    ctx.lineTo(BOARD_WIDTH - 40, cy);
    ctx.moveTo(cx, 60);
    ctx.lineTo(cx, BOARD_HEIGHT - 60);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeObject,
  highlightedForErase = false
) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (highlightedForErase) {
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#EF4444';
  } else if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = stroke.color;
  } else if (stroke.tool === 'pencil') {
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = stroke.color;
  } else {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke.color;
  }

  if (pts.length === 1) {
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, Math.max(1.2, stroke.size / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (stroke.tool === 'highlighter' || stroke.tool === 'freehand-shape') {
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    if (stroke.closed) ctx.closePath();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stroke.tool === 'pencil') {
    // Textured chalk/graphite dual-pass stroke
    ctx.lineWidth = stroke.size * 0.92;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();

    ctx.globalAlpha = highlightedForErase ? 0.2 : 0.35;
    ctx.setLineDash([1.5, 2.5]);
    ctx.lineWidth = Math.max(1, stroke.size * 0.55);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Smooth pressure-aware pen stroke
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const pMidX = (p0.x + p1.x) / 2;
    const pMidY = (p0.y + p1.y) / 2;
    const prevMidX = i === 0 ? p0.x : (pts[i - 1].x + p0.x) / 2;
    const prevMidY = i === 0 ? p0.y : (pts[i - 1].y + p0.y) / 2;
    const pressureFactor = p0.pressure > 0 ? 0.65 + p0.pressure * 0.7 : 1;
    ctx.lineWidth = Math.max(1.2, stroke.size * pressureFactor);
    ctx.beginPath();
    ctx.moveTo(prevMidX, prevMidY);
    ctx.quadraticCurveTo(p0.x, p0.y, pMidX, pMidY);
    ctx.stroke();
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  ctx.beginPath();
  ctx.moveTo((prev.x + last.x) / 2, (prev.y + last.y) / 2);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();

  ctx.restore();
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeObject,
  highlightedForErase = false
) {
  ctx.save();
  ctx.strokeStyle = highlightedForErase ? '#EF4444' : shape.color;
  ctx.globalAlpha = highlightedForErase ? 0.35 : 1;
  ctx.lineWidth = shape.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { x1, y1, x2, y2, shapeType } = shape;
  const dx = x2 - x1;
  const dy = y2 - y1;

  ctx.beginPath();
  if (shapeType === 'line') {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (shapeType === 'arrow') {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(dy, dx);
    const headLen = Math.max(16, shape.size * 3.4);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  } else if (shapeType === 'rectangle') {
    ctx.strokeRect(x1, y1, dx, dy);
  } else if (shapeType === 'square') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    const sx = dx >= 0 ? side : -side;
    const sy = dy >= 0 ? side : -side;
    ctx.strokeRect(x1, y1, sx, sy);
  } else if (shapeType === 'circle') {
    const rx = Math.abs(dx) / 2;
    const ry = Math.abs(dy) / 2;
    const cx = x1 + dx / 2;
    const cy = y1 + dy / 2;
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shapeType === 'triangle') {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    const midX = (left + right) / 2;
    ctx.moveTo(midX, top);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawDiagramGraphics(
  ctx: CanvasRenderingContext2D,
  diagramId: string,
  w: number,
  h: number,
  color: string,
  isLightBg: boolean
) {
  const accent = isLightBg ? '#0284C7' : '#38BDF8';
  const warm = isLightBg ? '#D97706' : '#FACC15';
  const green = isLightBg ? '#059669' : '#4ADE80';
  const muted = isLightBg ? 'rgba(15,23,42,0.45)' : 'rgba(248,250,252,0.45)';
  const cx = w / 2;
  const cy = h / 2;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (diagramId === 'unit-circle') {
    const r = Math.min(w, h) * 0.34;
    ctx.strokeStyle = muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.25, cy);
    ctx.lineTo(cx + r * 1.25, cy);
    ctx.moveTo(cx, cy - r * 1.25);
    ctx.lineTo(cx, cy + r * 1.25);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const angle = -Math.PI / 5;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    ctx.strokeStyle = warm;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '600 22px "Lora", Georgia, serif';
    ctx.fillStyle = color;
    ctx.fillText('(cos θ, sin θ)', px + 10, py - 10);
    ctx.fillStyle = warm;
    ctx.fillText('sin θ', px + 8, (cy + py) / 2);
    ctx.fillStyle = green;
    ctx.fillText('cos θ', (cx + px) / 2 - 20, cy + 28);
    ctx.fillStyle = color;
    ctx.fillText('θ', cx + 38, cy - 12);
  } else if (diagramId === 'right-triangle') {
    const xA = w * 0.2;
    const yA = h * 0.78;
    const xB = w * 0.8;
    const yB = h * 0.78;
    const xC = w * 0.2;
    const yC = h * 0.22;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.lineTo(xC, yC);
    ctx.closePath();
    ctx.stroke();

    // Right angle marker
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(xA, yA - 28, 28, 28);

    ctx.font = '600 22px "Lora", Georgia, serif';
    ctx.fillStyle = warm;
    ctx.fillText('Hypotenuse (c)', (xB + xC) / 2 + 12, (yB + yC) / 2 - 10);
    ctx.fillStyle = green;
    ctx.fillText('Adjacent (b)', (xA + xB) / 2 - 55, yA + 34);
    ctx.fillStyle = accent;
    ctx.fillText('Opposite (a)', xA - 12, yC - 16);
    ctx.fillStyle = color;
    ctx.fillText('θ', xB - 58, yB - 14);
  } else if (diagramId === 'pythagoras') {
    const a = w * 0.22;
    const b = w * 0.28;
    const x0 = w * 0.36;
    const y0 = h * 0.56;

    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + b, y0);
    ctx.lineTo(x0, y0 - a);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.fillStyle = isLightBg ? 'rgba(2,132,199,0.12)' : 'rgba(56,189,248,0.14)';
    ctx.fillRect(x0 - a, y0 - a, a, a);
    ctx.strokeRect(x0 - a, y0 - a, a, a);

    ctx.strokeStyle = green;
    ctx.fillStyle = isLightBg ? 'rgba(5,150,105,0.12)' : 'rgba(74,222,128,0.14)';
    ctx.fillRect(x0, y0, b, b);
    ctx.strokeRect(x0, y0, b, b);

    ctx.font = '600 24px "Lora", Georgia, serif';
    ctx.fillStyle = accent;
    ctx.fillText('a²', x0 - a / 2 - 12, y0 - a / 2 + 8);
    ctx.fillStyle = green;
    ctx.fillText('b²', x0 + b / 2 - 12, y0 + b / 2 + 8);
    ctx.fillStyle = warm;
    ctx.fillText('a² + b² = c²', x0 + b * 0.22, y0 - a - 24);
  } else if (diagramId === 'parabola') {
    ctx.strokeStyle = muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.72);
    ctx.lineTo(w * 0.9, h * 0.72);
    ctx.moveTo(cx, h * 0.12);
    ctx.lineTo(cx, h * 0.88);
    ctx.stroke();

    ctx.strokeStyle = warm;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let px = -120; px <= 120; px += 4) {
      const sx = cx + px * (w * 0.0028);
      const sy = h * 0.66 - (px * px) * 0.015;
      if (px === -120) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, h * 0.66, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 22px "Lora", Georgia, serif';
    ctx.fillStyle = color;
    ctx.fillText('Vertex (h, k)', cx + 14, h * 0.66 - 10);
    ctx.fillText('y = a(x − h)² + k', w * 0.16, h * 0.2);
  } else if (diagramId === 'normal-curve') {
    const baseY = h * 0.76;
    ctx.strokeStyle = muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, baseY);
    ctx.lineTo(w * 0.92, baseY);
    ctx.moveTo(cx, h * 0.2);
    ctx.lineTo(cx, baseY);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let i = -30; i <= 30; i++) {
      const z = i / 10;
      const sx = cx + z * (w * 0.13);
      const sy = baseY - Math.exp(-0.5 * z * z) * (h * 0.5);
      if (i === -30) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.font = '600 20px "Lora", Georgia, serif';
    ctx.fillStyle = color;
    ctx.fillText('μ', cx - 6, baseY + 28);
    ctx.fillText('68% within ±1σ', cx - 72, h * 0.2);
  } else if (diagramId === 'circle-theorems') {
    const r = Math.min(w, h) * 0.36;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const pTop = { x: cx - r * 0.35, y: cy - r * 0.93 };
    const pLeft = { x: cx - r * 0.85, y: cy + r * 0.52 };
    const pRight = { x: cx + r * 0.85, y: cy + r * 0.52 };

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(pLeft.x, pLeft.y);
    ctx.lineTo(pTop.x, pTop.y);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.stroke();

    ctx.strokeStyle = warm;
    ctx.beginPath();
    ctx.moveTo(pLeft.x, pLeft.y);
    ctx.lineTo(cx, cy);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.stroke();

    ctx.font = '600 22px "Lora", Georgia, serif';
    ctx.fillStyle = accent;
    ctx.fillText('θ', pTop.x - 4, pTop.y + 42);
    ctx.fillStyle = warm;
    ctx.fillText('2θ', cx - 10, cy + 36);
  }
  ctx.restore();
}

export function measureTextNodeBox(
  content: string,
  fontSize: number,
  fontFamily: 'sans' | 'math' = 'sans'
): { width: number; height: number } {
  const lines = (content || ' ').split('\n');
  const lineH = fontSize * 1.32;
  const fontFam =
    fontFamily === 'sans'
      ? '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
      : '"Lora", Georgia, serif';

  let maxLineW = fontSize * 1.5;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.font = `600 ${fontSize}px ${fontFam}`;
      for (const line of lines) {
        const w = ctx.measureText(line || ' ').width;
        if (w > maxLineW) maxLineW = w;
      }
    }
  } else {
    for (const line of lines) {
      maxLineW = Math.max(maxLineW, line.length * fontSize * 0.62);
    }
  }

  return {
    width: Math.min(BOARD_WIDTH - 48, Math.max(120, Math.ceil(maxLineW + 32))),
    height: Math.max(Math.ceil(fontSize * 1.5), Math.ceil(lines.length * lineH + 20)),
  };
}

export function drawMathNode(
  ctx: CanvasRenderingContext2D,
  node: MathNodeObject,
  isLightBg: boolean,
  highlightedForErase = false
) {
  ctx.save();
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((node.rotation * Math.PI) / 180);
  ctx.translate(-node.width / 2, -node.height / 2);

  if (highlightedForErase) {
    ctx.globalAlpha = 0.35;
  }

  const drawColor = highlightedForErase ? '#EF4444' : node.color;

  if (node.mathType === 'text') {
    const size = node.fontSize ?? Math.max(26, node.height * 0.58);
    const lines = (node.content || '').split('\n');
    const fontFam =
      node.fontFamily === 'sans'
        ? '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
        : '"Lora", Georgia, serif';
    const align = node.textAlign ?? 'center';
    ctx.font = `600 ${size}px ${fontFam}`;
    ctx.fillStyle = drawColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align;
    const lineH = size * 1.32;
    const totalH = lines.length * lineH;
    const startY = (node.height - totalH) / 2 + lineH / 2;
    const xPos = align === 'left' ? 14 : node.width / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], xPos, startY + i * lineH, Math.max(40, node.width - 24));
    }
  } else if (node.mathType === 'fraction') {
    const whole = node.whole?.trim() || '';
    const num = node.numerator?.trim() || 'a';
    const den = node.denominator?.trim() || 'b';
    const scale = Math.min(node.width / 160, node.height / 140);
    const fontSize = Math.max(24, Math.round(42 * scale));
    ctx.font = `600 ${fontSize}px "Lora", Georgia, serif`;
    ctx.fillStyle = drawColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const fracCenterX = whole ? node.width * 0.62 : node.width / 2;
    if (whole) {
      ctx.fillText(whole, node.width * 0.24, node.height / 2);
    }
    ctx.fillText(num, fracCenterX, node.height * 0.29);
    ctx.fillText(den, fracCenterX, node.height * 0.72);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = Math.max(2.5, 4 * scale);
    ctx.beginPath();
    const barHalf = Math.max(ctx.measureText(num).width, ctx.measureText(den).width) * 0.68 + 14;
    ctx.moveTo(fracCenterX - barHalf, node.height * 0.5);
    ctx.lineTo(fracCenterX + barHalf, node.height * 0.5);
    ctx.stroke();
  } else if (node.mathType === 'proof') {
    ctx.fillStyle = isLightBg ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = isLightBg ? 'rgba(15, 23, 42, 0.18)' : 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, node.width, node.height, 14);
    ctx.fill();
    ctx.stroke();

    const lines = node.content.split('\n');
    const fontSize = node.fontSize ?? 28;
    ctx.font = `500 ${fontSize}px "Lora", Georgia, serif`;
    ctx.fillStyle = drawColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let yOff = 22;
    for (const line of lines) {
      ctx.fillText(line, 24, yOff, node.width - 48);
      yOff += fontSize * 1.48;
    }
  } else if (node.mathType === 'axes' || node.mathType === 'graph') {
    const w = node.width;
    const h = node.height;
    const xMin = node.xMin ?? -6;
    const xMax = node.xMax ?? 6;
    const yMin = node.yMin ?? -6;
    const yMax = node.yMax ?? 6;

    ctx.fillStyle = isLightBg ? 'rgba(15, 23, 42, 0.03)' : 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = isLightBg ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 14);
    ctx.fill();
    ctx.stroke();

    const pad = 34;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    const toPxX = (vx: number) => pad + ((vx - xMin) / (xMax - xMin)) * plotW;
    const toPxY = (vy: number) => pad + ((yMax - vy) / (yMax - yMin)) * plotH;

    // Grid lines
    ctx.strokeStyle = isLightBg ? 'rgba(15, 23, 42, 0.1)' : 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = Math.ceil(xMin); gx <= Math.floor(xMax); gx++) {
      const px = toPxX(gx);
      ctx.moveTo(px, pad);
      ctx.lineTo(px, pad + plotH);
    }
    for (let gy = Math.ceil(yMin); gy <= Math.floor(yMax); gy++) {
      const py = toPxY(gy);
      ctx.moveTo(pad, py);
      ctx.lineTo(pad + plotW, py);
    }
    ctx.stroke();

    // Axes
    const originX = toPxX(0);
    const originY = toPxY(0);
    ctx.strokeStyle = isLightBg ? 'rgba(15, 23, 42, 0.65)' : 'rgba(248, 250, 252, 0.65)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (originY >= pad && originY <= pad + plotH) {
      ctx.moveTo(pad, originY);
      ctx.lineTo(pad + plotW, originY);
    }
    if (originX >= pad && originX <= pad + plotW) {
      ctx.moveTo(originX, pad);
      ctx.lineTo(originX, pad + plotH);
    }
    ctx.stroke();

    // Tick numbers
    ctx.font = '500 14px "IBM Plex Mono", monospace';
    ctx.fillStyle = isLightBg ? 'rgba(15, 23, 42, 0.6)' : 'rgba(226, 232, 240, 0.65)';
    ctx.textAlign = 'center';
    for (let gx = Math.ceil(xMin); gx <= Math.floor(xMax); gx += 2) {
      if (gx === 0) continue;
      ctx.fillText(String(gx), toPxX(gx), Math.min(pad + plotH - 4, originY + 18));
    }

    if (node.mathType === 'graph' && node.expression) {
      try {
        const fn = compileMathExpression(node.expression);
        ctx.save();
        ctx.beginPath();
        ctx.rect(pad, pad, plotW, plotH);
        ctx.clip();
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        let penDown = false;
        const steps = 220;
        let prevY: number | null = null;
        for (let i = 0; i <= steps; i++) {
          const vx = xMin + (i / steps) * (xMax - xMin);
          const vy = fn(vx);
          if (!Number.isFinite(vy) || Math.abs(vy) > 1e5) {
            penDown = false;
            prevY = null;
            continue;
          }
          const px = toPxX(vx);
          const py = toPxY(vy);
          if (prevY !== null && Math.abs(py - prevY) > plotH * 0.75) {
            penDown = false;
          }
          if (!penDown) {
            ctx.moveTo(px, py);
            penDown = true;
          } else {
            ctx.lineTo(px, py);
          }
          prevY = py;
        }
        ctx.stroke();
        ctx.restore();

        ctx.font = '600 20px "IBM Plex Mono", monospace';
        ctx.fillStyle = drawColor;
        ctx.textAlign = 'left';
        ctx.fillText(`y = ${node.expression}`, pad + 8, pad + 24);
      } catch {
        // Invalid expression skipped gracefully
      }
    }
  } else if (node.mathType === 'diagram' && node.diagramId) {
    drawDiagramGraphics(ctx, node.diagramId, node.width, node.height, drawColor, isLightBg);
  }

  ctx.restore();
}

export function drawBoardImage(
  ctx: CanvasRenderingContext2D,
  item: BoardImageObject,
  onImageLoaded?: () => void
) {
  const img = getCachedImage(item.src, onImageLoaded);
  ctx.save();
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((item.rotation * Math.PI) / 180);
  if (img) {
    ctx.drawImage(img, -item.width / 2, -item.height / 2, item.width, item.height);
  } else {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
  }
  ctx.restore();
}

export function renderBoardPage(
  ctx: CanvasRenderingContext2D,
  page: BoardPage,
  options?: {
    selectedId?: string | null;
    erasingIds?: Set<string>;
    onImageLoaded?: () => void;
    hideSelectionChrome?: boolean;
  }
) {
  const isLightBg = page.background === 'white';
  drawBoardBackground(ctx, page);

  // Layer 1: Pinned background images
  for (const el of page.elements) {
    if (el.kind === 'image' && el.pinned) {
      drawBoardImage(ctx, el, options?.onImageLoaded);
    }
  }

  // Layer 2: Unpinned images
  for (const el of page.elements) {
    if (el.kind === 'image' && !el.pinned) {
      drawBoardImage(ctx, el, options?.onImageLoaded);
    }
  }

  // Layer 3: Math nodes, shapes, and strokes (always drawable over imported images!)
  for (const el of page.elements) {
    const erasing = options?.erasingIds?.has(el.id) ?? false;
    if (el.kind === 'math') {
      drawMathNode(ctx, el, isLightBg, erasing);
    } else if (el.kind === 'shape') {
      drawShape(ctx, el, erasing);
    } else if (el.kind === 'stroke') {
      drawStroke(ctx, el, erasing);
    }
  }

  // Selection outline & handles
  if (!options?.hideSelectionChrome && options?.selectedId) {
    const selected = page.elements.find((e) => e.id === options.selectedId);
    if (selected) {
      const box = getElementBounds(selected);
      ctx.save();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const rot = 'rotation' in selected ? selected.rotation : 0;
      ctx.translate(cx, cy);
      ctx.rotate((rot * Math.PI) / 180);

      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);
      ctx.setLineDash([]);

      if (selected.kind === 'image' || selected.kind === 'math') {
        const corners = [
          [-box.width / 2, -box.height / 2],
          [box.width / 2, -box.height / 2],
          [box.width / 2, box.height / 2],
          [-box.width / 2, box.height / 2],
        ];
        for (const [hx, hy] of corners) {
          ctx.fillStyle = '#0B0E11';
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(hx, hy, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        // Rotation stem & handle
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -box.height / 2);
        ctx.lineTo(0, -box.height / 2 - 42);
        ctx.stroke();
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(0, -box.height / 2 - 42, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

export function getElementBounds(el: BoardElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (el.kind === 'image' || el.kind === 'math') {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }
  if (el.kind === 'shape') {
    const x = Math.min(el.x1, el.x2);
    const y = Math.min(el.y1, el.y2);
    const width = Math.max(24, Math.abs(el.x2 - el.x1));
    const height = Math.max(24, Math.abs(el.y2 - el.y1));
    return { x, y, width, height };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of el.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 10, height: 10 };
  return {
    x: minX - el.size / 2,
    y: minY - el.size / 2,
    width: Math.max(12, maxX - minX + el.size),
    height: Math.max(12, maxY - minY + el.size),
  };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function hitTestStrokeOrShape(
  el: BoardElement,
  x: number,
  y: number,
  eraserRadius: number
): boolean {
  if (el.kind === 'image') {
    // Eraser never erases imported photos/PDF backgrounds
    return false;
  }
  if (el.kind === 'math') {
    return x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height;
  }
  if (el.kind === 'stroke') {
    const threshold = eraserRadius + el.size * 0.55;
    if (el.points.length === 1) {
      return Math.hypot(x - el.points[0].x, y - el.points[0].y) <= threshold;
    }
    for (let i = 0; i < el.points.length - 1; i++) {
      if (
        distToSegment(
          x,
          y,
          el.points[i].x,
          el.points[i].y,
          el.points[i + 1].x,
          el.points[i + 1].y
        ) <= threshold
      ) {
        return true;
      }
    }
    return false;
  }
  if (el.kind === 'shape') {
    const threshold = eraserRadius + el.size * 0.6;
    const { x1, y1, x2, y2, shapeType } = el;
    if (shapeType === 'line' || shapeType === 'arrow') {
      return distToSegment(x, y, x1, y1, x2, y2) <= threshold;
    }
    if (shapeType === 'rectangle' || shapeType === 'square') {
      const side = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      const rx2 = shapeType === 'square' ? x1 + (x2 >= x1 ? side : -side) : x2;
      const ry2 = shapeType === 'square' ? y1 + (y2 >= y1 ? side : -side) : y2;
      const l = Math.min(x1, rx2);
      const r = Math.max(x1, rx2);
      const t = Math.min(y1, ry2);
      const b = Math.max(y1, ry2);
      return (
        distToSegment(x, y, l, t, r, t) <= threshold ||
        distToSegment(x, y, r, t, r, b) <= threshold ||
        distToSegment(x, y, r, b, l, b) <= threshold ||
        distToSegment(x, y, l, b, l, t) <= threshold
      );
    }
    if (shapeType === 'triangle') {
      const l = Math.min(x1, x2);
      const r = Math.max(x1, x2);
      const t = Math.min(y1, y2);
      const b = Math.max(y1, y2);
      const m = (l + r) / 2;
      return (
        distToSegment(x, y, m, t, r, b) <= threshold ||
        distToSegment(x, y, r, b, l, b) <= threshold ||
        distToSegment(x, y, l, b, m, t) <= threshold
      );
    }
    if (shapeType === 'circle') {
      const rx = Math.max(1, Math.abs(x2 - x1) / 2);
      const ry = Math.max(1, Math.abs(y2 - y1) / 2);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const norm = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const approxDist = Math.abs(norm - 1) * Math.min(rx, ry);
      return approxDist <= threshold;
    }
  }
  return false;
}

export function hitTestSelectableElement(
  page: BoardPage,
  x: number,
  y: number
): BoardElement | null {
  // Check top-down: math & shapes & strokes first, then unpinned images (pinned images stay locked unless selected explicitly via layers or double-check)
  for (let i = page.elements.length - 1; i >= 0; i--) {
    const el = page.elements[i];
    if (el.kind === 'image' && el.pinned) continue;
    if (el.kind === 'image' || el.kind === 'math') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rad = (-el.rotation * Math.PI) / 180;
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad) + el.width / 2;
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad) + el.height / 2;
      if (lx >= 0 && lx <= el.width && ly >= 0 && ly <= el.height) {
        return el;
      }
    } else if (hitTestStrokeOrShape(el, x, y, 14)) {
      return el;
    }
  }
  return null;
}

export function elementIntersectsRect(
  el: BoardElement,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  if (el.kind === 'image' && el.pinned) return false;
  const b = getElementBounds(el);
  return !(
    b.x + b.width < rect.x ||
    b.x > rect.x + rect.width ||
    b.y + b.height < rect.y ||
    b.y > rect.y + rect.height
  );
}

export async function renderPageToDataURL(page: BoardPage, scale = 1): Promise<string> {
  await preloadPageImages(page);
  const off = document.createElement('canvas');
  off.width = Math.round(BOARD_WIDTH * scale);
  off.height = Math.round(BOARD_HEIGHT * scale);
  const ctx = off.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);
  renderBoardPage(ctx, page, { hideSelectionChrome: true });
  return off.toDataURL('image/png');
}
