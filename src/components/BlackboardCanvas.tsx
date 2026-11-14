import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BoardElement,
  BoardImageObject,
  BoardPage,
  MathNodeObject,
  ProtractorState,
  RulerState,
  ShapeObject,
  ShapeType,
  StrokeObject,
  StrokePoint,
  ToolType,
} from '../types/board';
import {
  elementIntersectsRect,
  getElementBounds,
  hitTestSelectableElement,
  hitTestStrokeOrShape,
  measureTextNodeBox,
  renderBoardPage,
} from '../utils/canvasRenderer';
import { createId } from '../utils/storage';
import {
  AlignCenter,
  AlignLeft,
  Check,
  Copy,
  Crop,
  Lock,
  Pencil,
  RotateCw,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';

interface BlackboardCanvasProps {
  page: BoardPage;
  tool: ToolType;
  color: string;
  strokeSize: number;
  eraserSize: number;
  stylusOnly: boolean;
  zoom: number;
  pan: { x: number; y: number };
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onCommitElements: (nextElements: BoardElement[], pushHistory?: boolean) => void;
  onRequestCropImage: (img: BoardImageObject) => void;
  ruler: RulerState;
  onRulerChange: (r: RulerState) => void;
  protractor: ProtractorState;
  onProtractorChange: (p: ProtractorState) => void;
}

type DragMode =
  | { type: 'none' }
  | { type: 'draw-stroke'; stroke: StrokeObject }
  | { type: 'draw-shape'; shape: ShapeObject }
  | { type: 'erase'; hitIds: Set<string>; cursor: { x: number; y: number } }
  | {
      type: 'move-element';
      id: string;
      startX: number;
      startY: number;
      origEl: BoardElement;
    }
  | {
      type: 'marquee-select';
      startX: number;
      startY: number;
      curX: number;
      curY: number;
    }
  | {
      type: 'move-group';
      ids: Set<string>;
      startX: number;
      startY: number;
      origElements: BoardElement[];
    }
  | {
      type: 'resize-element';
      id: string;
      corner: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
      origFontSize?: number;
      startX: number;
      startY: number;
    }
  | {
      type: 'rotate-element';
      id: string;
      cx: number;
      cy: number;
      startAngle: number;
      origRot: number;
    }
  | {
      type: 'drag-ruler';
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      type: 'rotate-ruler';
      cx: number;
      cy: number;
    }
  | {
      type: 'drag-protractor';
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      type: 'rotate-protractor';
      cx: number;
      cy: number;
    };

const SHAPE_TOOLS = new Set<ToolType>([
  'line',
  'circle',
  'rectangle',
  'square',
  'triangle',
  'arrow',
]);

type LaserStroke = {
  id: string;
  color: string;
  size: number;
  points: { x: number; y: number }[];
  endedAt: number | null;
};

const LASER_FADE_MS = 2000;

type TextEditorState = {
  id: string | null;
  x: number;
  y: number;
  content: string;
  fontSize: number;
  fontFamily: 'sans' | 'math';
  textAlign: 'left' | 'center';
  color: string;
};

export const BlackboardCanvas: React.FC<BlackboardCanvasProps> = ({
  page,
  tool,
  color,
  strokeSize,
  eraserSize,
  stylusOnly,
  zoom,
  pan,
  onZoomChange,
  onPanChange,
  selectedId,
  onSelectId,
  onCommitElements,
  onRequestCropImage,
  ruler,
  onRulerChange,
  protractor,
  onProtractorChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const [baseScale, setBaseScale] = useState(0.35);
  const [liveStroke, setLiveStroke] = useState<StrokeObject | null>(null);
  const [liveShape, setLiveShape] = useState<ShapeObject | null>(null);
  const [erasingIds, setErasingIds] = useState<Set<string>>(new Set());
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  const [elementsDraft, setElementsDraft] = useState<BoardElement[] | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);

  const laserStrokesRef = useRef<LaserStroke[]>([]);
  const activeLaserRef = useRef<LaserStroke | null>(null);
  const laserRafRef = useRef<number | null>(null);
  const redrawRef = useRef<() => void>(() => {});

  const dragRef = useRef<DragMode>({ type: 'none' });
  const activeTouchesRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);

  // Fit 9:16 portrait board comfortably inside container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateScale = () => {
      const rect = el.getBoundingClientRect();
      const pad = window.innerWidth < 640 ? 4 : 24;
      const availW = Math.max(200, rect.width - pad * 2);
      const availH = Math.max(300, rect.height - pad * 2);
      const scale = Math.min(availW / BOARD_WIDTH, availH / BOARD_HEIGHT);
      setBaseScale(scale);
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveScale = baseScale * zoom;
  const displayW = BOARD_WIDTH * effectiveScale;
  const displayH = BOARD_HEIGHT * effectiveScale;

  const activeElements = elementsDraft ?? page.elements;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(BOARD_WIDTH * dpr);
    const targetH = Math.round(BOARD_HEIGHT * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const visibleElements = textEditor?.id
      ? activeElements.filter((el) => el.id !== textEditor.id)
      : activeElements;

    const tempPage: BoardPage = {
      ...page,
      elements: [
        ...visibleElements,
        ...(liveStroke ? [liveStroke] : []),
        ...(liveShape ? [liveShape] : []),
      ],
    };

    renderBoardPage(ctx, tempPage, {
      selectedId: tool === 'select' ? selectedId : null,
      erasingIds,
      onImageLoaded: () => requestAnimationFrame(redraw),
    });

    if (eraserCursor && tool === 'eraser') {
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)';
      ctx.fillStyle = 'rgba(248, 113, 113, 0.14)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(eraserCursor.x, eraserCursor.y, eraserSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Group bounding box for Area Select
    if (tool === 'area-select' && multiSelectedIds.size > 0) {
      const selectedItems = activeElements.filter((el) => multiSelectedIds.has(el.id));
      if (selectedItems.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const item of selectedItems) {
          const b = getElementBounds(item);
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        }
        ctx.save();
        ctx.strokeStyle = '#38BDF8';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        ctx.roundRect(minX - 10, minY - 10, maxX - minX + 20, maxY - minY + 20, 12);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Active marquee box during drag
    if (marqueeRect) {
      ctx.save();
      ctx.strokeStyle = '#38BDF8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.roundRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height, 10);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Render temporary Laser Pointer strokes (fade out over 2000ms after release)
    const now = performance.now();
    const allLasers = [
      ...laserStrokesRef.current,
      ...(activeLaserRef.current ? [activeLaserRef.current] : []),
    ];
    for (const ls of allLasers) {
      if (ls.points.length === 0) continue;
      const elapsed = ls.endedAt !== null ? now - ls.endedAt : 0;
      const alpha = ls.endedAt !== null ? Math.max(0, 1 - elapsed / LASER_FADE_MS) : 1;
      if (alpha <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const drawLaserPath = () => {
        ctx.beginPath();
        if (ls.points.length === 1) {
          ctx.arc(ls.points[0].x, ls.points[0].y, Math.max(4, ls.size * 0.6), 0, Math.PI * 2);
          return;
        }
        ctx.moveTo(ls.points[0].x, ls.points[0].y);
        for (let i = 1; i < ls.points.length - 1; i++) {
          const mx = (ls.points[i].x + ls.points[i + 1].x) / 2;
          const my = (ls.points[i].y + ls.points[i + 1].y) / 2;
          ctx.quadraticCurveTo(ls.points[i].x, ls.points[i].y, mx, my);
        }
        ctx.lineTo(ls.points[ls.points.length - 1].x, ls.points[ls.points.length - 1].y);
      };

      // Outer luminous laser glow
      ctx.shadowColor = ls.color;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = ls.color;
      ctx.lineWidth = Math.max(10, ls.size * 1.6);
      drawLaserPath();
      if (ls.points.length === 1) {
        ctx.fillStyle = ls.color;
        ctx.fill();
      } else {
        ctx.stroke();
      }

      // Bright inner white core
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(3.5, ls.size * 0.55);
      drawLaserPath();
      if (ls.points.length === 1) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      } else {
        ctx.stroke();
      }

      // Active tip dot while pointing
      if (ls.endedAt === null) {
        const tip = ls.points[ls.points.length - 1];
        ctx.shadowColor = ls.color;
        ctx.shadowBlur = 22;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, Math.max(7, ls.size * 0.85), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
  }, [page, activeElements, liveStroke, liveShape, tool, selectedId, erasingIds, eraserCursor, eraserSize, multiSelectedIds, marqueeRect, textEditor?.id]);

  redrawRef.current = redraw;

  const commitTextEditor = useCallback(
    (editor: TextEditorState | null) => {
      if (!editor) return;
      const trimmed = editor.content.replace(/\s+$/g, '');
      if (!trimmed.trim()) {
        if (editor.id) {
          onCommitElements(
            page.elements.filter((el) => el.id !== editor.id),
            true
          );
        }
        setTextEditor(null);
        return;
      }
      const box = measureTextNodeBox(trimmed, editor.fontSize, editor.fontFamily);
      if (editor.id) {
        onCommitElements(
          page.elements.map((el) =>
            el.id === editor.id && el.kind === 'math'
              ? {
                  ...el,
                  content: trimmed,
                  x: editor.x,
                  y: editor.y,
                  width: box.width,
                  height: box.height,
                  fontSize: editor.fontSize,
                  fontFamily: editor.fontFamily,
                  textAlign: editor.textAlign,
                  color: editor.color,
                }
              : el
          ),
          true
        );
      } else {
        const clampedX = Math.max(24, Math.min(BOARD_WIDTH - box.width - 24, editor.x));
        const clampedY = Math.max(24, Math.min(BOARD_HEIGHT - box.height - 24, editor.y));
        const newNode: MathNodeObject = {
          id: createId('txt'),
          kind: 'math',
          mathType: 'text',
          x: clampedX,
          y: clampedY,
          width: box.width,
          height: box.height,
          rotation: 0,
          color: editor.color,
          content: trimmed,
          fontSize: editor.fontSize,
          fontFamily: editor.fontFamily,
          textAlign: editor.textAlign,
        };
        onCommitElements([...page.elements, newNode], true);
      }
      setTextEditor(null);
    },
    [page.elements, onCommitElements]
  );

  useEffect(() => {
    setTextEditor((prev) => (prev ? { ...prev, color } : null));
  }, [color]);

  useEffect(() => {
    if (textEditor && textAreaRef.current) {
      const ta = textAreaRef.current;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }, [textEditor?.id, textEditor?.x, textEditor?.y]);

  useEffect(() => {
    if (tool !== 'area-select' && multiSelectedIds.size > 0) {
      setMultiSelectedIds(new Set());
      setMarqueeRect(null);
    }
    if (tool !== 'text' && tool !== 'select' && textEditor) {
      commitTextEditor(textEditor);
    }
  }, [tool, multiSelectedIds.size, textEditor, commitTextEditor]);

  useEffect(() => {
    setMultiSelectedIds(new Set());
    setMarqueeRect(null);
    setTextEditor(null);
  }, [page.id]);

  useEffect(() => {
    const id = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(id);
  }, [redraw]);

  const startLaserLoop = useCallback(() => {
    if (laserRafRef.current !== null) return;
    const tick = () => {
      const now = performance.now();
      laserStrokesRef.current = laserStrokesRef.current.filter(
        (s) => s.endedAt === null || now - s.endedAt < LASER_FADE_MS
      );
      redrawRef.current();
      if (laserStrokesRef.current.length > 0 || activeLaserRef.current) {
        laserRafRef.current = requestAnimationFrame(tick);
      } else {
        laserRafRef.current = null;
      }
    };
    laserRafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (laserRafRef.current !== null) {
        cancelAnimationFrame(laserRafRef.current);
        laserRafRef.current = null;
      }
    };
  }, []);

  const clientToBoard = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * BOARD_WIDTH;
      const y = ((clientY - rect.top) / rect.height) * BOARD_HEIGHT;
      return { x, y };
    },
    []
  );

  // Snap point to ruler edge if ruler is visible and point is close to top edge of ruler
  const maybeSnapToRuler = useCallback(
    (pt: { x: number; y: number }): { x: number; y: number } => {
      if (!ruler.visible) return pt;
      const rad = (ruler.angle * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const dx = pt.x - ruler.x;
      const dy = pt.y - ruler.y;
      const along = dx * ux + dy * uy;
      const perp = -dx * uy + dy * ux;
      // Ruler top edge is at perp = -36
      if (along >= -20 && along <= ruler.length + 20 && Math.abs(perp - -36) < 28) {
        return {
          x: ruler.x + along * ux - -36 * uy,
          y: ruler.y + along * uy + -36 * ux,
        };
      }
      return pt;
    },
    [ruler]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== 'text') {
      e.preventDefault();
    }
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      if (activeTouchesRef.current.size === 2) {
        // Cancel any single-finger live stroke and enter 2-finger pinch/pan mode
        dragRef.current = { type: 'none' };
        setLiveStroke(null);
        setLiveShape(null);
        activeLaserRef.current = null;
        const pts = Array.from(activeTouchesRef.current.values());
        const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
        pinchStartRef.current = {
          dist: Math.max(10, dist),
          midX: (pts[0].clientX + pts[1].clientX) / 2,
          midY: (pts[0].clientY + pts[1].clientY) / 2,
          zoom,
          panX: pan.x,
          panY: pan.y,
        };
        return;
      }
    }

    if (stylusOnly && e.pointerType === 'touch') {
      return;
    }

    const rawPt = clientToBoard(e.clientX, e.clientY);

    if (tool === 'text') {
      onSelectId(null);
      if (textEditor) {
        commitTextEditor(textEditor);
        return;
      }
      const hit = hitTestSelectableElement(page, rawPt.x, rawPt.y);
      if (hit && hit.kind === 'math' && hit.mathType === 'text') {
        setTextEditor({
          id: hit.id,
          x: hit.x,
          y: hit.y,
          content: hit.content,
          fontSize: hit.fontSize ?? Math.max(28, Math.round(hit.height * 0.58)),
          fontFamily: hit.fontFamily ?? 'math',
          textAlign: hit.textAlign ?? 'center',
          color: hit.color,
        });
      } else {
        const defaultSize = Math.max(36, Math.min(72, Math.round(strokeSize * 5)));
        setTextEditor({
          id: null,
          x: Math.max(32, Math.min(BOARD_WIDTH - 320, rawPt.x)),
          y: Math.max(48, Math.min(BOARD_HEIGHT - 160, rawPt.y - defaultSize * 0.6)),
          content: '',
          fontSize: defaultSize,
          fontFamily: 'sans',
          textAlign: 'left',
          color,
        });
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === 'select') {
      // First check if tapping resize or rotate handle of currently selected image/math node
      if (selectedId) {
        const sel = page.elements.find((el) => el.id === selectedId);
        if (sel && (sel.kind === 'image' || sel.kind === 'math')) {
          const cx = sel.x + sel.width / 2;
          const cy = sel.y + sel.height / 2;
          const rad = (-sel.rotation * Math.PI) / 180;
          const dx = rawPt.x - cx;
          const dy = rawPt.y - cy;
          const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
          const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

          // Rotate handle
          if (Math.hypot(lx, ly - (-sel.height / 2 - 42)) <= 32) {
            dragRef.current = {
              type: 'rotate-element',
              id: sel.id,
              cx,
              cy,
              startAngle: (Math.atan2(rawPt.y - cy, rawPt.x - cx) * 180) / Math.PI,
              origRot: sel.rotation,
            };
            setElementsDraft(page.elements);
            return;
          }

          // Corner handles
          const corners = [
            [-sel.width / 2, -sel.height / 2],
            [sel.width / 2, -sel.height / 2],
            [sel.width / 2, sel.height / 2],
            [-sel.width / 2, sel.height / 2],
          ];
          for (let ci = 0; ci < corners.length; ci++) {
            if (Math.hypot(lx - corners[ci][0], ly - corners[ci][1]) <= 32) {
              dragRef.current = {
                type: 'resize-element',
                id: sel.id,
                corner: ci,
                origX: sel.x,
                origY: sel.y,
                origW: sel.width,
                origH: sel.height,
                origFontSize: sel.kind === 'math' ? sel.fontSize : undefined,
                startX: rawPt.x,
                startY: rawPt.y,
              };
              setElementsDraft(page.elements);
              return;
            }
          }
        }
      }

      const hit = hitTestSelectableElement(page, rawPt.x, rawPt.y);
      if (hit) {
        onSelectId(hit.id);
        dragRef.current = {
          type: 'move-element',
          id: hit.id,
          startX: rawPt.x,
          startY: rawPt.y,
          origEl: structuredClone(hit),
        };
        setElementsDraft(page.elements);
      } else {
        onSelectId(null);
        dragRef.current = { type: 'none' };
      }
      return;
    }

    if (tool === 'area-select') {
      onSelectId(null);
      // If clicking inside existing group selection box, drag the whole group
      if (multiSelectedIds.size > 0) {
        const selectedItems = page.elements.filter((el) => multiSelectedIds.has(el.id));
        if (selectedItems.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const item of selectedItems) {
            const b = getElementBounds(item);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
          }
          if (rawPt.x >= minX - 16 && rawPt.x <= maxX + 16 && rawPt.y >= minY - 16 && rawPt.y <= maxY + 16) {
            dragRef.current = {
              type: 'move-group',
              ids: new Set(multiSelectedIds),
              startX: rawPt.x,
              startY: rawPt.y,
              origElements: structuredClone(page.elements),
            };
            setElementsDraft(page.elements);
            return;
          }
        }
      }
      setMultiSelectedIds(new Set());
      dragRef.current = {
        type: 'marquee-select',
        startX: rawPt.x,
        startY: rawPt.y,
        curX: rawPt.x,
        curY: rawPt.y,
      };
      setMarqueeRect({ x: rawPt.x, y: rawPt.y, width: 0, height: 0 });
      return;
    }

    onSelectId(null);

    if (tool === 'laser') {
      const laserColor =
        color.toLowerCase() === '#f8fafc' || color.toLowerCase() === '#0f172a'
          ? '#FF3B30'
          : color;
      activeLaserRef.current = {
        id: createId('laser'),
        color: laserColor,
        size: strokeSize,
        points: [{ x: rawPt.x, y: rawPt.y }],
        endedAt: null,
      };
      startLaserLoop();
      return;
    }

    if (tool === 'eraser') {
      const hitIds = new Set<string>();
      for (const el of page.elements) {
        if (hitTestStrokeOrShape(el, rawPt.x, rawPt.y, eraserSize)) {
          hitIds.add(el.id);
        }
      }
      dragRef.current = { type: 'erase', hitIds, cursor: rawPt };
      setErasingIds(new Set(hitIds));
      setEraserCursor(rawPt);
      return;
    }

    if (SHAPE_TOOLS.has(tool)) {
      const pt = maybeSnapToRuler(rawPt);
      const shape: ShapeObject = {
        id: createId('shp'),
        kind: 'shape',
        shapeType: tool as ShapeType,
        color,
        size: strokeSize,
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
      };
      dragRef.current = { type: 'draw-shape', shape };
      setLiveShape(shape);
      return;
    }

    const pt = maybeSnapToRuler(rawPt);
    const strokeTool =
      tool === 'pencil' || tool === 'highlighter' || tool === 'freehand-shape' ? tool : 'pen';
    const newStroke: StrokeObject = {
      id: createId('str'),
      kind: 'stroke',
      tool: strokeTool,
      color,
      size: strokeTool === 'highlighter' ? Math.max(18, strokeSize * 2.4) : strokeSize,
      points: [{ x: pt.x, y: pt.y, pressure: e.pressure || 0.5 }],
    };
    dragRef.current = { type: 'draw-stroke', stroke: newStroke };
    setLiveStroke(newStroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      if (activeTouchesRef.current.has(e.pointerId)) {
        activeTouchesRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      }
      if (activeTouchesRef.current.size === 2 && pinchStartRef.current) {
        const pts = Array.from(activeTouchesRef.current.values());
        const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
        const midX = (pts[0].clientX + pts[1].clientX) / 2;
        const midY = (pts[0].clientY + pts[1].clientY) / 2;
        const nextZoom = Math.min(4, Math.max(0.6, pinchStartRef.current.zoom * (dist / pinchStartRef.current.dist)));
        onZoomChange(Number(nextZoom.toFixed(2)));
        onPanChange({
          x: pinchStartRef.current.panX + (midX - pinchStartRef.current.midX),
          y: pinchStartRef.current.panY + (midY - pinchStartRef.current.midY),
        });
        return;
      }
    }

    const mode = dragRef.current;

    if (tool === 'laser' && activeLaserRef.current) {
      const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      const added: { x: number; y: number }[] = [];
      for (const ce of coalesced) {
        const p = clientToBoard(ce.clientX, ce.clientY);
        const last =
          added[added.length - 1] ??
          activeLaserRef.current.points[activeLaserRef.current.points.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1.5) {
          added.push({ x: p.x, y: p.y });
        }
      }
      if (added.length > 0) {
        activeLaserRef.current.points.push(...added);
        startLaserLoop();
      }
      return;
    }

    if (mode.type === 'none') return;

    const rawPt = clientToBoard(e.clientX, e.clientY);

    if (mode.type === 'draw-stroke') {
      const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      const added: StrokePoint[] = [];
      for (const ce of coalesced) {
        const p = maybeSnapToRuler(clientToBoard(ce.clientX, ce.clientY));
        const last = added[added.length - 1] ?? mode.stroke.points[mode.stroke.points.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1.5) {
          added.push({ x: p.x, y: p.y, pressure: ce.pressure || 0.5 });
        }
      }
      if (added.length > 0) {
        mode.stroke = {
          ...mode.stroke,
          points: [...mode.stroke.points, ...added],
        };
        setLiveStroke(mode.stroke);
      }
    } else if (mode.type === 'draw-shape') {
      const pt = maybeSnapToRuler(rawPt);
      mode.shape = { ...mode.shape, x2: pt.x, y2: pt.y };
      setLiveShape(mode.shape);
    } else if (mode.type === 'erase') {
      for (const el of page.elements) {
        if (!mode.hitIds.has(el.id) && hitTestStrokeOrShape(el, rawPt.x, rawPt.y, eraserSize)) {
          mode.hitIds.add(el.id);
        }
      }
      setErasingIds(new Set(mode.hitIds));
      setEraserCursor(rawPt);
    } else if (mode.type === 'marquee-select') {
      mode.curX = rawPt.x;
      mode.curY = rawPt.y;
      setMarqueeRect({
        x: Math.min(mode.startX, rawPt.x),
        y: Math.min(mode.startY, rawPt.y),
        width: Math.abs(rawPt.x - mode.startX),
        height: Math.abs(rawPt.y - mode.startY),
      });
    } else if (mode.type === 'move-group') {
      const dx = rawPt.x - mode.startX;
      const dy = rawPt.y - mode.startY;
      setElementsDraft(
        mode.origElements.map((el) => {
          if (!mode.ids.has(el.id)) return el;
          if (el.kind === 'image' || el.kind === 'math') {
            return { ...el, x: el.x + dx, y: el.y + dy };
          }
          if (el.kind === 'shape') {
            return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
          }
          if (el.kind === 'stroke') {
            return { ...el, points: el.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
          }
          return el;
        })
      );
    } else if (mode.type === 'move-element') {
      const dx = rawPt.x - mode.startX;
      const dy = rawPt.y - mode.startY;
      setElementsDraft(
        page.elements.map((el) => {
          if (el.id !== mode.id) return el;
          const orig = mode.origEl;
          if ((el.kind === 'image' || el.kind === 'math') && (orig.kind === 'image' || orig.kind === 'math')) {
            return { ...el, x: orig.x + dx, y: orig.y + dy };
          }
          if (el.kind === 'shape' && orig.kind === 'shape') {
            return { ...el, x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy };
          }
          if (el.kind === 'stroke' && orig.kind === 'stroke') {
            return {
              ...el,
              points: orig.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
            };
          }
          return el;
        })
      );
    } else if (mode.type === 'resize-element') {
      const dx = rawPt.x - mode.startX;
      const dy = rawPt.y - mode.startY;
      setElementsDraft(
        page.elements.map((el) => {
          if (el.id !== mode.id || (el.kind !== 'image' && el.kind !== 'math')) return el;
          let nextX = mode.origX;
          let nextY = mode.origY;
          let nextW = mode.origW;
          let nextH = mode.origH;
          if (mode.corner === 0) {
            nextX = mode.origX + dx;
            nextY = mode.origY + dy;
            nextW = Math.max(48, mode.origW - dx);
            nextH = Math.max(48, mode.origH - dy);
          } else if (mode.corner === 1) {
            nextY = mode.origY + dy;
            nextW = Math.max(48, mode.origW + dx);
            nextH = Math.max(48, mode.origH - dy);
          } else if (mode.corner === 2) {
            nextW = Math.max(48, mode.origW + dx);
            nextH = Math.max(48, mode.origH + dy);
          } else if (mode.corner === 3) {
            nextX = mode.origX + dx;
            nextW = Math.max(48, mode.origW - dx);
            nextH = Math.max(48, mode.origH + dy);
          }
          if (el.kind === 'math' && el.mathType === 'text' && mode.origFontSize && mode.origH > 0) {
            const nextFontSize = Math.max(
              18,
              Math.min(180, Math.round(mode.origFontSize * (nextH / mode.origH)))
            );
            return { ...el, x: nextX, y: nextY, width: nextW, height: nextH, fontSize: nextFontSize };
          }
          return { ...el, x: nextX, y: nextY, width: nextW, height: nextH };
        })
      );
    } else if (mode.type === 'rotate-element') {
      const angle = (Math.atan2(rawPt.y - mode.cy, rawPt.x - mode.cx) * 180) / Math.PI;
      const delta = angle - mode.startAngle;
      setElementsDraft(
        page.elements.map((el) => {
          if (el.id !== mode.id || (el.kind !== 'image' && el.kind !== 'math')) return el;
          return { ...el, rotation: Math.round(mode.origRot + delta) };
        })
      );
    }
  };

  const finishInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.delete(e.pointerId);
      if (activeTouchesRef.current.size < 2) {
        pinchStartRef.current = null;
      }
    }

    if (activeLaserRef.current) {
      laserStrokesRef.current.push({
        ...activeLaserRef.current,
        endedAt: performance.now(),
      });
      activeLaserRef.current = null;
      startLaserLoop();
      return;
    }

    const mode = dragRef.current;
    dragRef.current = { type: 'none' };

    if (mode.type === 'draw-stroke') {
      let finalized = mode.stroke;
      if (finalized.tool === 'freehand-shape' && finalized.points.length > 6) {
        const first = finalized.points[0];
        const last = finalized.points[finalized.points.length - 1];
        if (Math.hypot(last.x - first.x, last.y - first.y) < 75) {
          finalized = { ...finalized, closed: true };
        }
      }
      setLiveStroke(null);
      onCommitElements([...page.elements, finalized], true);
    } else if (mode.type === 'draw-shape') {
      const dist = Math.hypot(mode.shape.x2 - mode.shape.x1, mode.shape.y2 - mode.shape.y1);
      setLiveShape(null);
      if (dist > 6) {
        onCommitElements([...page.elements, mode.shape], true);
      }
    } else if (mode.type === 'erase') {
      setEraserCursor(null);
      setErasingIds(new Set());
      if (mode.hitIds.size > 0) {
        onCommitElements(
          page.elements.filter((el) => !mode.hitIds.has(el.id)),
          true
        );
      }
    } else if (mode.type === 'marquee-select') {
      const rx = Math.min(mode.startX, mode.curX);
      const ry = Math.min(mode.startY, mode.curY);
      const rw = Math.abs(mode.curX - mode.startX);
      const rh = Math.abs(mode.curY - mode.startY);
      setMarqueeRect(null);
      if (rw > 10 || rh > 10) {
        const hits = new Set<string>();
        for (const el of page.elements) {
          if (elementIntersectsRect(el, { x: rx, y: ry, width: rw, height: rh })) {
            hits.add(el.id);
          }
        }
        setMultiSelectedIds(hits);
      } else {
        const tapHit = hitTestSelectableElement(page, mode.startX, mode.startY);
        setMultiSelectedIds(tapHit ? new Set([tapHit.id]) : new Set());
      }
    } else if (
      mode.type === 'move-element' ||
      mode.type === 'move-group' ||
      mode.type === 'resize-element' ||
      mode.type === 'rotate-element'
    ) {
      if (elementsDraft) {
        onCommitElements(elementsDraft, true);
        setElementsDraft(null);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      onZoomChange(Number(Math.min(4, Math.max(0.5, zoom + delta)).toFixed(2)));
    }
  };

  // Selected element floating controls
  const selectedEl = selectedId ? activeElements.find((el) => el.id === selectedId) : null;
  const pinnedImages = page.elements.filter(
    (el): el is BoardImageObject => el.kind === 'image' && el.pinned
  );

  // Geometry tool drag handlers on SVG overlay
  const startGeometryDrag = (
    e: React.PointerEvent,
    kind: 'drag-ruler' | 'rotate-ruler' | 'drag-protractor' | 'rotate-protractor'
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = clientToBoard(e.clientX, e.clientY);
    if (kind === 'drag-ruler') {
      dragRef.current = { type: 'drag-ruler', startX: pt.x, startY: pt.y, origX: ruler.x, origY: ruler.y };
    } else if (kind === 'rotate-ruler') {
      dragRef.current = { type: 'rotate-ruler', cx: ruler.x, cy: ruler.y };
    } else if (kind === 'drag-protractor') {
      dragRef.current = {
        type: 'drag-protractor',
        startX: pt.x,
        startY: pt.y,
        origX: protractor.x,
        origY: protractor.y,
      };
    } else if (kind === 'rotate-protractor') {
      dragRef.current = { type: 'rotate-protractor', cx: protractor.x, cy: protractor.y };
    }
  };

  const moveGeometryDrag = (e: React.PointerEvent) => {
    const mode = dragRef.current;
    if (
      mode.type !== 'drag-ruler' &&
      mode.type !== 'rotate-ruler' &&
      mode.type !== 'drag-protractor' &&
      mode.type !== 'rotate-protractor'
    ) {
      return;
    }
    e.stopPropagation();
    const pt = clientToBoard(e.clientX, e.clientY);
    if (mode.type === 'drag-ruler') {
      onRulerChange({
        ...ruler,
        x: mode.origX + (pt.x - mode.startX),
        y: mode.origY + (pt.y - mode.startY),
      });
    } else if (mode.type === 'rotate-ruler') {
      const ang = Math.round((Math.atan2(pt.y - mode.cy, pt.x - mode.cx) * 180) / Math.PI);
      onRulerChange({ ...ruler, angle: ang });
    } else if (mode.type === 'drag-protractor') {
      onProtractorChange({
        ...protractor,
        x: mode.origX + (pt.x - mode.startX),
        y: mode.origY + (pt.y - mode.startY),
      });
    } else if (mode.type === 'rotate-protractor') {
      const ang = Math.round((Math.atan2(pt.y - mode.cy, pt.x - mode.cx) * 180) / Math.PI);
      onProtractorChange({ ...protractor, angle: ang });
    }
  };

  const endGeometryDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = { type: 'none' };
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden select-none bg-[#090B0E]"
    >
      {/* Centered 9:16 Portrait Blackboard Frame */}
      <div
        className="relative shadow-[0_20px_60px_rgba(0,0,0,0.65)] ring-1 ring-white/10 rounded-xl overflow-hidden"
        style={{
          width: displayW,
          height: displayH,
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishInteraction}
          onPointerCancel={finishInteraction}
          className="w-full h-full block touch-none cursor-crosshair"
        />

        {/* Interactive Geometry Overlay: Ruler & Protractor */}
        {(ruler.visible || protractor.visible) && (
          <svg
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {ruler.visible && (
              <g
                transform={`translate(${ruler.x}, ${ruler.y}) rotate(${ruler.angle})`}
                className="pointer-events-auto cursor-move"
                onPointerDown={(e) => startGeometryDrag(e, 'drag-ruler')}
                onPointerMove={moveGeometryDrag}
                onPointerUp={endGeometryDrag}
              >
                <rect
                  x={0}
                  y={-36}
                  width={ruler.length}
                  height={84}
                  rx={8}
                  fill="rgba(56, 189, 248, 0.16)"
                  stroke="rgba(56, 189, 248, 0.8)"
                  strokeWidth={2.5}
                />
                {Array.from({ length: Math.floor(ruler.length / 20) + 1 }).map((_, idx) => {
                  const tx = idx * 20;
                  const major = idx % 5 === 0;
                  return (
                    <g key={idx}>
                      <line
                        x1={tx}
                        y1={-36}
                        x2={tx}
                        y2={-36 + (major ? 22 : 12)}
                        stroke="rgba(224, 242, 254, 0.9)"
                        strokeWidth={major ? 2.2 : 1.2}
                      />
                      {major && (
                        <text
                          x={tx}
                          y={-2}
                          textAnchor="middle"
                          fill="#E0F2FE"
                          fontSize={14}
                          fontFamily="IBM Plex Mono, monospace"
                        >
                          {idx / 5}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text
                  x={ruler.length / 2}
                  y={28}
                  textAnchor="middle"
                  fill="#BAE6FD"
                  fontSize={16}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {ruler.angle}° · Snap edge active
                </text>
                <circle
                  cx={ruler.length - 18}
                  cy={6}
                  r={18}
                  fill="#38BDF8"
                  className="cursor-grab"
                  onPointerDown={(e) => startGeometryDrag(e, 'rotate-ruler')}
                />
              </g>
            )}

            {protractor.visible && (
              <g
                transform={`translate(${protractor.x}, ${protractor.y}) rotate(${protractor.angle})`}
                className="pointer-events-auto cursor-move"
                onPointerDown={(e) => startGeometryDrag(e, 'drag-protractor')}
                onPointerMove={moveGeometryDrag}
                onPointerUp={endGeometryDrag}
              >
                <path
                  d={`M ${-protractor.radius} 0 A ${protractor.radius} ${protractor.radius} 0 0 1 ${protractor.radius} 0 Z`}
                  fill="rgba(250, 204, 21, 0.14)"
                  stroke="rgba(250, 204, 21, 0.85)"
                  strokeWidth={2.5}
                />
                {Array.from({ length: 19 }).map((_, idx) => {
                  const deg = idx * 10;
                  const rad = (-deg * Math.PI) / 180;
                  const r1 = protractor.radius - (deg % 30 === 0 ? 28 : 16);
                  const r2 = protractor.radius;
                  return (
                    <g key={deg}>
                      <line
                        x1={Math.cos(rad) * r1}
                        y1={Math.sin(rad) * r1}
                        x2={Math.cos(rad) * r2}
                        y2={Math.sin(rad) * r2}
                        stroke="rgba(254, 240, 138, 0.9)"
                        strokeWidth={deg % 30 === 0 ? 2.2 : 1.2}
                      />
                      {deg % 30 === 0 && (
                        <text
                          x={Math.cos(rad) * (protractor.radius - 44)}
                          y={Math.sin(rad) * (protractor.radius - 44)}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#FEF08A"
                          fontSize={14}
                          fontFamily="IBM Plex Mono, monospace"
                        >
                          {deg}°
                        </text>
                      )}
                    </g>
                  );
                })}
                <circle cx={0} cy={0} r={6} fill="#FACC15" />
                <circle
                  cx={protractor.radius}
                  cy={0}
                  r={16}
                  fill="#FACC15"
                  className="cursor-grab"
                  onPointerDown={(e) => startGeometryDrag(e, 'rotate-protractor')}
                />
              </g>
            )}
          </svg>
        )}

        {/* Selected Element Floating Action Pill */}
        {selectedEl && tool === 'select' && (
          <div
            className="absolute z-20 flex items-center gap-1 rounded-xl bg-[#14191F]/95 border border-white/15 px-2 py-1.5 shadow-xl backdrop-blur-md"
            style={{
              left: Math.min(
                displayW - 220,
                Math.max(8, (getElementBounds(selectedEl).x / BOARD_WIDTH) * displayW)
              ),
              top: Math.max(
                8,
                (getElementBounds(selectedEl).y / BOARD_HEIGHT) * displayH - 52
              ),
            }}
          >
            {selectedEl.kind === 'image' && (
              <>
                <button
                  onClick={() => {
                    onCommitElements(
                      page.elements.map((el) =>
                        el.id === selectedEl.id && el.kind === 'image'
                          ? { ...el, pinned: !el.pinned }
                          : el
                      ),
                      true
                    );
                    onSelectId(null);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-sky-300 hover:bg-white/10 min-h-[36px]"
                  title="Pin to background"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Pin BG</span>
                </button>
                <button
                  onClick={() => onRequestCropImage(selectedEl)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/10 min-h-[36px]"
                  title="Crop image"
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>Crop</span>
                </button>
              </>
            )}
            {selectedEl.kind === 'math' && selectedEl.mathType === 'text' && (
              <button
                onClick={() => {
                  setTextEditor({
                    id: selectedEl.id,
                    x: selectedEl.x,
                    y: selectedEl.y,
                    content: selectedEl.content,
                    fontSize:
                      selectedEl.fontSize ?? Math.max(28, Math.round(selectedEl.height * 0.58)),
                    fontFamily: selectedEl.fontFamily ?? 'math',
                    textAlign: selectedEl.textAlign ?? 'center',
                    color: selectedEl.color,
                  });
                  onSelectId(null);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-sky-300 hover:bg-white/10 min-h-[36px]"
                title="Edit text"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
            {(selectedEl.kind === 'image' || selectedEl.kind === 'math') && (
              <button
                onClick={() => {
                  onCommitElements(
                    page.elements.map((el) =>
                      el.id === selectedEl.id && (el.kind === 'image' || el.kind === 'math')
                        ? { ...el, rotation: (el.rotation + 45) % 360 }
                        : el
                    ),
                    true
                  );
                }}
                className="p-1.5 rounded-lg text-slate-200 hover:bg-white/10 min-h-[36px] min-w-[36px] flex items-center justify-center"
                title="Rotate 45°"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => {
                onCommitElements(
                  page.elements.filter((el) => el.id !== selectedEl.id),
                  true
                );
                onSelectId(null);
              }}
              className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Delete selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tap-to-Type Live Text Overlay */}
        {textEditor && (() => {
          const boxWidth = Math.min(displayW - 16, Math.max(240, displayW * 0.72));
          const leftPx = Math.min(
            Math.max(8, displayW - boxWidth - 8),
            Math.max(8, (textEditor.x / BOARD_WIDTH) * displayW)
          );
          const topPx = Math.min(
            Math.max(54, displayH - 180),
            Math.max(54, (textEditor.y / BOARD_HEIGHT) * displayH)
          );
          const fontPx = Math.max(13, textEditor.fontSize * effectiveScale);
          const isLight = page.background === 'white';
          const lineCount = Math.max(1, textEditor.content.split('\n').length);

          return (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-30"
              style={{ left: leftPx, top: topPx, width: boxWidth }}
            >
              {/* Compact Formatting & Done Bar */}
              <div className="mb-1.5 flex items-center justify-between gap-1 rounded-xl bg-[#14191F]/95 border border-sky-400/50 px-2 py-1 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setTextEditor((prev) =>
                        prev ? { ...prev, fontSize: Math.max(20, prev.fontSize - 6) } : null
                      )
                    }
                    className="min-w-[30px] min-h-[30px] rounded-lg bg-white/5 hover:bg-white/15 text-xs font-bold text-slate-200"
                    title="Smaller text"
                  >
                    A-
                  </button>
                  <span className="text-[11px] font-mono-tabular text-sky-300 px-1">
                    {textEditor.fontSize}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setTextEditor((prev) =>
                        prev ? { ...prev, fontSize: Math.min(120, prev.fontSize + 6) } : null
                      )
                    }
                    className="min-w-[30px] min-h-[30px] rounded-lg bg-white/5 hover:bg-white/15 text-xs font-bold text-slate-200"
                    title="Larger text"
                  >
                    A+
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTextEditor((prev) =>
                        prev
                          ? { ...prev, fontFamily: prev.fontFamily === 'sans' ? 'math' : 'sans' }
                          : null
                      )
                    }
                    className="px-2 min-h-[30px] rounded-lg bg-white/5 hover:bg-white/15 text-[11px] font-medium text-slate-200"
                    title="Toggle font style"
                  >
                    {textEditor.fontFamily === 'sans' ? 'Sans' : 'Serif'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTextEditor((prev) =>
                        prev
                          ? { ...prev, textAlign: prev.textAlign === 'left' ? 'center' : 'left' }
                          : null
                      )
                    }
                    className="min-w-[30px] min-h-[30px] rounded-lg bg-white/5 hover:bg-white/15 text-slate-200 flex items-center justify-center"
                    title="Toggle alignment"
                  >
                    {textEditor.textAlign === 'left' ? (
                      <AlignLeft className="w-3.5 h-3.5" />
                    ) : (
                      <AlignCenter className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTextEditor(null)}
                    className="min-w-[30px] min-h-[30px] rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => commitTextEditor(textEditor)}
                    className="px-2.5 min-h-[30px] rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center gap-1"
                    title="Place text on board"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </button>
                </div>
              </div>

              <textarea
                ref={textAreaRef}
                value={textEditor.content}
                onChange={(e) =>
                  setTextEditor((prev) => (prev ? { ...prev, content: e.target.value } : null))
                }
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    commitTextEditor(textEditor);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setTextEditor(null);
                  }
                }}
                rows={Math.min(6, Math.max(2, lineCount))}
                placeholder="Type text here..."
                className={`w-full rounded-xl border-2 border-dashed border-sky-400 px-2.5 py-1.5 outline-none resize-none font-semibold ${
                  isLight
                    ? 'bg-white/80 placeholder:text-slate-400'
                    : 'bg-black/45 placeholder:text-slate-400/80'
                }`}
                style={{
                  fontSize: `${fontPx}px`,
                  lineHeight: 1.32,
                  color: textEditor.color,
                  textAlign: textEditor.textAlign,
                  fontFamily:
                    textEditor.fontFamily === 'sans'
                      ? '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
                      : '"Lora", Georgia, serif',
                }}
              />
            </div>
          );
        })()}

        {tool === 'text' && !textEditor && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-[#14191F]/85 border border-white/15 px-3 py-1 text-[11px] font-medium text-sky-300 shadow-md backdrop-blur-sm whitespace-nowrap">
            Tap anywhere on board to type
          </div>
        )}

        {/* Group Floating Action Pill for Area Select */}
        {tool === 'area-select' && multiSelectedIds.size > 0 && (() => {
          const items = activeElements.filter((el) => multiSelectedIds.has(el.id));
          if (items.length === 0) return null;
          let minX = Infinity, minY = Infinity;
          for (const it of items) {
            const b = getElementBounds(it);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
          }
          return (
            <div
              className="absolute z-20 flex items-center gap-1 rounded-xl bg-[#14191F]/95 border border-sky-400/40 px-2.5 py-1.5 shadow-xl backdrop-blur-md"
              style={{
                left: Math.min(displayW - 220, Math.max(8, (minX / BOARD_WIDTH) * displayW)),
                top: Math.max(8, (minY / BOARD_HEIGHT) * displayH - 54),
              }}
            >
              <span className="text-[11px] font-mono-tabular text-sky-300 px-1.5">
                {items.length} selected
              </span>
              <button
                onClick={() => {
                  const clones: BoardElement[] = [];
                  const nextIds = new Set<string>();
                  for (const item of items) {
                    const copy = structuredClone(item);
                    copy.id = createId(item.kind);
                    if (copy.kind === 'image' || copy.kind === 'math') {
                      copy.x += 36;
                      copy.y += 36;
                    } else if (copy.kind === 'shape') {
                      copy.x1 += 36; copy.y1 += 36; copy.x2 += 36; copy.y2 += 36;
                    } else if (copy.kind === 'stroke') {
                      copy.points = copy.points.map((p) => ({ ...p, x: p.x + 36, y: p.y + 36 }));
                    }
                    clones.push(copy);
                    nextIds.add(copy.id);
                  }
                  onCommitElements([...page.elements, ...clones], true);
                  setMultiSelectedIds(nextIds);
                }}
                className="p-1.5 rounded-lg text-slate-200 hover:bg-white/10 min-h-[34px] min-w-[34px] flex items-center justify-center"
                title="Duplicate selection"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  onCommitElements(
                    page.elements.filter((el) => !multiSelectedIds.has(el.id)),
                    true
                  );
                  setMultiSelectedIds(new Set());
                }}
                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 min-h-[34px] min-w-[34px] flex items-center justify-center"
                title="Delete selection"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setMultiSelectedIds(new Set())}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 min-h-[34px] min-w-[34px] flex items-center justify-center"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })()}
      </div>

      {/* Pinned Background Image Unpin Chip (shown quietly when page has pinned BG images and Select tool active) */}
      {tool === 'select' && pinnedImages.length > 0 && (
        <button
          onClick={() => {
            onCommitElements(
              page.elements.map((el) =>
                el.kind === 'image' && el.pinned ? { ...el, pinned: false } : el
              ),
              true
            );
          }}
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#14191F]/90 border border-white/15 text-xs font-medium text-amber-300 hover:bg-[#1C232B] shadow-lg backdrop-blur-md"
        >
          <Unlock className="w-3.5 h-3.5" />
          <span>Unpin {pinnedImages.length} BG {pinnedImages.length === 1 ? 'Image' : 'Images'}</span>
        </button>
      )}
    </div>
  );
};
