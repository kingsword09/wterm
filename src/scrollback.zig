const cell_mod = @import("cell.zig");
const grid_mod = @import("grid.zig");
const Cell = cell_mod.Cell;

pub const MAX_SCROLLBACK_LINES: u32 = 1000;

pub const ScrollbackLine = struct {
    cells: [grid_mod.MAX_COLS]Cell = undefined,
    len: u16 = 0,
    wrapped: bool = false,
};

pub const Scrollback = struct {
    lines: [MAX_SCROLLBACK_LINES]ScrollbackLine = undefined,
    count: u32 = 0,
    write_pos: u32 = 0,

    /// Reset counters without touching the lines array (avoids large stack copies).
    pub fn reset(self: *Scrollback) void {
        self.count = 0;
        self.write_pos = 0;
    }

    pub fn push(self: *Scrollback, row: []const Cell, scan_len: u16, wrapped: bool) void {
        var line = &self.lines[self.write_pos];
        const line_len = measureLineLen(row, scan_len);
        var i: u16 = 0;
        while (i < line_len) : (i += 1) {
            line.cells[i] = row[i];
        }
        line.len = line_len;
        line.wrapped = wrapped;

        self.write_pos = (self.write_pos + 1) % MAX_SCROLLBACK_LINES;
        if (self.count < MAX_SCROLLBACK_LINES) {
            self.count += 1;
        }
    }

    fn measureLineLen(row: []const Cell, scan_len: u16) u16 {
        const row_limit: u16 = if (row.len > grid_mod.MAX_COLS) grid_mod.MAX_COLS else @intCast(row.len);
        const scan_limit = if (scan_len > row_limit) row_limit else scan_len;

        var col = scan_limit;
        while (col > 0) {
            col -= 1;
            const cell = row[col];

            if (cell.width == cell_mod.WIDTH_SPACER) continue;

            if (isRenderableCell(cell)) {
                const display_width: u16 = if (cell.width == cell_mod.WIDTH_WIDE and
                    col + 1 < scan_limit and
                    row[col + 1].width == cell_mod.WIDTH_SPACER)
                    2
                else
                    1;
                return col + display_width;
            }
        }

        return 0;
    }

    fn isRenderableCell(cell: Cell) bool {
        return cell.char != ' ' or
            cell.fg != cell_mod.DEFAULT_COLOR or
            cell.bg != cell_mod.DEFAULT_COLOR or
            cell.flags != 0 or
            (cell.width != cell_mod.WIDTH_NARROW and cell.width != cell_mod.WIDTH_SPACER);
    }

    pub fn getLine(self: *const Scrollback, offset: u32) ?*const ScrollbackLine {
        if (offset >= self.count) return null;
        const idx = if (self.count < MAX_SCROLLBACK_LINES)
            self.count - 1 - offset
        else
            (self.write_pos + MAX_SCROLLBACK_LINES - 1 - offset) % MAX_SCROLLBACK_LINES;
        return &self.lines[idx];
    }
};

test "scrollback stores content width instead of scanned width" {
    const testing = @import("std").testing;
    var sb = Scrollback{};
    var row = [_]Cell{.{}} ** grid_mod.MAX_COLS;

    row[4] = Cell{ .char = 'A' };
    row[9] = Cell{ .char = ' ' };

    sb.push(&row, 20, false);

    const line = sb.getLine(0).?;
    try testing.expectEqual(@as(u16, 5), line.len);
    try testing.expectEqual(@as(u32, 'A'), line.cells[4].char);
}

test "scrollback preserves styled blanks and wide cells" {
    const testing = @import("std").testing;
    var sb = Scrollback{};
    var row = [_]Cell{.{}} ** grid_mod.MAX_COLS;

    row[2] = Cell{ .char = '你', .width = cell_mod.WIDTH_WIDE };
    row[3] = Cell{ .width = cell_mod.WIDTH_SPACER };
    row[7] = Cell{ .bg = 1 };

    sb.push(&row, 20, false);

    const line = sb.getLine(0).?;
    try testing.expectEqual(@as(u16, 8), line.len);
    try testing.expectEqual(@as(u32, '你'), line.cells[2].char);
    try testing.expectEqual(cell_mod.WIDTH_SPACER, line.cells[3].width);
    try testing.expectEqual(@as(u16, 1), line.cells[7].bg);
}
