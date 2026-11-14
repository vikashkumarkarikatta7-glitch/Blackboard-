import React, { useState } from 'react';
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  MathNodeObject,
  ProtractorState,
  RulerState,
} from '../types/board';
import {
  compileMathExpression,
  MATH_DIAGRAMS,
  MATH_SYMBOL_CATEGORIES,
} from '../utils/mathParser';
import { createId } from '../utils/storage';
import { Compass, FileText, LineChart, Ruler, Shapes, Sigma, X } from 'lucide-react';

interface MathToolsSheetProps {
  activeColor: string;
  ruler: RulerState;
  protractor: ProtractorState;
  onToggleRuler: () => void;
  onToggleProtractor: () => void;
  onInsertMathNode: (node: MathNodeObject) => void;
  onClose: () => void;
}

type MathTab = 'symbols' | 'fraction' | 'graph' | 'proof' | 'geometry';

export const MathToolsSheet: React.FC<MathToolsSheetProps> = ({
  activeColor,
  ruler,
  protractor,
  onToggleRuler,
  onToggleProtractor,
  onInsertMathNode,
  onClose,
}) => {
  const [tab, setTab] = useState<MathTab>('symbols');
  const [symCategory, setSymCategory] = useState(0);
  const [symbolBuffer, setSymbolBuffer] = useState('');

  // Fraction builder
  const [whole, setWhole] = useState('');
  const [numerator, setNumerator] = useState('3');
  const [denominator, setDenominator] = useState('4');

  // Grapher
  const [expression, setExpression] = useState('x^2 - 2');
  const [xRange, setXRange] = useState(6);
  const [yRange, setYRange] = useState(6);
  const [graphError, setGraphError] = useState<string | null>(null);

  // Proof box
  const [proofText, setProofText] = useState(
    'Given: △ABC with ∠C = 90°\nProve: a² + b² = c²\nStep 1: Area = (a + b)²\n∴ c² = a² + b²  Q.E.D.'
  );

  const insertSymbol = (sym: string) => {
    onInsertMathNode({
      id: createId('math'),
      kind: 'math',
      mathType: 'text',
      x: BOARD_WIDTH / 2 - 120,
      y: BOARD_HEIGHT / 2 - 60,
      width: Math.max(140, sym.length * 46 + 40),
      height: 110,
      rotation: 0,
      color: activeColor,
      content: sym,
      fontSize: 64,
    });
    onClose();
  };

  const insertSymbolExpression = () => {
    if (!symbolBuffer.trim()) return;
    onInsertMathNode({
      id: createId('math'),
      kind: 'math',
      mathType: 'text',
      x: BOARD_WIDTH / 2 - 220,
      y: BOARD_HEIGHT / 2 - 60,
      width: Math.max(220, Math.min(840, symbolBuffer.length * 36 + 60)),
      height: 110,
      rotation: 0,
      color: activeColor,
      content: symbolBuffer.trim(),
      fontSize: 52,
    });
    onClose();
  };

  const insertFraction = () => {
    onInsertMathNode({
      id: createId('math'),
      kind: 'math',
      mathType: 'fraction',
      x: BOARD_WIDTH / 2 - 100,
      y: BOARD_HEIGHT / 2 - 90,
      width: whole.trim() ? 220 : 170,
      height: 170,
      rotation: 0,
      color: activeColor,
      content: `${whole ? whole + ' ' : ''}${numerator}/${denominator}`,
      whole: whole.trim(),
      numerator: numerator.trim() || '1',
      denominator: denominator.trim() || '2',
    });
    onClose();
  };

  const insertGraph = (withCurve: boolean) => {
    if (withCurve) {
      try {
        const fn = compileMathExpression(expression);
        fn(1);
        setGraphError(null);
      } catch (err) {
        setGraphError(err instanceof Error ? err.message : 'Invalid expression');
        return;
      }
    }
    onInsertMathNode({
      id: createId('math'),
      kind: 'math',
      mathType: withCurve ? 'graph' : 'axes',
      x: 110,
      y: BOARD_HEIGHT / 2 - 430,
      width: 860,
      height: 860,
      rotation: 0,
      color: activeColor,
      content: withCurve ? `y = ${expression}` : 'Coordinate Axes',
      expression: withCurve ? expression : undefined,
      xMin: -xRange,
      xMax: xRange,
      yMin: -yRange,
      yMax: yRange,
    });
    onClose();
  };

  const insertProof = () => {
    const lines = proofText.split('\n').filter((l) => l.length > 0);
    const height = Math.max(200, lines.length * 50 + 56);
    onInsertMathNode({
      id: createId('math'),
      kind: 'math',
      mathType: 'proof',
      x: 100,
      y: 340,
      width: 880,
      height,
      rotation: 0,
      color: activeColor,
      content: proofText,
      fontSize: 30,
    });
    onClose();
  };

  const insertDiagram = (diagramId: string, title: string) => {
    onInsertMathNode({
      id: createId('math'),
      kind: 'math',
      mathType: 'diagram',
      diagramId,
      x: 140,
      y: BOARD_HEIGHT / 2 - 320,
      width: 800,
      height: 640,
      rotation: 0,
      color: activeColor,
      content: title,
    });
    onClose();
  };

  const tabs: { id: MathTab; label: string; icon: React.ReactNode }[] = [
    { id: 'symbols', label: 'Symbols', icon: <Sigma className="w-4 h-4" /> },
    { id: 'fraction', label: 'Fraction', icon: <span className="font-math text-sm font-bold">a/b</span> },
    { id: 'graph', label: 'Graph', icon: <LineChart className="w-4 h-4" /> },
    { id: 'proof', label: 'Proof', icon: <FileText className="w-4 h-4" /> },
    { id: 'geometry', label: 'Geo', icon: <Shapes className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg max-h-[84vh] rounded-t-3xl sm:rounded-2xl bg-[#14191F] border-t sm:border border-white/15 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-slate-100">Mathematics Teaching Tools</h2>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-1 p-2 bg-[#0E1217] border-b border-white/10">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'symbols' && (
            <>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {MATH_SYMBOL_CATEGORIES.map((cat, idx) => (
                  <button
                    key={cat.label}
                    onClick={() => setSymCategory(idx)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 min-h-[38px] ${
                      symCategory === idx
                        ? 'bg-white text-slate-950'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={symbolBuffer}
                  onChange={(e) => setSymbolBuffer(e.target.value)}
                  placeholder="Build expression (tap symbols below)..."
                  className="flex-1 rounded-xl bg-[#0B0E11] border border-white/10 px-3 py-2.5 text-sm font-math text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
                <button
                  onClick={insertSymbolExpression}
                  disabled={!symbolBuffer.trim()}
                  className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-semibold disabled:opacity-40 min-h-[44px] whitespace-nowrap"
                >
                  Place Text
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {MATH_SYMBOL_CATEGORIES[symCategory].symbols.map((sym) => (
                  <button
                    key={sym}
                    onClick={() => {
                      if (symbolBuffer.length > 0) {
                        setSymbolBuffer((prev) => prev + sym);
                      } else {
                        insertSymbol(sym);
                      }
                    }}
                    className="min-h-[48px] rounded-xl bg-[#0B0E11] border border-white/10 hover:border-sky-400/50 hover:bg-sky-500/10 text-lg font-math text-slate-100 flex items-center justify-center transition-colors"
                    title="Tap to place on board (or append to expression)"
                  >
                    {sym}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Tap any symbol to place it directly on the board, or type in the expression box to combine multiple symbols.
              </p>
            </>
          )}

          {tab === 'fraction' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Whole (optional)</label>
                  <input
                    type="text"
                    value={whole}
                    onChange={(e) => setWhole(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full rounded-xl bg-[#0B0E11] border border-white/10 px-3 py-2.5 text-center font-math text-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Numerator</label>
                  <input
                    type="text"
                    value={numerator}
                    onChange={(e) => setNumerator(e.target.value)}
                    placeholder="x + 1"
                    className="w-full rounded-xl bg-[#0B0E11] border border-white/10 px-3 py-2.5 text-center font-math text-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Denominator</label>
                  <input
                    type="text"
                    value={denominator}
                    onChange={(e) => setDenominator(e.target.value)}
                    placeholder="2"
                    className="w-full rounded-xl bg-[#0B0E11] border border-white/10 px-3 py-2.5 text-center font-math text-lg text-slate-100"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-[#0B0E11] border border-white/10 py-6 flex items-center justify-center gap-3 font-math text-slate-100">
                {whole && <span className="text-3xl font-semibold">{whole}</span>}
                <div className="flex flex-col items-center">
                  <span className="text-2xl px-3 pb-1 border-b-2 border-slate-200">{numerator || 'a'}</span>
                  <span className="text-2xl px-3 pt-1">{denominator || 'b'}</span>
                </div>
              </div>

              <button
                onClick={insertFraction}
                className="w-full min-h-[48px] rounded-xl bg-sky-500 text-slate-950 font-semibold text-sm hover:bg-sky-400"
              >
                Insert Stacked Fraction onto Board
              </button>
            </div>
          )}

          {tab === 'graph' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Function y = f(x)</label>
                <input
                  type="text"
                  value={expression}
                  onChange={(e) => {
                    setExpression(e.target.value);
                    setGraphError(null);
                  }}
                  placeholder="e.g. sin(x) or x^2 - 3"
                  className="w-full rounded-xl bg-[#0B0E11] border border-white/10 px-3 py-3 font-mono-tabular text-sm text-slate-100 focus:outline-none focus:border-sky-400"
                />
                {graphError && <p className="mt-1.5 text-xs text-rose-400">{graphError}</p>}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {['x^2 - 2', 'sin(x)*3', 'cos(x)*3', '2*x + 1', '1/x', 'sqrt(x+4)', 'abs(x)'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setExpression(preset);
                      setGraphError(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono-tabular text-slate-300 min-h-[36px]"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-mono-tabular">
                    X Range: ±{xRange}
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    value={xRange}
                    onChange={(e) => setXRange(Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-mono-tabular">
                    Y Range: ±{yRange}
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    value={yRange}
                    onChange={(e) => setYRange(Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => insertGraph(false)}
                  className="min-h-[48px] rounded-xl bg-white/10 text-slate-100 font-medium text-xs hover:bg-white/15"
                >
                  Stamp Axes Only
                </button>
                <button
                  onClick={() => insertGraph(true)}
                  className="min-h-[48px] rounded-xl bg-sky-500 text-slate-950 font-semibold text-xs hover:bg-sky-400"
                >
                  Plot Graph on Board
                </button>
              </div>
            </div>
          )}

          {tab === 'proof' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {['∴', '∵', '⇒', '⇔', '∠', '△', '⊥', '∥', '≅', 'π', 'θ', '²', '√'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setProofText((p) => p + s)}
                    className="min-w-[36px] min-h-[36px] rounded-lg bg-[#0B0E11] border border-white/10 text-sm font-math text-slate-200 hover:border-sky-400/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                rows={5}
                value={proofText}
                onChange={(e) => setProofText(e.target.value)}
                className="w-full rounded-xl bg-[#0B0E11] border border-white/10 p-3 font-math text-sm text-slate-100 leading-relaxed focus:outline-none focus:border-sky-400"
              />
              <button
                onClick={insertProof}
                className="w-full min-h-[48px] rounded-xl bg-sky-500 text-slate-950 font-semibold text-sm hover:bg-sky-400"
              >
                Place Proof Block on Board
              </button>
            </div>
          )}

          {tab === 'geometry' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    onToggleRuler();
                    onClose();
                  }}
                  className={`min-h-[52px] flex items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors ${
                    ruler.visible
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                      : 'bg-[#0B0E11] border-white/10 text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Ruler className="w-4 h-4" />
                  <span>{ruler.visible ? 'Hide Ruler' : 'Show Ruler'}</span>
                </button>
                <button
                  onClick={() => {
                    onToggleProtractor();
                    onClose();
                  }}
                  className={`min-h-[52px] flex items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors ${
                    protractor.visible
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-[#0B0E11] border-white/10 text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>{protractor.visible ? 'Hide Protractor' : 'Show Protractor'}</span>
                </button>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">
                  Mathematical Diagrams (movable & drawable)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {MATH_DIAGRAMS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => insertDiagram(d.id, d.title)}
                      className="text-left p-3 rounded-xl bg-[#0B0E11] border border-white/10 hover:border-sky-400/50 hover:bg-sky-500/10 transition-colors min-h-[60px]"
                    >
                      <div className="text-xs font-semibold text-slate-100">{d.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{d.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
