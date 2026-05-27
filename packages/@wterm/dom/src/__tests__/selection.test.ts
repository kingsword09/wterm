import { describe, expect, it, afterEach } from "vitest";

import {
  clearTerminalSelection,
  getTerminalSelectionText,
  hasTerminalSelection,
} from "../selection.js";

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

function selectNodeContents(node: Node): void {
  const selection = document.getSelection();
  const range = document.createRange();

  range.selectNodeContents(node);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe("terminal selection helpers", () => {
  it("returns normalized selection text from inside the terminal", () => {
    const terminal = document.createElement("div");
    terminal.innerHTML =
      '<div class="term-row">hello   </div><div class="term-row">world</div>';
    document.body.appendChild(terminal);

    selectNodeContents(terminal);

    expect(hasTerminalSelection(terminal)).toBe(true);
    expect(getTerminalSelectionText(terminal)).toBe("hello\nworld");
  });

  it("joins soft-wrapped terminal rows without adding a newline", () => {
    const terminal = document.createElement("div");
    terminal.innerHTML =
      '<div class="term-row" data-wrapped="true">hello</div><div class="term-row">world</div>';
    document.body.appendChild(terminal);

    selectNodeContents(terminal);

    expect(getTerminalSelectionText(terminal)).toBe("helloworld");
  });

  it("ignores selections outside the terminal", () => {
    const terminal = document.createElement("div");
    const outside = document.createElement("div");

    terminal.textContent = "inside";
    outside.textContent = "outside";
    document.body.append(terminal, outside);

    selectNodeContents(outside);

    expect(hasTerminalSelection(terminal)).toBe(false);
    expect(getTerminalSelectionText(terminal)).toBe("");
  });

  it("clears only terminal-owned selections", () => {
    const terminal = document.createElement("div");
    terminal.textContent = "copy me";
    document.body.appendChild(terminal);

    selectNodeContents(terminal);
    clearTerminalSelection(terminal);

    expect(document.getSelection()?.rangeCount).toBe(0);
  });
});
