import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOARD_BACKGROUNDS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BoardBackground,
  BoardElement,
  BoardImageObject,
  BoardNotebook,
  BoardPage,
  MathNodeObject,
  PaperPattern,
  ProtractorState,
  RulerState,
  ToolType,
} from './types/board';
import {
  createDefaultNotebook,
  createDefaultPage,
  createId,
  deleteNotebookLocal,
  loadAllNotebooksLocal,
  saveNotebookLocal,
} from './utils/storage';
import { fitImageToBoard, RenderedPdfPage, renderPdfFileToImages } from './utils/pdfTools';
import { BlackboardCanvas } from './components/BlackboardCanvas';
import { FloatingToolbar } from './components/FloatingToolbar';
import { MathToolsSheet } from './components/MathToolsSheet';
import { PagesDrawer } from './components/PagesDrawer';
import { PdfImportModal } from './components/PdfImportModal';
import { ExportShareModal } from './components/ExportShareModal';
import { ImageCropModal } from './components/ImageCropModal';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Layers,
  Redo2,
  Share2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export default function App() {
  const [notebooks, setNotebooks] = useState<BoardNotebook[]>([]);
  const [activeNbId, setActiveNbId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#F8FAFC');
  const [strokeSize, setStrokeSize] = useState(6);
  const [eraserSize, setEraserSize] = useState(34);
  const [stylusOnly, setStylusOnly] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hideChrome, setHideChrome] = useState(false);

  const [ruler, setRuler] = useState<RulerState>({
    visible: false,
    x: 140,
    y: 940,
    angle: 0,
    length: 760,
  });
  const [protractor, setProtractor] = useState<ProtractorState>({
    visible: false,
    x: 540,
    y: 960,
    angle: 0,
    radius: 260,
  });

  // Per-page undo / redo stacks
  const [undoMap, setUndoMap] = useState<Record<string, BoardElement[][]>>({});
  const [redoMap, setRedoMap] = useState<Record<string, BoardElement[][]>>({});

  // Modals
  const [showMath, setShowMath] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [cropTarget, setCropTarget] = useState<BoardImageObject | null>(null);
  const [pdfModal, setPdfModal] = useState<{ fileName: string; pages: RenderedPdfPage[] } | null>(
    null
  );
  const [pdfLoadingMsg, setPdfLoadingMsg] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Initial load from IndexedDB (100% offline)
  useEffect(() => {
    let active = true;
    loadAllNotebooksLocal().then(({ notebooks: saved, activeId }) => {
      if (!active) return;
      if (saved.length === 0) {
        const initial = createDefaultNotebook('Mathematics Board');
        setNotebooks([initial]);
        setActiveNbId(initial.id);
        saveNotebookLocal(initial);
      } else {
        setNotebooks(saved);
        const match = saved.find((n) => n.id === activeId) ?? saved[0];
        setActiveNbId(match.id);
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const currentNotebook =
    notebooks.find((n) => n.id === activeNbId) ?? notebooks[0] ?? null;
  const currentPage: BoardPage | null = currentNotebook
    ? currentNotebook.pages.find((p) => p.id === currentNotebook.currentPageId) ??
      currentNotebook.pages[0] ??
      null
    : null;

  // Auto-save active notebook whenever it updates
  useEffect(() => {
    if (!loaded || !currentNotebook) return;
    const timer = setTimeout(() => {
      saveNotebookLocal(currentNotebook);
    }, 220);
    return () => clearTimeout(timer);
  }, [loaded, currentNotebook]);

  const mutateNotebook = useCallback(
    (updater: (nb: BoardNotebook) => BoardNotebook) => {
      setNotebooks((prev) =>
        prev.map((nb) => (nb.id === activeNbId ? { ...updater(nb), updatedAt: Date.now() } : nb))
      );
    },
    [activeNbId]
  );

  const mutateCurrentPage = useCallback(
    (updater: (page: BoardPage) => BoardPage) => {
      mutateNotebook((nb) => ({
        ...nb,
        pages: nb.pages.map((p) =>
          p.id === nb.currentPageId ? { ...updater(p), updatedAt: Date.now() } : p
        ),
      }));
    },
    [mutateNotebook]
  );

  const commitElements = useCallback(
    (nextElements: BoardElement[], pushHistory = true) => {
      if (!currentPage) return;
      if (pushHistory) {
        const snapshot = currentPage.elements;
        setUndoMap((prev) => ({
          ...prev,
          [currentPage.id]: [...(prev[currentPage.id] ?? []).slice(-39), snapshot],
        }));
        setRedoMap((prev) => ({ ...prev, [currentPage.id]: [] }));
      }
      mutateCurrentPage((p) => ({ ...p, elements: nextElements }));
    },
    [currentPage, mutateCurrentPage]
  );

  const handleUndo = useCallback(() => {
    if (!currentPage) return;
    const stack = undoMap[currentPage.id] ?? [];
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    setUndoMap((prev) => ({ ...prev, [currentPage.id]: stack.slice(0, -1) }));
    setRedoMap((prev) => ({
      ...prev,
      [currentPage.id]: [...(prev[currentPage.id] ?? []), currentPage.elements],
    }));
    setSelectedId(null);
    mutateCurrentPage((p) => ({ ...p, elements: previous }));
  }, [currentPage, undoMap, mutateCurrentPage]);

  const handleRedo = useCallback(() => {
    if (!currentPage) return;
    const stack = redoMap[currentPage.id] ?? [];
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    setRedoMap((prev) => ({ ...prev, [currentPage.id]: stack.slice(0, -1) }));
    setUndoMap((prev) => ({
      ...prev,
      [currentPage.id]: [...(prev[currentPage.id] ?? []), currentPage.elements],
    }));
    setSelectedId(null);
    mutateCurrentPage((p) => ({ ...p, elements: next }));
  }, [currentPage, redoMap, mutateCurrentPage]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentPage) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const box = fitImageToBoard(img.naturalWidth, img.naturalHeight);
        const newImg: BoardImageObject = {
          id: createId('img'),
          kind: 'image',
          src: dataUrl,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          rotation: 0,
          pinned: false,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          label: file.name,
        };
        commitElements([...currentPage.elements, newImg], true);
        setTool('select');
        setSelectedId(newImg.id);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPdfLoadingMsg('Rendering PDF pages offline...');
    try {
      const pages = await renderPdfFileToImages(file, (cur, tot) => {
        setPdfLoadingMsg(`Rendering PDF page ${cur} of ${tot}...`);
      });
      setPdfModal({ fileName: file.name, pages });
    } catch (err) {
      setPdfLoadingMsg(
        `Could not read PDF: ${err instanceof Error ? err.message : 'Unsupported file'}`
      );
      setTimeout(() => setPdfLoadingMsg(null), 3000);
      return;
    }
    setPdfLoadingMsg(null);
  };

  const handleInsertPdfPage = (pdfPage: RenderedPdfPage, pinToBackground: boolean) => {
    if (!currentPage) return;
    const box = fitImageToBoard(pdfPage.width, pdfPage.height);
    const imgObj: BoardImageObject = {
      id: createId('pdfimg'),
      kind: 'image',
      src: pdfPage.dataUrl,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rotation: 0,
      pinned: pinToBackground,
      naturalWidth: pdfPage.width,
      naturalHeight: pdfPage.height,
      label: `PDF p.${pdfPage.pageNumber}`,
    };
    commitElements([...currentPage.elements, imgObj], true);
    setPdfModal(null);
    if (!pinToBackground) {
      setTool('select');
      setSelectedId(imgObj.id);
    }
  };

  const handleImportAllPdfPages = (pdfPages: RenderedPdfPage[], pinToBackground: boolean) => {
    if (!currentNotebook || !currentPage) return;
    const newBoardPages: BoardPage[] = pdfPages.map((pp) => {
      const box = fitImageToBoard(pp.width, pp.height);
      const imgObj: BoardImageObject = {
        id: createId('pdfimg'),
        kind: 'image',
        src: pp.dataUrl,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        rotation: 0,
        pinned: pinToBackground,
        naturalWidth: pp.width,
        naturalHeight: pp.height,
        label: `PDF p.${pp.pageNumber}`,
      };
      return {
        id: createId('page'),
        title: `PDF Page ${pp.pageNumber}`,
        background: currentPage.background,
        paper: 'plain',
        elements: [imgObj],
        updatedAt: Date.now(),
      };
    });
    mutateNotebook((nb) => ({
      ...nb,
      pages: [...nb.pages, ...newBoardPages],
      currentPageId: newBoardPages[0].id,
    }));
    setPdfModal(null);
  };

  const handleInsertMathNode = (node: MathNodeObject) => {
    if (!currentPage) return;
    commitElements([...currentPage.elements, node], true);
    setTool('select');
    setSelectedId(node.id);
  };

  const handleChangeBackground = (bg: BoardBackground) => {
    if (!currentPage) return;
    mutateCurrentPage((p) => ({ ...p, background: bg }));
    // Smart ink contrast switch if user had default white/black ink
    if (bg === 'white' && color.toLowerCase() === '#f8fafc') {
      setColor(BOARD_BACKGROUNDS.white.defaultInk);
    } else if (bg !== 'white' && color.toLowerCase() === '#0f172a') {
      setColor('#F8FAFC');
    }
  };

  const handleAddPage = () => {
    if (!currentNotebook || !currentPage) return;
    const nextPage: BoardPage = {
      ...createDefaultPage(currentNotebook.pages.length + 1),
      background: currentPage.background,
      paper: currentPage.paper,
    };
    mutateNotebook((nb) => ({
      ...nb,
      pages: [...nb.pages, nextPage],
      currentPageId: nextPage.id,
    }));
    setSelectedId(null);
  };

  const handleDuplicatePage = (pageId: string) => {
    if (!currentNotebook) return;
    const src = currentNotebook.pages.find((p) => p.id === pageId);
    if (!src) return;
    const copy: BoardPage = {
      ...structuredClone(src),
      id: createId('page'),
      title: `${src.title} Copy`,
      updatedAt: Date.now(),
    };
    mutateNotebook((nb) => ({
      ...nb,
      pages: [...nb.pages, copy],
      currentPageId: copy.id,
    }));
  };

  const handleDeletePage = (pageId: string) => {
    if (!currentNotebook || currentNotebook.pages.length <= 1) return;
    const remaining = currentNotebook.pages.filter((p) => p.id !== pageId);
    const nextId =
      currentNotebook.currentPageId === pageId ? remaining[0].id : currentNotebook.currentPageId;
    mutateNotebook((nb) => ({
      ...nb,
      pages: remaining,
      currentPageId: nextId,
    }));
  };

  if (!loaded || !currentNotebook || !currentPage) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0B0E11] text-slate-300 text-sm">
        Loading Smart Digital Blackboard...
      </div>
    );
  }

  const pageIndex = currentNotebook.pages.findIndex((p) => p.id === currentPage.id);
  const canUndo = (undoMap[currentPage.id]?.length ?? 0) > 0;
  const canRedo = (redoMap[currentPage.id]?.length ?? 0) > 0;

  return (
    <div className="h-full w-full flex flex-col bg-[#0B0E11] text-slate-100 overflow-hidden">
      {/* Hidden File Inputs for Offline Gallery Photo & PDF Import */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoSelected}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handlePdfSelected}
      />

      {/* Compact Top Bar (48px) */}
      {!hideChrome && (
        <header className="shrink-0 h-12 pt-safe px-2 sm:px-4 bg-[#14191F]/95 border-b border-white/10 flex items-center justify-between gap-2 z-30">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={() => setShowPages(true)}
              className="min-h-[40px] px-2.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-1.5 text-xs font-semibold text-slate-100 whitespace-nowrap"
            >
              <Layers className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="font-mono-tabular">
                {pageIndex + 1}/{currentNotebook.pages.length}
              </span>
            </button>
            <button
              disabled={pageIndex <= 0}
              onClick={() => {
                if (pageIndex > 0) {
                  mutateNotebook((nb) => ({
                    ...nb,
                    currentPageId: nb.pages[pageIndex - 1].id,
                  }));
                }
              }}
              className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={pageIndex >= currentNotebook.pages.length - 1}
              onClick={() => {
                if (pageIndex < currentNotebook.pages.length - 1) {
                  mutateNotebook((nb) => ({
                    ...nb,
                    currentPageId: nb.pages[pageIndex + 1].id,
                  }));
                }
              }}
              className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-30"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 truncate">
            <span className="font-semibold text-slate-200 truncate">{currentNotebook.name}</span>
            <span aria-hidden="true">·</span>
            <span>{isOnline ? 'Local Auto-Saved' : 'Offline Mode'}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              disabled={!canUndo}
              onClick={handleUndo}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-200 hover:bg-white/10 disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              disabled={!canRedo}
              onClick={handleRedo}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-200 hover:bg-white/10 disabled:opacity-30"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <div className="hidden sm:flex items-center bg-white/5 rounded-xl px-1">
              <button
                onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(2))))}
                className="min-h-[36px] min-w-[32px] flex items-center justify-center text-slate-300 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="px-1.5 text-[11px] font-mono-tabular text-sky-300"
                title="Reset Zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(4, Number((z + 0.2).toFixed(2))))}
                className="min-h-[36px] min-w-[32px] flex items-center justify-center text-slate-300 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {!isInstalled && (
              <button
                onClick={() => {
                  if (isInstallable) {
                    install();
                  } else {
                    setShowExport(true);
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500 text-slate-950 text-xs font-semibold min-h-[38px] shrink-0 whitespace-nowrap"
                title="Install Offline App"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
            )}

            <button
              onClick={() => setHideChrome(true)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-300 hover:bg-white/10"
              title="Full-Screen Writing Mode"
            >
              <EyeOff className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowExport(true)}
              className="min-h-[40px] px-2.5 flex items-center gap-1.5 rounded-xl bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 text-xs font-semibold"
              title="Export PNG / PDF & Share"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </header>
      )}

      {/* Restore Toolbars Pill when in Full-Screen Distraction-Free Mode */}
      {hideChrome && (
        <button
          onClick={() => setHideChrome(false)}
          className="fixed top-3 right-3 z-40 min-h-[42px] px-3 rounded-xl bg-[#14191F]/90 border border-white/15 text-xs font-medium text-slate-200 flex items-center gap-1.5 shadow-xl backdrop-blur-md"
        >
          <Eye className="w-4 h-4 text-sky-400" />
          <span>Show Tools</span>
        </button>
      )}

      {/* Main 9:16 Portrait Blackboard Stage */}
      <BlackboardCanvas
        page={currentPage}
        tool={tool}
        color={color}
        strokeSize={strokeSize}
        eraserSize={eraserSize}
        stylusOnly={stylusOnly}
        zoom={zoom}
        pan={pan}
        onZoomChange={setZoom}
        onPanChange={setPan}
        selectedId={selectedId}
        onSelectId={setSelectedId}
        onCommitElements={commitElements}
        onRequestCropImage={(img) => setCropTarget(img)}
        ruler={ruler}
        onRulerChange={setRuler}
        protractor={protractor}
        onProtractorChange={setProtractor}
      />

      {/* Bottom Touch-Friendly Toolbar (never covers canvas) */}
      {!hideChrome && (
        <FloatingToolbar
          tool={tool}
          onSelectTool={setTool}
          color={color}
          onSelectColor={setColor}
          strokeSize={strokeSize}
          onChangeStrokeSize={setStrokeSize}
          eraserSize={eraserSize}
          onChangeEraserSize={setEraserSize}
          stylusOnly={stylusOnly}
          onToggleStylusOnly={() => setStylusOnly((s) => !s)}
          onOpenMath={() => setShowMath(true)}
          onPickPhoto={() => photoInputRef.current?.click()}
          onPickPdf={() => pdfInputRef.current?.click()}
          onClearBoard={() => commitElements([], true)}
        />
      )}

      {/* Loading Indicator for Offline PDF Rendering */}
      {pdfLoadingMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-[#14191F] border border-white/15 px-6 py-4 text-sm font-medium text-slate-100 shadow-2xl">
            {pdfLoadingMsg}
          </div>
        </div>
      )}

      {/* Mathematics Teaching Tools Sheet */}
      {showMath && (
        <MathToolsSheet
          activeColor={color}
          ruler={ruler}
          protractor={protractor}
          onToggleRuler={() => setRuler((r) => ({ ...r, visible: !r.visible }))}
          onToggleProtractor={() => setProtractor((p) => ({ ...p, visible: !p.visible }))}
          onInsertMathNode={handleInsertMathNode}
          onClose={() => setShowMath(false)}
        />
      )}

      {/* Pages & Board Manager Drawer */}
      {showPages && (
        <PagesDrawer
          notebook={currentNotebook}
          allNotebooks={notebooks}
          currentPage={currentPage}
          onSelectPage={(pageId) => {
            setSelectedId(null);
            mutateNotebook((nb) => ({ ...nb, currentPageId: pageId }));
          }}
          onAddPage={handleAddPage}
          onDuplicatePage={handleDuplicatePage}
          onDeletePage={handleDeletePage}
          onChangeBackground={handleChangeBackground}
          onChangePaper={(paper: PaperPattern) =>
            mutateCurrentPage((p) => ({ ...p, paper }))
          }
          onSwitchNotebook={(id) => {
            setSelectedId(null);
            setActiveNbId(id);
          }}
          onCreateNotebook={(name) => {
            const created = createDefaultNotebook(name);
            setNotebooks((prev) => [created, ...prev]);
            setActiveNbId(created.id);
            saveNotebookLocal(created);
          }}
          onRenameNotebook={(name) => mutateNotebook((nb) => ({ ...nb, name }))}
          onDeleteNotebook={(id) => {
            if (notebooks.length <= 1) return;
            const rest = notebooks.filter((n) => n.id !== id);
            setNotebooks(rest);
            if (activeNbId === id) setActiveNbId(rest[0].id);
            deleteNotebookLocal(id);
          }}
          onClose={() => setShowPages(false)}
        />
      )}

      {/* PDF Import Picker Modal */}
      {pdfModal && (
        <PdfImportModal
          fileName={pdfModal.fileName}
          pages={pdfModal.pages}
          onInsertSinglePage={handleInsertPdfPage}
          onImportAllAsBoardPages={handleImportAllPdfPages}
          onClose={() => setPdfModal(null)}
        />
      )}

      {/* Image Crop Modal */}
      {cropTarget && (
        <ImageCropModal
          image={cropTarget}
          onCancel={() => setCropTarget(null)}
          onApply={(croppedUrl, newWidth, newHeight) => {
            commitElements(
              currentPage.elements.map((el) =>
                el.id === cropTarget.id && el.kind === 'image'
                  ? {
                      ...el,
                      src: croppedUrl,
                      width: Math.max(80, newWidth),
                      height: Math.max(80, newHeight),
                    }
                  : el
              ),
              true
            );
            setCropTarget(null);
          }}
        />
      )}

      {/* Export, Share & Android Source Modal */}
      {showExport && (
        <ExportShareModal
          notebook={currentNotebook}
          currentPage={currentPage}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
