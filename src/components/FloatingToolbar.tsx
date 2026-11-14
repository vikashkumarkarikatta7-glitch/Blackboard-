import React, { useState } from 'react';
import { CHALK_PALETTE, ToolType } from '../types/board';
import {
  ArrowUpRight,
  Circle,
  Crosshair,
  Eraser,
  FileUp,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  Palette,
  Pen,
  Pencil,
  Shapes,
  Sigma,
  SlidersHorizontal,
  Spline,
  Square,
  Trash2,
  Triangle,
  Type,
  RectangleHorizontal,
} from 'lucide-react';

interface FloatingToolbarProps {
  tool: ToolType;
  onSelectTool: (t: ToolType) => void;
  color: string;
  onSelectColor: (hex: string) => void;
  strokeSize: number;
  onChangeStrokeSize: (s: number) => void;
  eraserSize: number;
  onChangeEraserSize: (s: number) => void;
  stylusOnly: boolean;
  onToggleStylusOnly: () => void;
  onOpenMath: () => void;
  onPickPhoto: () => void;
  onPickPdf: () => void;
  onClearBoard: () => void;
}

type PopoverKind = 'none' | 'shapes' | 'color' | 'media';

const SHAPE_LIST: { id: ToolType; label: string; icon: React.ReactNode }[] = [
  { id: 'line', label: 'Line', icon: <Minus className="w-4 h-4 -rotate-45" /> },
  { id: 'arrow', label: 'Arrow', icon: <ArrowUpRight className="w-4 h-4" /> },
  { id: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" /> },
  { id: 'rectangle', label: 'Rect', icon: <RectangleHorizontal className="w-4 h-4" /> },
  { id: 'square', label: 'Square', icon: <Square className="w-4 h-4" /> },
  { id: 'triangle', label: 'Triangle', icon: <Triangle className="w-4 h-4" /> },
  { id: 'freehand-shape', label: 'Freehand', icon: <Spline className="w-4 h-4" /> },
];

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  tool,
  onSelectTool,
  color,
  onSelectColor,
  strokeSize,
  onChangeStrokeSize,
  eraserSize,
  onChangeEraserSize,
  stylusOnly,
  onToggleStylusOnly,
  onOpenMath,
  onPickPhoto,
  onPickPdf,
  onClearBoard,
}) => {
  const [popover, setPopover] = useState<PopoverKind>('none');
  const [confirmClear, setConfirmClear] = useState(false);

  const isShapeActive = SHAPE_LIST.some((s) => s.id === tool);

  const togglePopover = (kind: PopoverKind) => {
    setConfirmClear(false);
    setPopover((prev) => (prev === kind ? 'none' : kind));
  };

  return (
    <div className="relative z-30 shrink-0 bg-[#14191F]/95 border-t border-white/10 backdrop-blur-md pb-safe">
      {/* Expandable Floating Popover Anchored Above Toolbar (never covers canvas permanently) */}
      {popover !== 'none' && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[calc(100vw-16px)] max-w-md rounded-2xl bg-[#14191F] border border-white/15 p-3 shadow-2xl">
          {popover === 'shapes' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-slate-400">Geometry &amp; Shapes</span>
                <button
                  onClick={() => setPopover('none')}
                  className="text-xs text-sky-400 px-2 py-1"
                >
                  Done
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SHAPE_LIST.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onSelectTool(s.id);
                      setPopover('none');
                    }}
                    className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                      tool === s.id
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'bg-[#0B0E11] text-slate-200 border border-white/10 hover:bg-white/5'
                    }`}
                  >
                    {s.icon}
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {popover === 'color' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-slate-400">Chalk Color &amp; Size</span>
                <button
                  onClick={() => setPopover('none')}
                  className="text-xs text-sky-400 px-2 py-1"
                >
                  Done
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {CHALK_PALETTE.map((swatch) => (
                  <button
                    key={swatch.hex}
                    onClick={() => onSelectColor(swatch.hex)}
                    title={swatch.name}
                    className={`w-10 h-10 rounded-full border-2 transition-transform ${
                      color.toLowerCase() === swatch.hex.toLowerCase()
                        ? 'border-sky-400 scale-110'
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                ))}
                <label
                  title="Custom Color Picker"
                  className="w-10 h-10 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center cursor-pointer overflow-hidden relative bg-gradient-to-tr from-rose-500 via-amber-400 to-sky-400"
                >
                  <Palette className="w-4 h-4 text-slate-950" />
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => onSelectColor(e.target.value)}
                    className="opacity-0 absolute inset-0 cursor-pointer"
                  />
                </label>
              </div>

              <div className="space-y-2 pt-1 border-t border-white/10">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>{tool === 'eraser' ? 'Eraser Size' : 'Stroke Thickness'}</span>
                  <span className="font-mono-tabular text-sky-400">
                    {tool === 'eraser' ? `${eraserSize}px` : `${strokeSize}px`}
                  </span>
                </div>
                {tool === 'eraser' ? (
                  <input
                    type="range"
                    min={12}
                    max={90}
                    value={eraserSize}
                    onChange={(e) => onChangeEraserSize(Number(e.target.value))}
                    className="w-full accent-rose-400"
                  />
                ) : (
                  <input
                    type="range"
                    min={2}
                    max={36}
                    value={strokeSize}
                    onChange={(e) => onChangeStrokeSize(Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                )}
              </div>

              <label className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-slate-200 cursor-pointer">
                <span>Stylus-Only Mode (Palm Rejection)</span>
                <input
                  type="checkbox"
                  checked={stylusOnly}
                  onChange={onToggleStylusOnly}
                  className="w-4 h-4 accent-sky-400 rounded"
                />
              </label>
            </div>
          )}

          {popover === 'media' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-slate-400">Import Photo or PDF</span>
                <button
                  onClick={() => setPopover('none')}
                  className="text-xs text-sky-400 px-2 py-1"
                >
                  Done
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    setPopover('none');
                    onPickPhoto();
                  }}
                  className="min-h-[52px] rounded-xl bg-[#0B0E11] border border-white/10 hover:border-sky-400/60 flex items-center justify-center gap-2 text-xs font-medium text-slate-100"
                >
                  <ImagePlus className="w-4 h-4 text-sky-400" />
                  <span>Add Photo</span>
                </button>
                <button
                  onClick={() => {
                    setPopover('none');
                    onPickPdf();
                  }}
                  className="min-h-[52px] rounded-xl bg-[#0B0E11] border border-white/10 hover:border-amber-400/60 flex items-center justify-center gap-2 text-xs font-medium text-slate-100"
                >
                  <FileUp className="w-4 h-4 text-amber-400" />
                  <span>Import PDF</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary Horizontal Touch Dock */}
      <div className="flex items-center justify-start sm:justify-center gap-1 px-2 py-1.5 overflow-x-auto no-scrollbar">
        <ToolButton
          active={tool === 'select'}
          onClick={() => {
            setPopover('none');
            onSelectTool('select');
          }}
          icon={<MousePointer2 className="w-4 h-4" />}
          label="Select"
        />
        <ToolButton
          active={tool === 'area-select'}
          onClick={() => {
            setPopover('none');
            onSelectTool('area-select');
          }}
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3a2 2 0 0 0-2 2" />
              <path d="M9 3h2" />
              <path d="M15 3h2" />
              <path d="M19 3a2 2 0 0 1 2 2" />
              <path d="M21 9v2" />
              <path d="M3 9v2" />
              <path d="M3 15v2" />
              <path d="M3 19a2 2 0 0 0 2 2" />
              <path d="M9 21h2" />
              <path d="M14 14l7 3-3 1-1 3-3-7z" fill="currentColor" stroke="none" />
            </svg>
          }
          label="Area"
        />
        <ToolButton
          active={tool === 'pen'}
          onClick={() => {
            setPopover('none');
            onSelectTool('pen');
          }}
          icon={<Pen className="w-4 h-4" />}
          label="Pen"
        />
        <ToolButton
          active={tool === 'pencil'}
          onClick={() => {
            setPopover('none');
            onSelectTool('pencil');
          }}
          icon={<Pencil className="w-4 h-4" />}
          label="Pencil"
        />
        <ToolButton
          active={tool === 'highlighter'}
          onClick={() => {
            setPopover('none');
            onSelectTool('highlighter');
          }}
          icon={<Highlighter className="w-4 h-4" />}
          label="Marker"
        />
        <ToolButton
          active={tool === 'text'}
          onClick={() => {
            setPopover('none');
            onSelectTool('text');
          }}
          icon={<Type className="w-4 h-4" />}
          label="Text"
        />
        <ToolButton
          active={tool === 'laser'}
          danger={tool === 'laser'}
          onClick={() => {
            setPopover('none');
            onSelectTool('laser');
          }}
          icon={<Crosshair className="w-4 h-4" />}
          label="Laser"
        />
        <ToolButton
          active={tool === 'eraser'}
          onClick={() => {
            setPopover('none');
            onSelectTool('eraser');
          }}
          icon={<Eraser className="w-4 h-4" />}
          label="Eraser"
          danger={tool === 'eraser'}
        />
        <ToolButton
          active={isShapeActive || popover === 'shapes'}
          onClick={() => togglePopover('shapes')}
          icon={<Shapes className="w-4 h-4" />}
          label="Shapes"
        />

        {/* Color & Size Swatch Trigger */}
        <button
          onClick={() => togglePopover('color')}
          className={`min-h-[44px] min-w-[48px] px-2.5 rounded-xl flex flex-col items-center justify-center gap-0.5 shrink-0 transition-colors ${
            popover === 'color'
              ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/50'
              : 'text-slate-300 hover:bg-white/5'
          }`}
          title="Colors & Pen Size"
        >
          <div className="flex items-center gap-1">
            <span
              className="w-4 h-4 rounded-full border border-white/40"
              style={{ backgroundColor: color }}
            />
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
          </div>
          <span className="text-[10px] font-medium font-mono-tabular whitespace-nowrap">
            {tool === 'eraser' ? `${eraserSize}px` : `${strokeSize}px`}
          </span>
        </button>

        <ToolButton
          active={false}
          onClick={() => {
            setPopover('none');
            onOpenMath();
          }}
          icon={<Sigma className="w-4 h-4" />}
          label="Math"
        />

        <ToolButton
          active={popover === 'media'}
          onClick={() => togglePopover('media')}
          icon={<ImagePlus className="w-4 h-4" />}
          label="Media"
        />

        {confirmClear ? (
          <button
            onClick={() => {
              onClearBoard();
              setConfirmClear(false);
            }}
            onBlur={() => setConfirmClear(false)}
            className="min-h-[44px] px-3 rounded-xl bg-rose-500 text-white text-[11px] font-semibold shrink-0 whitespace-nowrap"
          >
            Confirm Clear
          </button>
        ) : (
          <ToolButton
            active={false}
            onClick={() => setConfirmClear(true)}
            icon={<Trash2 className="w-4 h-4 text-rose-400" />}
            label="Clear"
          />
        )}
      </div>
    </div>
  );
};

interface ToolButtonProps {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({ active, danger, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`min-h-[44px] min-w-[46px] px-2 rounded-xl flex flex-col items-center justify-center gap-0.5 shrink-0 transition-colors ${
      active
        ? danger
          ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/50'
          : 'bg-sky-500 text-slate-950 font-semibold'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`}
  >
    {icon}
    <span className="text-[10px] font-medium leading-none whitespace-nowrap">{label}</span>
  </button>
);
