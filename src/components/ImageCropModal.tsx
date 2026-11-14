import React, { useEffect, useRef, useState } from 'react';
import { BoardImageObject } from '../types/board';
import { Check, X } from 'lucide-react';

interface ImageCropModalProps {
  image: BoardImageObject;
  onCancel: () => void;
  onApply: (croppedDataUrl: string, newWidth: number, newHeight: number) => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({ image, onCancel, onApply }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Crop normalized 0..1
  const [crop, setCrop] = useState({ x: 0.08, y: 0.08, w: 0.84, h: 0.84 });
  const dragRef = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | null;
    startX: number;
    startY: number;
    orig: typeof crop;
  }>({ mode: null, startX: 0, startY: 0, orig: crop });

  const startDrag = (e: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...crop } };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.mode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    const o = d.orig;
    const min = 0.12;

    if (d.mode === 'move') {
      setCrop({
        ...o,
        x: Math.max(0, Math.min(1 - o.w, o.x + dx)),
        y: Math.max(0, Math.min(1 - o.h, o.y + dy)),
      });
    } else if (d.mode === 'nw') {
      const nx = Math.max(0, Math.min(o.x + o.w - min, o.x + dx));
      const ny = Math.max(0, Math.min(o.y + o.h - min, o.y + dy));
      setCrop({ x: nx, y: ny, w: o.x + o.w - nx, h: o.y + o.h - ny });
    } else if (d.mode === 'ne') {
      const ny = Math.max(0, Math.min(o.y + o.h - min, o.y + dy));
      const nw = Math.max(min, Math.min(1 - o.x, o.w + dx));
      setCrop({ x: o.x, y: ny, w: nw, h: o.y + o.h - ny });
    } else if (d.mode === 'sw') {
      const nx = Math.max(0, Math.min(o.x + o.w - min, o.x + dx));
      const nh = Math.max(min, Math.min(1 - o.y, o.h + dy));
      setCrop({ x: nx, y: o.y, w: o.x + o.w - nx, h: nh });
    } else if (d.mode === 'se') {
      const nw = Math.max(min, Math.min(1 - o.x, o.w + dx));
      const nh = Math.max(min, Math.min(1 - o.y, o.h + dy));
      setCrop({ ...o, w: nw, h: nh });
    }
  };

  const endDrag = () => {
    dragRef.current.mode = null;
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleApply = () => {
    const img = new Image();
    img.onload = () => {
      const sx = Math.round(crop.x * img.naturalWidth);
      const sy = Math.round(crop.y * img.naturalHeight);
      const sw = Math.max(16, Math.round(crop.w * img.naturalWidth));
      const sh = Math.max(16, Math.round(crop.h * img.naturalHeight));

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const nextUrl = canvas.toDataURL('image/png');
      onApply(nextUrl, Math.round(image.width * crop.w), Math.round(image.height * crop.h));
    };
    img.src = image.src;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#14191F] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-slate-100">Crop Image</h3>
          <button
            onClick={onCancel}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex items-center justify-center bg-[#0B0E11]">
          <div
            ref={containerRef}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            className="relative inline-block max-h-[55vh] overflow-hidden select-none touch-none"
          >
            <img
              src={image.src}
              alt="Crop preview"
              referrerPolicy="no-referrer"
              className="max-h-[55vh] w-auto block pointer-events-none"
            />
            <div className="absolute inset-0 bg-black/50 pointer-events-none" />
            <div
              onPointerDown={(e) => startDrag(e, 'move')}
              className="absolute border-2 border-sky-400 bg-transparent cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
              }}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <div
                  key={corner}
                  onPointerDown={(e) => startDrag(e, corner)}
                  className="absolute w-6 h-6 -m-3 flex items-center justify-center"
                  style={{
                    left: corner.includes('w') ? 0 : '100%',
                    top: corner.includes('n') ? 0 : '100%',
                  }}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-sky-400 border-2 border-[#0B0E11]" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10">
          <button
            onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}
            className="px-3 py-2 text-xs font-medium rounded-lg text-slate-300 hover:bg-white/10 min-h-[44px]"
          >
            Reset Full
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 min-h-[44px]"
            >
              <Check className="w-4 h-4" />
              <span>Apply Crop</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
