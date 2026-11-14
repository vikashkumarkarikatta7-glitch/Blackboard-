import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { jsPDF } from 'jspdf';
import { BOARD_HEIGHT, BOARD_WIDTH, BoardNotebook, BoardPage } from '../types/board';
import { renderPageToDataURL } from './canvasRenderer';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface RenderedPdfPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export async function renderPdfFileToImages(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<RenderedPdfPage[]> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const total = pdf.numPages;
  const results: RenderedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= total; pageNum++) {
    onProgress?.(pageNum, total);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    // Target crisp width suitable for 1080x1920 blackboard while keeping memory friendly for 6GB RAM phones
    const targetScale = Math.min(2.2, Math.max(1.2, 1080 / viewport.width));
    const scaled = page.getViewport({ scale: targetScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(scaled.width);
    canvas.height = Math.round(scaled.height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
      results.push({
        pageNumber: pageNum,
        dataUrl: canvas.toDataURL('image/jpeg', 0.9),
        width: canvas.width,
        height: canvas.height,
      });
    }
  }

  return results;
}

export async function exportPageAsPng(page: BoardPage, notebookName: string): Promise<void> {
  const dataUrl = await renderPageToDataURL(page, 1.5);
  const link = document.createElement('a');
  const safeName = `${notebookName}-${page.title}`.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
  link.download = `${safeName}.png`;
  link.href = dataUrl;
  link.click();
}

export async function exportNotebookAsPdf(notebook: BoardNotebook): Promise<void> {
  // 9:16 portrait PDF page in points (540 x 960 pt)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [540, 960],
    compress: true,
  });

  for (let i = 0; i < notebook.pages.length; i++) {
    if (i > 0) pdf.addPage([540, 960], 'portrait');
    const page = notebook.pages[i];
    const dataUrl = await renderPageToDataURL(page, 1);
    pdf.addImage(dataUrl, 'PNG', 0, 0, 540, 960, undefined, 'FAST');
  }

  const safeName = notebook.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
  pdf.save(`${safeName || 'blackboard'}.pdf`);
}

export async function sharePageImage(page: BoardPage, notebookName: string): Promise<'shared' | 'downloaded'> {
  const dataUrl = await renderPageToDataURL(page, 1.5);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const fileName = `${notebookName}-${page.title}`.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() + '.png';
  const file = new File([blob], fileName, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: `${notebookName} · ${page.title}`,
        text: 'Shared from Smart Digital Blackboard',
        files: [file],
      });
      return 'shared';
    } catch {
      // User cancelled or share failed; fall through to download
    }
  }

  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
  return 'downloaded';
}

export function fitImageToBoard(naturalWidth: number, naturalHeight: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const maxW = BOARD_WIDTH * 0.82;
  const maxH = BOARD_HEIGHT * 0.72;
  const ratio = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1.4);
  const width = Math.round(naturalWidth * ratio);
  const height = Math.round(naturalHeight * ratio);
  return {
    x: Math.round((BOARD_WIDTH - width) / 2),
    y: Math.round((BOARD_HEIGHT - height) / 2),
    width,
    height,
  };
}
