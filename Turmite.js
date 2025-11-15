class Turmite {
    constructor(x, y, cols, rows) {
        this.x = x;
        this.y = y;
        this.dir = 0; // 0 = up, 1 = right, 2 = down, 3 = left
        this.cols = cols;
        this.rows = rows;
    }

    // Step immediately (for sequential)
    step(grid) {
        const index = this.x + this.y * this.cols;
        const cell = grid[index];

        // Decide turn: black = left, white = right
        const turn = cell ? -1 : 1;
        this.dir = (this.dir + turn + 4) % 4;

        // Flip the cell
        grid[index] = 1 - cell;

        // Move
        const [dx, dy] = Turmite.dirToDelta(this.dir);
        this.x = (this.x + dx + this.cols) % this.cols;
        this.y = (this.y + dy + this.rows) % this.rows;

        return { x: this.x, y: this.y };
    }

    // Prepare next step info (for parallel)
    nextStep(grid) {
        const index = this.x + this.y * this.cols;
        const cell = grid[index];
        const turn = cell ? -1 : 1;
        const newDir = (this.dir + turn + 4) % 4;
        const [dx, dy] = Turmite.dirToDelta(newDir);
        const newX = (this.x + dx + this.cols) % this.cols;
        const newY = (this.y + dy + this.rows) % this.rows;
        const newCell = 1 - cell;
        return { newX, newY, newDir, newCell, index };
    }

    // Apply prepared step (for parallel)
    applyStep(stepInfo, grid) {
        this.x = stepInfo.newX;
        this.y = stepInfo.newY;
        this.dir = stepInfo.newDir;
        grid[stepInfo.index] = stepInfo.newCell;
        return { x: this.x, y: this.y };
    }

    static dirToDelta(dir) {
        switch (dir) {
            case 0: return [0, -1];
            case 1: return [1, 0];
            case 2: return [0, 1];
            case 3: return [-1, 0];
        }
    }
}
