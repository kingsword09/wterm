const Cell = @import("cell.zig").Cell;

pub const MAX_COLS: u16 = 256;
pub const MAX_ROWS: u16 = 256;

pub const Grid = struct {
    cells: [MAX_ROWS][MAX_COLS]Cell = undefined,
    cols: u16,
    rows: u16,
    dirty: [MAX_ROWS]u8 = [_]u8{1} ** MAX_ROWS,
    row_generation: [MAX_ROWS]u32 = [_]u32{0} ** MAX_ROWS,
    row_wrapped: [MAX_ROWS]bool = [_]bool{false} ** MAX_ROWS,

    pub fn init(cols: u16, rows: u16) Grid {
        var g = Grid{ .cols = cols, .rows = rows };
        g.clear();
        return g;
    }

    /// Reset an existing grid in-place (no large stack temporaries).
    pub fn reset(self: *Grid, cols: u16, rows: u16) void {
        self.cols = cols;
        self.rows = rows;
        self.clear();
    }

    pub fn getCell(self: *const Grid, row: u16, col: u16) Cell {
        if (row >= self.rows or col >= self.cols) return Cell{};
        return self.cells[row][col];
    }

    pub fn getRowGeneration(self: *const Grid, row: u16) u32 {
        if (row >= self.rows) return 0;
        return self.row_generation[row];
    }

    pub fn markDirtyRow(self: *Grid, row: u16) void {
        if (row >= self.rows) return;
        self.dirty[row] = 1;
        self.row_generation[row] +%= 1;
    }

    pub fn setCell(self: *Grid, row: u16, col: u16, cell: Cell) void {
        if (row >= self.rows or col >= self.cols) return;
        self.cells[row][col] = cell;
        self.markDirtyRow(row);
    }

    pub fn clear(self: *Grid) void {
        var r: u16 = 0;
        while (r < self.rows) : (r += 1) {
            self.clearRow(r);
        }
    }

    pub fn clearRow(self: *Grid, row: u16) void {
        self.clearRowAs(row, Cell{});
    }

    pub fn clearRowAs(self: *Grid, row: u16, blank: Cell) void {
        if (row >= self.rows) return;
        var c: u16 = 0;
        while (c < self.cols) : (c += 1) {
            self.cells[row][c] = blank;
        }
        self.markDirtyRow(row);
        self.row_wrapped[row] = false;
    }

    pub fn clearRange(self: *Grid, row: u16, start_col: u16, end_col: u16) void {
        self.clearRangeAs(row, start_col, end_col, Cell{});
    }

    pub fn clearRangeAs(self: *Grid, row: u16, start_col: u16, end_col: u16, blank: Cell) void {
        if (row >= self.rows) return;
        const end = if (end_col > self.cols) self.cols else end_col;
        var c = start_col;
        while (c < end) : (c += 1) {
            self.cells[row][c] = blank;
        }
        self.markDirtyRow(row);
        if (end == self.cols) {
            self.row_wrapped[row] = false;
        }
    }

    pub fn scrollUp(self: *Grid, top: u16, bottom: u16, count: u16, blank: Cell) void {
        if (count == 0 or top >= bottom) return;
        const n = if (count > bottom - top) bottom - top else count;

        var row = top;
        while (row + n < bottom) : (row += 1) {
            self.cells[row] = self.cells[row + n];
            self.row_wrapped[row] = self.row_wrapped[row + n];
            self.markDirtyRow(row);
        }
        while (row < bottom) : (row += 1) {
            self.clearRowAs(row, blank);
        }
    }

    pub fn scrollDown(self: *Grid, top: u16, bottom: u16, count: u16, blank: Cell) void {
        if (count == 0 or top >= bottom) return;
        const n = if (count > bottom - top) bottom - top else count;
        const span = bottom - top - n;

        var i: u16 = 0;
        while (i < span) : (i += 1) {
            const dst = bottom - 1 - i;
            const src = dst - n;
            self.cells[dst] = self.cells[src];
            self.row_wrapped[dst] = self.row_wrapped[src];
            self.markDirtyRow(dst);
        }
        var row = top;
        while (row < top + n) : (row += 1) {
            self.clearRowAs(row, blank);
        }
    }

    pub fn copyFrom(self: *Grid, source: *const Grid) void {
        self.cols = source.cols;
        self.rows = source.rows;

        var row: u16 = 0;
        while (row < MAX_ROWS) : (row += 1) {
            self.cells[row] = source.cells[row];
            self.dirty[row] = source.dirty[row];
            self.row_generation[row] = source.row_generation[row];
            self.row_wrapped[row] = source.row_wrapped[row];
        }
    }

    pub fn clearDirty(self: *Grid) void {
        var r: u16 = 0;
        while (r < self.rows) : (r += 1) {
            self.dirty[r] = 0;
        }
    }
};
