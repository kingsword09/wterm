function resolveSelection(element: HTMLElement): Selection | null {
  return element.ownerDocument.getSelection?.() ?? null;
}

function isNodeInside(element: HTMLElement, node: Node | null): boolean {
  return node === element || (node !== null && element.contains(node));
}

function selectionBelongsToElement(
  element: HTMLElement,
  selection: Selection,
): boolean {
  if (selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }

  return (
    isNodeInside(element, selection.anchorNode) &&
    isNodeInside(element, selection.focusNode)
  );
}

function normalizeSelectionText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

function rangeIntersectsNode(range: Range, node: Node): boolean {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function extractRowSelectionText(row: HTMLElement, range: Range): string {
  const rowRange = row.ownerDocument.createRange();

  rowRange.selectNodeContents(row);

  if (range.compareBoundaryPoints(Range.START_TO_START, rowRange) > 0) {
    rowRange.setStart(range.startContainer, range.startOffset);
  }

  if (range.compareBoundaryPoints(Range.END_TO_END, rowRange) < 0) {
    rowRange.setEnd(range.endContainer, range.endOffset);
  }

  return rowRange.toString();
}

function extractTerminalRowSelectionText(
  element: HTMLElement,
  selection: Selection,
): string | null {
  const rows = Array.from(element.querySelectorAll<HTMLElement>(".term-row"));

  if (rows.length === 0 || selection.rangeCount === 0) {
    return null;
  }

  let text = "";
  let hasText = false;
  let previousRowIndex = -1;
  let previousRowWrapped = false;

  for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
    const range = selection.getRangeAt(rangeIndex);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!rangeIntersectsNode(range, row)) {
        continue;
      }

      if (hasText) {
        text +=
          previousRowWrapped && rowIndex === previousRowIndex + 1 ? "" : "\n";
      }
      text += extractRowSelectionText(row, range);
      hasText = true;
      previousRowIndex = rowIndex;
      previousRowWrapped = row.dataset.wrapped === "true";
    }
  }

  return hasText ? text : null;
}

export function getTerminalSelectionText(element: HTMLElement): string {
  const selection = resolveSelection(element);

  if (!selection || !selectionBelongsToElement(element, selection)) {
    return "";
  }

  return normalizeSelectionText(
    extractTerminalRowSelectionText(element, selection) ?? selection.toString(),
  );
}

export function hasTerminalSelection(element: HTMLElement): boolean {
  return getTerminalSelectionText(element).length > 0;
}

export function clearTerminalSelection(element: HTMLElement): void {
  const selection = resolveSelection(element);

  if (!selection || !selectionBelongsToElement(element, selection)) {
    return;
  }

  selection.removeAllRanges();
}
