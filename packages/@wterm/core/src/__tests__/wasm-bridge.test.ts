import { describe, it, expect, beforeEach } from "vitest";
import { WasmBridge } from "../wasm-bridge.js";

describe("WasmBridge", () => {
  let bridge: WasmBridge;

  beforeEach(async () => {
    bridge = await WasmBridge.load();
    bridge.init(80, 24);
  });

  describe("load", () => {
    it("loads from inline base64", async () => {
      const b = await WasmBridge.load();
      expect(b).toBeInstanceOf(WasmBridge);
    });

    it("throws on invalid URL fetch", async () => {
      await expect(
        WasmBridge.load("http://localhost:99999/nonexistent.wasm"),
      ).rejects.toThrow();
    });
  });

  describe("init", () => {
    it("sets cols and rows", () => {
      expect(bridge.getCols()).toBe(80);
      expect(bridge.getRows()).toBe(24);
    });
  });

  describe("writeString / getCell", () => {
    it("writes a character to the grid", () => {
      bridge.writeString("A");
      const cell = bridge.getCell(0, 0);
      expect(cell.char).toBe(65); // 'A'
    });

    it("writes multiple characters sequentially", () => {
      bridge.writeString("Hi");
      expect(bridge.getCell(0, 0).char).toBe(72); // 'H'
      expect(bridge.getCell(0, 1).char).toBe(105); // 'i'
    });

    it("exposes wide character cell widths", () => {
      bridge.writeString("提交");

      expect(bridge.getCell(0, 0)).toMatchObject({
        char: "提".codePointAt(0),
        width: 2,
      });
      expect(bridge.getCell(0, 1)).toMatchObject({
        char: 32,
        width: 0,
      });
      expect(bridge.getCell(0, 2)).toMatchObject({
        char: "交".codePointAt(0),
        width: 2,
      });
      expect(bridge.getCell(0, 3)).toMatchObject({
        char: 32,
        width: 0,
      });
      expect(bridge.getCursor().col).toBe(4);
    });

    it("wraps wide characters before the final column", () => {
      bridge.resize(3, 3);
      bridge.writeString("AB你");

      expect(bridge.getCell(0, 0).char).toBe(65);
      expect(bridge.getCell(0, 1).char).toBe(66);
      expect(bridge.getCell(0, 2).char).toBe(32);
      expect(bridge.getCell(1, 0)).toMatchObject({
        char: "你".codePointAt(0),
        width: 2,
      });
      expect(bridge.getCell(1, 1).width).toBe(0);
    });

    it("marks rows wrapped when a wide character wraps before the final column", () => {
      bridge.resize(3, 3);
      bridge.writeString("AB你");

      expect(bridge.getRowWrapped(0)).toBe(true);
      expect(bridge.getRowWrapped(1)).toBe(false);
    });

    it("writes to correct position after cursor movement", () => {
      bridge.writeString("AB\r\nCD");
      expect(bridge.getCell(0, 0).char).toBe(65); // 'A'
      expect(bridge.getCell(0, 1).char).toBe(66); // 'B'
      expect(bridge.getCell(1, 0).char).toBe(67); // 'C'
      expect(bridge.getCell(1, 1).char).toBe(68); // 'D'
    });
  });

  describe("writeRaw", () => {
    it("writes raw bytes to the terminal", () => {
      const data = new TextEncoder().encode("X");
      bridge.writeRaw(data);
      expect(bridge.getCell(0, 0).char).toBe(88); // 'X'
    });
  });

  describe("cursor", () => {
    it("returns initial cursor at 0,0", () => {
      const cursor = bridge.getCursor();
      expect(cursor.row).toBe(0);
      expect(cursor.col).toBe(0);
      expect(cursor.visible).toBe(true);
    });

    it("advances cursor after writing", () => {
      bridge.writeString("Hello");
      const cursor = bridge.getCursor();
      expect(cursor.col).toBe(5);
      expect(cursor.row).toBe(0);
    });

    it("moves to next row after newline", () => {
      bridge.writeString("A\r\nB");
      const cursor = bridge.getCursor();
      expect(cursor.row).toBe(1);
      expect(cursor.col).toBe(1);
    });
  });

  describe("dirty rows", () => {
    it("marks rows dirty after writing", () => {
      bridge.writeString("text");
      expect(bridge.isDirtyRow(0)).toBe(true);
    });

    it("clears dirty flags", () => {
      bridge.writeString("text");
      bridge.clearDirty();
      expect(bridge.isDirtyRow(0)).toBe(false);
    });

    it("tracks live row generation independently from dirty clearing", () => {
      const initialGeneration = bridge.getRowGeneration(0);

      bridge.writeString("text");

      const writtenGeneration = bridge.getRowGeneration(0);

      expect(Number.isFinite(initialGeneration)).toBe(true);
      expect(writtenGeneration).not.toBe(initialGeneration);

      bridge.clearDirty();

      expect(bridge.isDirtyRow(0)).toBe(false);
      expect(bridge.getRowGeneration(0)).toBe(writtenGeneration);
    });

    it("changes row generation when rows scroll", () => {
      bridge.resize(80, 3);
      bridge.writeString("row 0\r\nrow 1\r\nrow 2");
      bridge.clearDirty();

      const topGeneration = bridge.getRowGeneration(0);

      bridge.writeString("\r\nrow 3");

      expect(bridge.getRowGeneration(0)).not.toBe(topGeneration);
    });
  });

  describe("resize", () => {
    it("changes cols and rows", () => {
      bridge.resize(40, 12);
      expect(bridge.getCols()).toBe(40);
      expect(bridge.getRows()).toBe(12);
    });

    it("preserves content after resize", () => {
      bridge.writeString("A");
      bridge.resize(40, 12);
      expect(bridge.getCell(0, 0).char).toBe(65);
    });
  });

  describe("SGR attributes", () => {
    it("tracks foreground color", () => {
      bridge.writeString("\x1b[31mR");
      const cell = bridge.getCell(0, 0);
      expect(cell.char).toBe(82); // 'R'
      expect(cell.fg).not.toBe(256); // not default
    });

    it("tracks bold flag", () => {
      bridge.writeString("\x1b[1mB");
      const cell = bridge.getCell(0, 0);
      expect(cell.flags & 0x01).toBe(0x01);
    });
  });

  describe("mode flags", () => {
    it("defaults cursorKeysApp to false", () => {
      expect(bridge.cursorKeysApp()).toBe(false);
    });

    it("enables cursor keys application mode", () => {
      bridge.writeString("\x1b[?1h");
      expect(bridge.cursorKeysApp()).toBe(true);
    });

    it("defaults bracketedPaste to false", () => {
      expect(bridge.bracketedPaste()).toBe(false);
    });

    it("enables bracketed paste mode", () => {
      bridge.writeString("\x1b[?2004h");
      expect(bridge.bracketedPaste()).toBe(true);
    });

    it("defaults usingAltScreen to false", () => {
      expect(bridge.usingAltScreen()).toBe(false);
    });

    it("enters alt screen buffer", () => {
      bridge.writeString("\x1b[?1049h");
      expect(bridge.usingAltScreen()).toBe(true);
    });

    it("exits alt screen buffer", () => {
      bridge.writeString("\x1b[?1049h");
      bridge.writeString("\x1b[?1049l");
      expect(bridge.usingAltScreen()).toBe(false);
    });
  });

  describe("title", () => {
    it("returns null when no title set", () => {
      expect(bridge.getTitle()).toBeNull();
    });

    it("captures OSC title sequence", () => {
      bridge.writeString("\x1b]0;My Title\x07");
      const title = bridge.getTitle();
      expect(title).toBe("My Title");
    });
  });

  describe("scrollback", () => {
    it("starts with zero scrollback", () => {
      expect(bridge.getScrollbackCount()).toBe(0);
    });

    it("tracks scrollback generation separately from live grid updates", () => {
      const initialGeneration = bridge.getScrollbackGeneration();

      bridge.writeString("live only");

      expect(bridge.getScrollbackCount()).toBe(0);
      expect(bridge.getScrollbackGeneration()).toBe(initialGeneration);

      for (let i = 0; i < 30; i++) {
        bridge.writeString(`line ${i}\r\n`);
      }

      expect(bridge.getScrollbackCount()).toBeGreaterThan(0);
      expect(bridge.getScrollbackGeneration()).not.toBe(initialGeneration);
    });

    it("changes scrollback generation when scrollback is reset", () => {
      for (let i = 0; i < 30; i++) {
        bridge.writeString(`line ${i}\r\n`);
      }

      const generationWithScrollback = bridge.getScrollbackGeneration();

      bridge.writeString("\x1b[3J");

      expect(bridge.getScrollbackCount()).toBe(0);
      expect(bridge.getScrollbackGeneration()).not.toBe(generationWithScrollback);
    });

    it("accumulates scrollback when content overflows", () => {
      for (let i = 0; i < 30; i++) {
        bridge.writeString(`line ${i}\r\n`);
      }
      expect(bridge.getScrollbackCount()).toBeGreaterThan(0);
    });

    it("reads scrollback cell data", () => {
      for (let i = 0; i < 30; i++) {
        bridge.writeString(`A\r\n`);
      }
      const count = bridge.getScrollbackCount();
      if (count > 0) {
        const cell = bridge.getScrollbackCell(0, 0);
        expect(cell.char).toBe(65); // 'A'
      }
    });

    it("returns scrollback line length", () => {
      for (let i = 0; i < 30; i++) {
        bridge.writeString(`AB\r\n`);
      }
      const count = bridge.getScrollbackCount();
      if (count > 0) {
        const len = bridge.getScrollbackLineLen(0);
        expect(len).toBeGreaterThan(0);
      }
    });

    it("reports old-width content length when resizing rows into scrollback", () => {
      const url = "https://github.com/openai/codex/releases/latest";
      bridge.writeString(`\x1b[24;1H${url}`);
      bridge.resize(41, 10);

      expect(bridge.getScrollbackCount()).toBeGreaterThan(0);
      expect(bridge.getScrollbackLineLen(0)).toBe(url.length);
      expect(bridge.getScrollbackCell(0, 0).char).toBe("h".charCodeAt(0));
      expect(bridge.getScrollbackCell(0, 41).char).toBe("l".charCodeAt(0));
      expect(bridge.getScrollbackCell(0, url.length - 1).char).toBe(
        "t".charCodeAt(0),
      );
    });

    it("reports wrapped scrollback lines", () => {
      bridge.init(5, 1);
      bridge.writeString("123456");

      expect(bridge.getScrollbackCount()).toBe(1);
      expect(bridge.getScrollbackLineWrapped(0)).toBe(true);
    });

    it("clears row wrapped state when erasing to the line end", () => {
      bridge.resize(3, 3);
      bridge.writeString("ABCD");
      expect(bridge.getRowWrapped(0)).toBe(true);

      bridge.writeString("\x1b[1;2H\x1b[K");

      expect(bridge.getRowWrapped(0)).toBe(false);
    });
  });
});
