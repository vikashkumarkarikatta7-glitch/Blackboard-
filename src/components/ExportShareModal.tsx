import React, { useState } from 'react';
import { BoardNotebook, BoardPage } from '../types/board';
import { exportNotebookAsPdf, exportPageAsPng, sharePageImage } from '../utils/pdfTools';
import { downloadAndroidStudioSourceZip } from '../utils/androidProjectZip';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  ImageDown,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';

interface ExportShareModalProps {
  notebook: BoardNotebook;
  currentPage: BoardPage;
  onClose: () => void;
}

export const ExportShareModal: React.FC<ExportShareModalProps> = ({
  notebook,
  currentPage,
  onClose,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setFeedback(null);
    try {
      await fn();
      setFeedback(`${label} complete`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#14191F] border-t sm:border border-white/15 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-slate-100">Export, Share &amp; Android Build</h2>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5">
          <button
            disabled={!!busy}
            onClick={() =>
              runAction('PNG Export', () => exportPageAsPng(currentPage, notebook.name))
            }
            className="w-full min-h-[52px] px-4 rounded-xl bg-[#0B0E11] border border-white/10 hover:border-sky-400/50 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <ImageDown className="w-5 h-5 text-sky-400" />
              <div>
                <div className="text-xs font-semibold text-slate-100">Export Current Page as PNG</div>
                <div className="text-[11px] text-slate-400">High-resolution 9:16 board image</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </button>

          <button
            disabled={!!busy}
            onClick={() =>
              runAction('PDF Export', () => exportNotebookAsPdf(notebook))
            }
            className="w-full min-h-[52px] px-4 rounded-xl bg-[#0B0E11] border border-white/10 hover:border-amber-400/50 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-xs font-semibold text-slate-100">
                  Export All {notebook.pages.length} Pages as PDF
                </div>
                <div className="text-[11px] text-slate-400">Offline multi-page portrait PDF</div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </button>

          <button
            disabled={!!busy}
            onClick={() =>
              runAction('Share', async () => {
                await sharePageImage(currentPage, notebook.name);
              })
            }
            className="w-full min-h-[52px] px-4 rounded-xl bg-[#0B0E11] border border-white/10 hover:border-emerald-400/50 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <Share2 className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="text-xs font-semibold text-slate-100">Share Notes &amp; Screenshot</div>
                <div className="text-[11px] text-slate-400">Uses device share sheet or saves PNG</div>
              </div>
            </div>
            <Share2 className="w-4 h-4 text-slate-400" />
          </button>

          {/* PWA Offline App Installation */}
          {!isInstalled && isInstallable && (
            <button
              onClick={install}
              className="w-full min-h-[52px] px-4 rounded-xl bg-sky-500 text-slate-950 font-semibold flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5" />
                <div className="text-left">
                  <div className="text-xs font-bold">Install Offline Android / Mobile App</div>
                  <div className="text-[11px] text-slate-900/80">
                    Adds standalone 9:16 app icon, works 100% offline
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4" />
            </button>
          )}

          {!isInstalled && isIOS && (
            <div className="rounded-xl bg-[#0B0E11] border border-white/10 p-3 text-xs text-slate-300">
              Install offline on iOS: tap <strong>Share</strong> in Safari, then choose{' '}
              <strong>Add to Home Screen</strong>.
            </div>
          )}

          {!isInstalled && !isInstallable && !isIOS && (
            <div className="rounded-xl bg-sky-500/10 border border-sky-400/35 p-3 space-y-2.5">
              <div>
                <div className="text-xs font-semibold text-sky-300">
                  Install App on Your Android Phone (100% Offline)
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  1. Open this app directly in Chrome (not inside preview frame).<br />
                  2. Tap <strong>Install</strong> in the top bar or Chrome <strong>⋮ → Install app</strong>.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={typeof window !== 'undefined' ? window.location.origin : '/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[40px] px-3 rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Standalone in Chrome</span>
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.origin);
                      setFeedback('App link copied — paste in Chrome to install');
                    } catch {
                      setFeedback('Open in Chrome and tap Install');
                    }
                  }}
                  className="shrink-0 min-h-[40px] px-3 rounded-lg bg-white/10 text-slate-100 hover:bg-white/15 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>
          )}

          {/* Complete Android Studio Kotlin Source Project Zip */}
          <div className="pt-2 border-t border-white/10">
            <button
              disabled={!!busy}
              onClick={() =>
                runAction('Android Studio Source Zip', downloadAndroidStudioSourceZip)
              }
              className="w-full min-h-[52px] px-4 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <FileCode2 className="w-5 h-5 text-purple-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Download Android Studio Kotlin Project (.zip)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Full Kotlin source, Gradle config &amp; APK signing guide
                  </div>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {feedback && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 pt-1">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
