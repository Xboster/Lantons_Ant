class Tile {
    constructor(x, y, size) {
        this.x = x; // tile coordinates in grid
        this.y = y;
        this.size = size; // size in cells
        this.graphics = createGraphics(size, size);
        this.graphics.noStroke();
        this.dirty = true;
    }

    update() {
        if (!this.dirty) return;
        this.graphics.clear();

        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const gx = this.x + i;
                const gy = this.y + j;

                if (gx < cols && gy < rows) {
                    const index = gx + gy * cols;
                    if (grid[index]) {
                        this.graphics.fill(0);
                        this.graphics.rect(i, j, 1, 1);
                    }
                }
            }
        }

        // Draw all turmites inside this tile
        for (const ant of turmites) {
            const antTileX = Math.floor(ant.x / tileSize);
            const antTileY = Math.floor(ant.y / tileSize);

            if (antTileX === Math.floor(this.x / tileSize) &&
                antTileY === Math.floor(this.y / tileSize)) {
                const localX = ant.x - this.x;
                const localY = ant.y - this.y;
                this.graphics.fill(255, 50, 50);
                this.graphics.noStroke();
                this.graphics.rect(localX, localY, 1, 1);
            }
        }

        this.dirty = false;
    }

    draw() {
        if (!this.isVisible()) return;

        push();
        translate(offsetX, offsetY);
        scale(cellSize * zoom);
        image(this.graphics, this.x, this.y);
        pop();
    }

    isVisible() {
        const px = this.x * cellSize * zoom + offsetX;
        const py = this.y * cellSize * zoom + offsetY;
        const w = this.size * cellSize * zoom;
        const h = this.size * cellSize * zoom;
        return !(px + w < 0 || px > width || py + h < 0 || py > height);
    }
}
