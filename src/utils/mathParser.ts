// Safe offline mathematical expression evaluator (no eval / Function)
type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' };

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const s = input.toLowerCase().replace(/\s+/g, '');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let numStr = '';
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) {
        numStr += s[i++];
      }
      const val = parseFloat(numStr);
      if (!Number.isFinite(val)) throw new Error('Invalid number');
      tokens.push({ type: 'num', value: val });
      continue;
    }
    if (ch >= 'a' && ch <= 'z') {
      let ident = '';
      while (i < s.length && s[i] >= 'a' && s[i] <= 'z') {
        ident += s[i++];
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if ('+-*/^'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }

  // Insert implicit multiplication (e.g., 2x, 3sin(x), x(x+1), )( )
  const expanded: Token[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx];
    if (idx > 0) {
      const prev = tokens[idx - 1];
      const prevEndsValue =
        prev.type === 'num' ||
        prev.type === 'rparen' ||
        (prev.type === 'ident' && !(prev.value in FUNCTIONS));
      const curStartsValue =
        cur.type === 'num' || cur.type === 'lparen' || cur.type === 'ident';
      if (prevEndsValue && curStartsValue) {
        expanded.push({ type: 'op', value: '*' });
      }
    }
    expanded.push(cur);
  }
  return expanded;
}

export function compileMathExpression(expr: string): (x: number) => number {
  const cleaned = expr.replace(/^y\s*=\s*/i, '').trim();
  if (!cleaned) throw new Error('Empty expression');
  const tokens = tokenize(cleaned);

  return (xVal: number): number => {
    let pos = 0;

    function peek(): Token | undefined {
      return tokens[pos];
    }

    function consume(): Token {
      return tokens[pos++];
    }

    function parseExpr(): number {
      let left = parseTerm();
      while (true) {
        const t = peek();
        if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
          consume();
          const right = parseTerm();
          left = t.value === '+' ? left + right : left - right;
        } else {
          break;
        }
      }
      return left;
    }

    function parseTerm(): number {
      let left = parsePower();
      while (true) {
        const t = peek();
        if (t?.type === 'op' && (t.value === '*' || t.value === '/')) {
          consume();
          const right = parsePower();
          left = t.value === '*' ? left * right : left / right;
        } else {
          break;
        }
      }
      return left;
    }

    function parsePower(): number {
      const base = parseUnary();
      const t = peek();
      if (t?.type === 'op' && t.value === '^') {
        consume();
        const exp = parsePower();
        return Math.pow(base, exp);
      }
      return base;
    }

    function parseUnary(): number {
      const t = peek();
      if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
        consume();
        const val = parseUnary();
        return t.value === '-' ? -val : val;
      }
      return parsePrimary();
    }

    function parsePrimary(): number {
      const t = peek();
      if (!t) throw new Error('Unexpected end');
      if (t.type === 'num') {
        consume();
        return t.value;
      }
      if (t.type === 'lparen') {
        consume();
        const v = parseExpr();
        if (peek()?.type !== 'rparen') throw new Error('Missing )');
        consume();
        return v;
      }
      if (t.type === 'ident') {
        consume();
        if (t.value === 'x') return xVal;
        if (t.value in CONSTANTS) return CONSTANTS[t.value];
        if (t.value in FUNCTIONS) {
          if (peek()?.type !== 'lparen') throw new Error(`Expected ( after ${t.value}`);
          consume();
          const arg = parseExpr();
          if (peek()?.type !== 'rparen') throw new Error('Missing )');
          consume();
          return FUNCTIONS[t.value](arg);
        }
        throw new Error(`Unknown identifier: ${t.value}`);
      }
      throw new Error('Unexpected token');
    }

    const result = parseExpr();
    if (pos < tokens.length) throw new Error('Unexpected trailing input');
    return result;
  };
}

export const MATH_SYMBOL_CATEGORIES: { label: string; symbols: string[] }[] = [
  {
    label: 'Algebra',
    symbols: ['+', '−', '×', '÷', '=', '≠', '≈', '±', '√', '∛', '²', '³', 'ⁿ', '(', ')', '[', ']', '|x|', '!', '%'],
  },
  {
    label: 'Calculus',
    symbols: ['∫', '∬', '∮', '∂', '∑', '∏', 'lim', '∞', 'Δ', '∇', 'dx', 'dy', '→', '↦', '′', '″'],
  },
  {
    label: 'Greek',
    symbols: ['α', 'β', 'γ', 'δ', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ψ', 'ω', 'Σ', 'Π', 'Ω', 'Δ', 'Θ', 'Φ'],
  },
  {
    label: 'Geometry',
    symbols: ['∠', '°', '△', '□', '○', '⊥', '∥', '≅', '∼', '⌒', '⊙', 'πr²', 'a²+b²=c²'],
  },
  {
    label: 'Sets & Logic',
    symbols: ['∈', '∉', '⊂', '⊆', '∪', '∩', '∅', '∀', '∃', '∄', '⇒', '⇔', '¬', '∧', '∨', '∴', '∵', 'ℝ', 'ℤ', 'ℕ'],
  },
];

export interface MathDiagramTemplate {
  id: string;
  title: string;
  subtitle: string;
}

export const MATH_DIAGRAMS: MathDiagramTemplate[] = [
  { id: 'unit-circle', title: 'Unit Circle', subtitle: 'sin θ, cos θ, radians' },
  { id: 'right-triangle', title: 'Right Triangle', subtitle: 'Hypotenuse, Opposite, Adjacent' },
  { id: 'pythagoras', title: 'Pythagorean Proof', subtitle: 'a² + b² = c² square areas' },
  { id: 'parabola', title: 'Quadratic Vertex', subtitle: 'y = a(x - h)² + k' },
  { id: 'normal-curve', title: 'Normal Distribution', subtitle: 'μ ± 1σ, 2σ, 3σ bands' },
  { id: 'circle-theorems', title: 'Inscribed Angle', subtitle: 'Central = 2 × Inscribed' },
];
