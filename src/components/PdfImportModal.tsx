import React, { useState } from 'react';
import { RenderedPdfPage } from '../utils/pdfTools';
import { FileCheck2, Layers, X } from 'lucide-react';

interface PdfImportModalProps {
  fileName: string;
  pages: RenderedPdfPage[];
  onInsertSinglePage: (page: RenderedPdfPage, pinToBackground: boolean) => void;
  onImportAllAsBoardPages: (pages: RenderedPdfPage[], pinToBackground: boolean) => void;
  onClose: () => void;
}

export const PdfImportModal: React.FC<PdfImportModalProps> = ({
  fileName,
  pages,
  onInsertSinglePage,
  onImportAllAsBoardPages,
  onClose,
}) => {
  const [pinBg, setPinBg] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full sm:max-w-xl max-h-[85vh] rounded-t-3xl sm:rounded-2xl bg-[#14191F] border-t sm:border border-white/15 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100 truncate">Import PDF: {fileName}</h2>
            <p className="text-xs text-slate-400 font-mono-tabular">{pages.length} pages ready offline</p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 bg-[#0E1217] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={pinBg}
              onChange={(e) => setPinBg(e.target.checked)}
              className="w-4 h-4 accent-sky-400 rounded"
            />
            <span>Pin imported PDF in background (write over directly)</span>
          </label>
          <button
            onClick={() => onImportAllAsBoardPages(pages, pinBg)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-semibold hover:bg-sky-400 min-h-[40px]"
          >
            <Layers className="w-4 h-4" />
            <span>Import All {pages.length} Pages</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {pages.map((p) => (
            <button
              key={p.pageNumber}
              onClick={() => onInsertSinglePage(p, pinBg)}
              className="group rounded-xl bg-[#0B0E11] border border-white/10 hover:border-sky-400 p-2 flex flex-col gap-2 text-left transition-colors"
            >
              <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-white flex items-center justify-center">
                <img
                  src={p.dataUrl}
                  alt={`PDF Page ${p.pageNumber}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-mono-tabular">Page {p.pageNumber}</span>
                <span className="text-sky-400 flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Add
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
