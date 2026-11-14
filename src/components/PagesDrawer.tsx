import React, { useState } from 'react';
import {
  BOARD_BACKGROUNDS,
  BoardBackground,
  BoardNotebook,
  BoardPage,
  PaperPattern,
} from '../types/board';
import { Copy, FilePlus2, FolderPlus, Layers, Trash2, X } from 'lucide-react';

interface PagesDrawerProps {
  notebook: BoardNotebook;
  allNotebooks: BoardNotebook[];
  currentPage: BoardPage;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onChangeBackground: (bg: BoardBackground) => void;
  onChangePaper: (paper: PaperPattern) => void;
  onSwitchNotebook: (nbId: string) => void;
  onCreateNotebook: (name: string) => void;
  onRenameNotebook: (name: string) => void;
  onDeleteNotebook: (nbId: string) => void;
  onClose: () => void;
}

const PAPER_OPTIONS: { id: PaperPattern; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'grid', label: 'Grid' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'ruled', label: 'Ruled' },
  { id: 'axes', label: 'Axes' },
];

export const PagesDrawer: React.FC<PagesDrawerProps> = ({
  notebook,
  allNotebooks,
  currentPage,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onChangeBackground,
  onChangePaper,
  onSwitchNotebook,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onClose,
}) => {
  const [newNbName, setNewNbName] = useState('');
  const [editingTitle, setEditingTitle] = useState(notebook.name);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="w-full sm:max-w-xl max-h-[86vh] rounded-t-3xl sm:rounded-2xl bg-[#14191F] border-t sm:border border-white/15 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">Boards &amp; Page Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Current Page Surface & Paper Settings */}
          <section className="space-y-3">
            <div className="text-xs font-medium text-slate-400">
              Current Page Surface ({currentPage.title})
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(BOARD_BACKGROUNDS) as BoardBackground[]).map((bgKey) => {
                const info = BOARD_BACKGROUNDS[bgKey];
                const active = currentPage.background === bgKey;
                return (
                  <button
                    key={bgKey}
                    onClick={() => onChangeBackground(bgKey)}
                    className={`min-h-[46px] rounded-xl border flex items-center justify-center gap-2 text-xs font-medium transition-all ${
                      active
                        ? 'border-sky-400 ring-1 ring-sky-400/50 text-sky-300 bg-sky-500/10'
                        : 'border-white/10 text-slate-300 bg-[#0B0E11] hover:border-white/25'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/25 shrink-0"
                      style={{ backgroundColor: info.bg }}
                    />
                    <span>{info.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {PAPER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onChangePaper(opt.id)}
                  className={`min-h-[42px] rounded-xl text-xs font-medium transition-colors ${
                    currentPage.paper === opt.id
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'bg-[#0B0E11] text-slate-300 border border-white/10 hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* Pages Grid */}
          <section className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">
                Pages ({notebook.pages.length})
              </span>
              <button
                onClick={onAddPage}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-semibold hover:bg-sky-400 min-h-[40px]"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Add New Page</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {notebook.pages.map((p, idx) => {
                const isCurrent = p.id === notebook.currentPageId;
                const bgInfo = BOARD_BACKGROUNDS[p.background];
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-2.5 flex flex-col gap-2 transition-all ${
                      isCurrent
                        ? 'border-sky-400 bg-sky-500/10'
                        : 'border-white/10 bg-[#0B0E11] hover:border-white/25'
                    }`}
                  >
                    <button
                      onClick={() => {
                        onSelectPage(p.id);
                        onClose();
                      }}
                      className="w-full text-left flex items-center gap-2.5"
                    >
                      <div
                        className="w-9 h-16 rounded-md border border-white/20 shrink-0 flex items-center justify-center font-mono-tabular text-[10px]"
                        style={{
                          backgroundColor: bgInfo.bg,
                          color: bgInfo.defaultInk,
                        }}
                      >
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {p.title}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono-tabular">
                          {p.elements.length} items · {p.paper}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-white/5">
                      <button
                        onClick={() => onDuplicatePage(p.id)}
                        className="p-2 rounded-lg text-slate-300 hover:bg-white/10 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Duplicate page"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {notebook.pages.length > 1 && (
                        <button
                          onClick={() => onDeletePage(p.id)}
                          className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15 min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Delete page"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Local Notebooks */}
          <section className="space-y-3 pt-2 border-t border-white/10">
            <div className="text-xs font-medium text-slate-400">
              Offline Local Notebooks (Auto-saved)
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => editingTitle.trim() && onRenameNotebook(editingTitle.trim())}
                className="flex-1 rounded-xl bg-[#0B0E11] border border-white/10 px-3 py-2 text-xs text-slate-100"
                placeholder="Current notebook name"
              />
              <button
                onClick={() => editingTitle.trim() && onRenameNotebook(editingTitle.trim())}
                className="px-3 py-2 rounded-xl bg-white/10 text-xs font-medium text-slate-200 hover:bg-white/15 min-h-[40px]"
              >
                Rename
              </button>
            </div>

            <div className="space-y-1.5">
              {allNotebooks.map((nb) => (
                <div
                  key={nb.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                    nb.id === notebook.id
                      ? 'border-sky-400/60 bg-sky-500/10'
                      : 'border-white/10 bg-[#0B0E11]'
                  }`}
                >
                  <button
                    onClick={() => {
                      onSwitchNotebook(nb.id);
                      setEditingTitle(nb.name);
                    }}
                    className="flex-1 text-left min-w-0 py-1"
                  >
                    <div className="text-xs font-semibold text-slate-100 truncate">{nb.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono-tabular">
                      {nb.pages.length} {nb.pages.length === 1 ? 'page' : 'pages'}
                    </div>
                  </button>
                  {allNotebooks.length > 1 && (
                    <button
                      onClick={() => onDeleteNotebook(nb.id)}
                      className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Delete notebook"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newNbName}
                onChange={(e) => setNewNbName(e.target.value)}
                placeholder="New notebook title..."
                className="flex-1 rounded-xl bg-[#0B0E11] border border-white/10 px-3 py-2 text-xs text-slate-100"
              />
              <button
                onClick={() => {
                  if (!newNbName.trim()) return;
                  onCreateNotebook(newNbName.trim());
                  setNewNbName('');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-xs font-medium text-slate-100 hover:bg-white/15 min-h-[42px]"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Create</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
