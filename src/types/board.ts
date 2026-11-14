export const BOARD_WIDTH = 1080;
export const BOARD_HEIGHT = 1920;

export type BoardBackground = 'black' | 'green' | 'white' | 'blue';
export type PaperPattern = 'plain' | 'grid' | 'dotted' | 'ruled' | 'axes';

export type ToolType =
  | 'select'
  | 'area-select'
  | 'pen'
  | 'pencil'
  | 'highlighter'
  | 'text'
  | 'laser'
  | 'eraser'
  | 'line'
  | 'circle'
  | 'rectangle'
  | 'square'
  | 'triangle'
  | 'arrow'
  | 'freehand-shape';

export type ShapeType = 'line' | 'circle' | 'rectangle' | 'square' | 'triangle' | 'arrow';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface StrokeObject {
  id: string;
  kind: 'stroke';
  tool: 'pen' | 'pencil' | 'highlighter' | 'freehand-shape';
  color: string;
  size: number;
  points: StrokePoint[];
  closed?: boolean;
}

export interface ShapeObject {
  id: string;
  kind: 'shape';
  shapeType: ShapeType;
  color: string;
  size: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MathNodeObject {
  id: string;
  kind: 'math';
  mathType: 'text' | 'fraction' | 'proof' | 'graph' | 'axes' | 'diagram';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  content: string;
  numerator?: string;
  denominator?: string;
  whole?: string;
  expression?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  diagramId?: string;
  fontSize?: number;
  fontFamily?: 'sans' | 'math';
  textAlign?: 'left' | 'center';
}

export interface BoardImageObject {
  id: string;
  kind: 'image';
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  pinned: boolean;
  naturalWidth: number;
  naturalHeight: number;
  label?: string;
}

export type BoardElement = StrokeObject | ShapeObject | MathNodeObject | BoardImageObject;

export interface BoardPage {
  id: string;
  title: string;
  background: BoardBackground;
  paper: PaperPattern;
  elements: BoardElement[];
  updatedAt: number;
}

export interface BoardNotebook {
  id: string;
  name: string;
  pages: BoardPage[];
  currentPageId: string;
  updatedAt: number;
}

export interface RulerState {
  visible: boolean;
  x: number;
  y: number;
  angle: number;
  length: number;
}

export interface ProtractorState {
  visible: boolean;
  x: number;
  y: number;
  angle: number;
  radius: number;
}

export const BOARD_BACKGROUNDS: Record<
  BoardBackground,
  { label: string; bg: string; grid: string; defaultInk: string }
> = {
  black: {
    label: 'Black',
    bg: '#0E1114',
    grid: 'rgba(255, 255, 255, 0.08)',
    defaultInk: '#F8FAFC',
  },
  green: {
    label: 'Green',
    bg: '#133024',
    grid: 'rgba(255, 255, 255, 0.10)',
    defaultInk: '#F8FAFC',
  },
  white: {
    label: 'White',
    bg: '#F8FAFC',
    grid: 'rgba(15, 23, 42, 0.11)',
    defaultInk: '#0F172A',
  },
  blue: {
    label: 'Blue',
    bg: '#0E223D',
    grid: 'rgba(148, 197, 255, 0.13)',
    defaultInk: '#F8FAFC',
  },
};

export const CHALK_PALETTE: { name: string; hex: string }[] = [
  { name: 'White', hex: '#F8FAFC' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#38BDF8' },
  { name: 'Green', hex: '#4ADE80' },
  { name: 'Yellow', hex: '#FACC15' },
  { name: 'Orange', hex: '#FB923C' },
  { name: 'Pink', hex: '#F472B6' },
  { name: 'Purple', hex: '#C084FC' },
  { name: 'Charcoal', hex: '#0F172A' },
];
