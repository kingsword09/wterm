export interface CellData {
  char: number;
  fg: number;
  bg: number;
  flags: number;
  /**
   * Display width in terminal columns.
   * `0` marks the spacer cell attached to a wide character, `1` is normal,
   * and `2` is a wide/fullwidth character.
   */
  width?: 0 | 1 | 2;
  /** Resolved 24-bit foreground color (0xRRGGBB). Present when the core provides true color. */
  fgRgb?: number;
  /** Resolved 24-bit background color (0xRRGGBB). Present when the core provides true color. */
  bgRgb?: number;
}

export interface CursorState {
  row: number;
  col: number;
  visible: boolean;
}

export interface UnhandledSequence {
  final: string;
  private: string;
  paramCount: number;
  params: number[];
}

/**
 * Abstract terminal emulation core. Both the built-in Zig WASM core
 * (`WasmBridge`) and alternative backends (e.g. `@wterm/ghostty`) implement
 * this interface so that `@wterm/dom` can render any core interchangeably.
 */
export interface TerminalCore {
  // -- Lifecycle --
  init(cols: number, rows: number): void;
  resize(cols: number, rows: number): void;

  // -- I/O --
  writeString(str: string): void;
  writeRaw(data: Uint8Array): void;

  // -- Grid --
  getCell(row: number, col: number): CellData;
  /**
   * Monotonic version for a live grid row. Implementations should increment it
   * whenever the row's visible cell content or row metadata changes. Clearing
   * dirty flags after render should not increment it.
   */
  getRowGeneration?(row: number): number;
  isDirtyRow(row: number): boolean;
  clearDirty(): void;
  getCols(): number;
  getRows(): number;

  // -- Cursor --
  getCursor(): CursorState;

  // -- Modes --
  cursorKeysApp(): boolean;
  bracketedPaste(): boolean;
  usingAltScreen(): boolean;

  // -- Side outputs --
  getTitle(): string | null;
  getResponse(): string | null;

  // -- Scrollback --
  getScrollbackCount(): number;
  /**
   * Monotonic version for scrollback content changes. Implementations should
   * increment it when scrollback rows are appended, dropped, or reset. Live grid
   * changes that do not affect scrollback should not increment it.
   */
  getScrollbackGeneration?(): number;
  getScrollbackCell(offset: number, col: number): CellData;
  getScrollbackLineLen(offset: number): number;
  getScrollbackLineWrapped?(offset: number): boolean;
  getRowWrapped?(row: number): boolean;

  // -- Debug --
  getUnhandledSequences(): UnhandledSequence[];
}
