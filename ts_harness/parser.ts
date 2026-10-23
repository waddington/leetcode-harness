/**
 * Parse LeetCode-style example test cases (TypeScript port of parser.py).
 *
 * LeetCode shows examples like:
 *
 *     Input: nums = [1,2,3,1], k = 3
 *     Output: true
 *
 * This module turns blocks of that text into structured test cases so they can
 * be fed straight into your solution function. Paste the example text
 * *verbatim* from the problem page and it just works.
 *
 * Values are JSON-style literals (LeetCode's native notation). Single-quoted
 * strings and Python's True/False/None are accepted too, so a test_cases.txt
 * written for the Python harness still parses.
 */

export interface TestCase {
  /** Parsed `name = value` pairs from the Input line. */
  kwargs: Record<string, unknown>;
  /** May be absent (only an Input pasted); see hasExpected. */
  expected: unknown;
  /** Disambiguates "expected is null" from "no expected given". */
  hasExpected: boolean;
  /** Raw input text, kept for nicer messages. */
  raw: string;
}

class LiteralParser {
  private i = 0;
  private readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  parse(): unknown {
    const value = this.value();
    this.ws();
    if (this.i !== this.src.length) throw new Error("trailing input");
    return value;
  }

  private ws(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++;
  }

  private value(): unknown {
    this.ws();
    const ch = this.src[this.i];
    if (ch === "[" || ch === "(") return this.array(ch === "[" ? "]" : ")");
    if (ch === "{") return this.object();
    if (ch === '"' || ch === "'") return this.string();
    if (ch === "-" || ch === "+" || ch === "." || /[0-9]/.test(ch ?? "")) return this.number();
    const word = /^[A-Za-z_]\w*/.exec(this.src.slice(this.i))?.[0];
    if (word !== undefined) {
      const known: Record<string, unknown> = {
        true: true, false: false, null: null,
        True: true, False: false, None: null,
      };
      if (word in known) {
        this.i += word.length;
        return known[word];
      }
    }
    throw new Error(`unexpected ${ch ?? "end of input"}`);
  }

  private array(close: string): unknown[] {
    this.i++; // opening bracket
    const out: unknown[] = [];
    this.ws();
    if (this.src[this.i] === close) {
      this.i++;
      return out;
    }
    for (;;) {
      out.push(this.value());
      this.ws();
      const ch = this.src[this.i++];
      if (ch === close) return out;
      if (ch !== ",") throw new Error("expected , in array");
      this.ws();
      if (this.src[this.i] === close) { // trailing comma
        this.i++;
        return out;
      }
    }
  }

  private object(): Record<string, unknown> {
    this.i++; // {
    const out: Record<string, unknown> = {};
    this.ws();
    if (this.src[this.i] === "}") {
      this.i++;
      return out;
    }
    for (;;) {
      const key = this.value();
      this.ws();
      if (this.src[this.i++] !== ":") throw new Error("expected : in object");
      out[String(key)] = this.value();
      this.ws();
      const ch = this.src[this.i++];
      if (ch === "}") return out;
      if (ch !== ",") throw new Error("expected , in object");
    }
  }

  private string(): string {
    const quote = this.src[this.i++];
    let out = "";
    while (this.i < this.src.length) {
      const ch = this.src[this.i++];
      if (ch === quote) return out;
      if (ch === "\\") {
        const esc = this.src[this.i++];
        const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
        if (esc === "u") {
          out += String.fromCharCode(parseInt(this.src.slice(this.i, this.i + 4), 16));
          this.i += 4;
        } else {
          out += simple[esc] ?? esc;
        }
      } else {
        out += ch;
      }
    }
    throw new Error("unterminated string");
  }

  private number(): number {
    const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(this.src.slice(this.i));
    if (!m) throw new Error("bad number");
    this.i += m[0].length;
    return Number(m[0]);
  }
}

/** Parse a single value literal (the RHS of `name = value`). */
export function parseValue(text: string): unknown {
  text = text.trim();
  if (!text) throw new Error("empty value");
  try {
    return new LiteralParser(text).parse();
  } catch {
    // Fall back to treating it as a bare string (e.g. an unquoted word).
    return text;
  }
}

/**
 * Split on commas that are not inside brackets, braces, parens or quotes.
 *
 * `nums = [1,2,3], k = 3` -> ['nums = [1,2,3]', ' k = 3']
 */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if ("[{(".includes(ch)) {
      depth++;
    } else if ("]})".includes(ch)) {
      depth--;
    } else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.filter((p) => p.trim());
}

/**
 * Parse `a = 1, b = [2,3]` into {a: 1, b: [2, 3]}.
 *
 * If the text has no top-level `name =` (e.g. just `[1,2,3]`), the whole
 * thing is treated as a single positional value under the key '_'.
 */
export function parseAssignments(text: string): Record<string, unknown> {
  text = text.trim();
  if (!text) return {};

  const result: Record<string, unknown> = {};
  const positional: unknown[] = [];
  for (const seg of splitTopLevel(text)) {
    // A top-level `=` that isn't `==`, `<=`, `>=`, `!=`.
    const m = /^\s*([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]*)$/.exec(seg);
    if (m) {
      result[m[1]] = parseValue(m[2]);
    } else {
      positional.push(parseValue(seg));
    }
  }

  if (positional.length) {
    if (positional.length === 1 && Object.keys(result).length === 0) {
      result["_"] = positional[0];
    } else {
      // Mixed/odd input; stash positionals so the runner can complain
      // usefully rather than silently dropping them.
      result["_positional"] = positional;
    }
  }
  return result;
}

// Matches lines like "Input: ...", "Output: ...", case-insensitive, with an
// optional leading bullet/quote that sometimes survives a copy-paste.
const LABEL_RE = /^\s*[>|\-*\s]*?(input|output|expected)\s*:\s*(.*)$/i;

/**
 * Parse a whole `test_cases.txt` file into a list of TestCase.
 *
 * Blank lines and `#` comment lines are ignored. An `Input:` line starts a
 * new case; the following `Output:`/`Expected:` line attaches the expected
 * value. Lines are concatenated for multi-line inputs.
 */
export function parseCases(text: string): TestCase[] {
  const cases: TestCase[] = [];
  let current: TestCase | null = null;
  let mode: "input" | "output" | null = null; // which buffer trailing lines append to
  let inBuf: string[] = [];
  let outBuf: string[] = [];

  const flush = (): void => {
    if (current === null) return;
    const inText = inBuf.join(" ").trim();
    current.kwargs = parseAssignments(inText);
    current.raw = inText;
    if (outBuf.length) {
      const assigns = parseAssignments(outBuf.join(" ").trim());
      const keys = Object.keys(assigns);
      // Output is usually a bare value; if it parsed as a single '_'
      // positional, unwrap it.
      if (keys.length === 1 && keys[0] === "_") current.expected = assigns["_"];
      else if (keys.length === 0) current.expected = null;
      else current.expected = assigns;
      current.hasExpected = true;
    }
    cases.push(current);
    current = null;
    inBuf = [];
    outBuf = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) continue;
    const m = LABEL_RE.exec(line);
    if (m) {
      const label = m[1].toLowerCase();
      const rest = m[2];
      if (label === "input") {
        flush();
        current = { kwargs: {}, expected: null, hasExpected: false, raw: "" };
        mode = "input";
        inBuf = rest.trim() ? [rest] : [];
      } else { // output / expected
        mode = "output";
        outBuf = rest.trim() ? [rest] : [];
      }
    } else if (mode === "input") {
      // Continuation line for whichever section we're in.
      inBuf.push(stripped);
    } else if (mode === "output") {
      outBuf.push(stripped);
    }
  }
  flush();
  return cases;
}
