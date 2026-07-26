/** Turns a stream of assistant text deltas into speakable sentence chunks.
 *
 *  Two jobs: (1) cut the stream at natural boundaries so speech can start
 *  while the model is still writing, and (2) drop the parts of a chat reply
 *  that only make sense on screen — fenced code, tables, markdown syntax,
 *  link targets, emoji. Reasoning output never reaches here: the agent
 *  subscribes to `text_delta` only, not `thinking_delta`. */

const FENCE = /^\s*(?:```|~~~)/;
const TABLE_ROW = /^\s*\|/;
const HORIZONTAL_RULE = /^\s*(?:[-*_]\s*){3,}$/;
/** Leading text that can still turn out to be a block marker once the rest of
 *  the line arrives, so a partial line starting like this is never spoken early. */
const AMBIGUOUS_PREFIX = /^\s*(?:`{1,3}|~{1,3}|\||#|>|[-*_]\s*[-*_]?\s*$)/;

/** Abbreviations whose trailing dot is not a sentence end. */
const ABBREVIATIONS = new Set([
  "e.g.", "i.e.", "etc.", "vs.", "cf.", "approx.", "no.", "fig.",
  "mr.", "mrs.", "ms.", "dr.", "st.", "jr.", "sr.",
]);

const SENTENCE_BOUNDARY = /(?:[.!?…]["'”’)\]]?|[:;])(?=\s)/g;
/** Shortest chunk worth cutting early — below this the pause costs more than
 *  the latency it saves, and short fragments are where abbreviation-style
 *  false boundaries cluster. */
const MIN_CHUNK_LENGTH = 24;

function stripMarkdown(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<(https?:\/\/[^>]+)>/g, "link")
    .replace(/(?<![(\w])https?:\/\/\S+/g, "link")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(?<!\w)([*_])(?!\s)(.+?)(?<!\s)\1(?!\w)/g, "$2")
    .replace(/[\p{Extended_Pictographic}️]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chunks with no letter or digit ("---", ":", a lone bullet) would be read as
 *  an odd noise or a dead pause. */
function isSpeakable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function endsWithAbbreviation(text: string): boolean {
  const lastWord = text.split(/\s+/).pop()?.toLowerCase() ?? "";
  return ABBREVIATIONS.has(lastWord);
}

/** Splits off every complete sentence, returning them plus the unfinished tail. */
function splitSentences(buffer: string): { chunks: string[]; rest: string } {
  const chunks: string[] = [];
  let start = 0;
  SENTENCE_BOUNDARY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_BOUNDARY.exec(buffer)) !== null) {
    const end = match.index + match[0].length;
    const candidate = buffer.slice(start, end).trim();
    if (candidate.length < MIN_CHUNK_LENGTH || endsWithAbbreviation(candidate)) continue;
    chunks.push(candidate);
    start = end;
  }
  return { chunks, rest: buffer.slice(start) };
}

export class SpeechStreamer {
  private buffer = "";
  private inFence = false;
  private fenceHadContent = false;

  constructor(private readonly onChunk: (text: string) => void) {}

  push(delta: string): void {
    this.buffer += delta;

    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      this.consumeLine(this.buffer.slice(0, newline));
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
    }

    // The tail has no newline yet, so it may still grow into a code fence or a
    // table row — only speak ahead once it is unambiguously prose.
    if (this.buffer && !this.inFence && !AMBIGUOUS_PREFIX.test(this.buffer)) {
      const { chunks, rest } = splitSentences(this.buffer);
      if (chunks.length > 0) {
        this.buffer = rest;
        for (const chunk of chunks) this.emit(stripMarkdown(chunk));
      }
    }
  }

  /** Flushes whatever is buffered — call once the turn's text has ended. */
  end(): void {
    if (this.buffer) {
      this.consumeLine(this.buffer);
      this.buffer = "";
    }
  }

  private consumeLine(line: string): void {
    if (FENCE.test(line)) {
      this.inFence = !this.inFence;
      // Silence alone reads as the agent having stopped, so acknowledge the
      // block the user can see on screen instead of reading it out.
      if (!this.inFence && this.fenceHadContent) this.emit("Code block.");
      this.fenceHadContent = false;
      return;
    }
    if (this.inFence) {
      if (line.trim()) this.fenceHadContent = true;
      return;
    }
    if (TABLE_ROW.test(line) || HORIZONTAL_RULE.test(line)) return;
    this.emit(stripMarkdown(line));
  }

  private emit(text: string): void {
    if (text && isSpeakable(text)) this.onChunk(text);
  }
}
