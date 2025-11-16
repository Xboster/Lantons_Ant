const COLS = 8192;
const ROWS = 8192;
const cellSize = 16;
let zoom = 0.2;
const minZoom = 0.001, maxZoom = 1;
const chunkSize = 512;
let numChunksX, numChunksY;
let chunks = [];
let grid;
let offsetX = 0, offsetY = 0;
let panning = false, lastMouseX = 0, lastMouseY = 0;
let turmites = [];
let gui;
const settings = {
  running: false,
  stepsPerFrame: 1,
  parallel: false,
  turmiteCount: 50,
  clear: () => resetWorld()
};

class Chunk {
  constructor(cx, cy, size) {
    this.cx = cx;
    this.cy = cy;
    this.size = size;
    this.x = cx * size;
    this.y = cy * size;
    this.gfx = createGraphics(size, size);
    this.gfx.noStroke();
    this.dirty = true;
  }

  update() {
    if (!this.dirty) return;
    this.gfx.clear();
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const gx = this.x + i;
        const gy = this.y + j;
        if (gx < COLS && gy < ROWS) {
          if (grid[gx + gy * COLS]) {
            this.gfx.fill(0);
            this.gfx.rect(i, j, 1, 1);
          }
        }
      }
    }
    this.dirty = false;
  }

  draw() {
    const px = this.x * cellSize * zoom + offsetX;
    const py = this.y * cellSize * zoom + offsetY;
    const w = this.size * cellSize * zoom;
    const h = this.size * cellSize * zoom;
    if (px + w < 0 || px > width || py + h < 0 || py > height) return;
    this.update();
    push();
    translate(offsetX, offsetY);
    scale(cellSize * zoom);
    image(this.gfx, this.x, this.y);
    pop();
  }

  markDirty(gx, gy) {
    if (gx >= this.x && gy >= this.y && gx < this.x + this.size && gy < this.y + this.size) {
      this.dirty = true;
    }
  }
}

class Turmite {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.dir = 0;
  }

  step() {
    const idx = this.x + this.y * COLS;
    const cell = grid[idx];
    const turn = cell ? -1 : 1;
    this.dir = (this.dir + turn + 4) % 4;
    grid[idx] = 1 - cell;

    let nx = this.x, ny = this.y;
    switch (this.dir) {
      case 0: ny = (this.y - 1 + ROWS) % ROWS; break;
      case 1: nx = (this.x + 1) % COLS; break;
      case 2: ny = (this.y + 1) % ROWS; break;
      case 3: nx = (this.x - 1 + COLS) % COLS; break;
    }

    const old = { x: this.x, y: this.y };
    this.x = nx; this.y = ny;
    return { old, newPos: { x: nx, y: ny } };
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  noSmooth();
  grid = new Uint8Array(COLS * ROWS);

  numChunksX = Math.ceil(COLS / chunkSize);
  numChunksY = Math.ceil(ROWS / chunkSize);

  for (let cx = 0; cx < numChunksX; cx++) {
    const row = [];
    for (let cy = 0; cy < numChunksY; cy++) {
      row.push(new Chunk(cx, cy, chunkSize));
    }
    chunks.push(row);
  }

  initTurmites(settings.turmiteCount);
  initUI();

  offsetX = -(COLS * cellSize * zoom) / 2 + width / 2;
  offsetY = -(ROWS * cellSize * zoom) / 2 + height / 2;

  canvas.oncontextmenu = () => false;
}

function initTurmites(n) {
  turmites = [];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(COLS / 2);
    const y = Math.floor(ROWS / 2);
    turmites.push(new Turmite(x, y));
  }
}

function resetWorld() {
  grid.fill(0);
  chunks.forEach(row => row.forEach(ch => ch.dirty = true));
}

function initUI() {
  gui = new lil.GUI({ title: 'Langton Ant' });
  gui.add(settings, 'running').name('Running');
  gui.add(settings, 'parallel').name('Parallel Steps');
  gui.add(settings, 'stepsPerFrame', 1, 65536, 1).name('Steps / Frame');
  gui.add(settings, 'turmiteCount', 1, 500, 1).name('Turmites').onFinishChange(v => initTurmites(v));
  gui.add(settings, 'clear').name('Clear Grid');
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.left = '10px';
  gui.domElement.style.top = '10px';
  gui.close();
}

let pendingSteps = 0;
function draw() {
  background(255);
  if (!settings.running) {
    drawChunks();
    drawTurmites();
    return;
  }

  pendingSteps += settings.stepsPerFrame;
  const startTime = performance.now();
  const maxFrameTime = 1000 / 60;

  while (pendingSteps > 0) {
    turmites.forEach(t => {
      const step = t.step();
      markChunkDirty(step.old.x, step.old.y);
      markChunkDirty(step.newPos.x, step.newPos.y);
    });

    pendingSteps--;
    if (performance.now() - startTime > maxFrameTime) break;
  }

  drawChunks();
  drawTurmites();
}

function markChunkDirty(gx, gy) {
  const cx = Math.floor(gx / chunkSize);
  const cy = Math.floor(gy / chunkSize);
  if (chunks[cx] && chunks[cx][cy]) chunks[cx][cy].markDirty(gx, gy);
}

function drawChunks() {
  for (let cx = 0; cx < numChunksX; cx++) {
    for (let cy = 0; cy < numChunksY; cy++) {
      chunks[cx][cy].draw();
    }
  }
}

function drawTurmites() {
  push();
  translate(offsetX, offsetY);
  scale(cellSize * zoom);
  noStroke();
  fill(255, 0, 0);
  turmites.forEach(t => rect(t.x, t.y, 1, 1));
  pop();
}

function isMouseOverGUI() {
  const rect = gui.domElement.getBoundingClientRect();
  return mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom;
}

function mousePressed() {
  if (isMouseOverGUI()) return;
  if (mouseButton === RIGHT || mouseButton === CENTER) {
    panning = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  } else if (mouseButton === LEFT) {
    toggleCellAtMouse();
  }
}

function mouseDragged() {
  if (isMouseOverGUI()) return;
  if (panning) {
    offsetX += mouseX - lastMouseX;
    offsetY += mouseY - lastMouseY;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
}

function mouseReleased() { panning = false; }

function mouseWheel(e) {
  if (isMouseOverGUI()) return false;
  const oldZoom = zoom;
  zoom = constrain(zoom * (1 - e.deltaY * 0.0015), minZoom, maxZoom);
  offsetX -= (mouseX - offsetX) * (zoom / oldZoom - 1);
  offsetY -= (mouseY - offsetY) * (zoom / oldZoom - 1);
  return false;
}

function toggleCellAtMouse() {
  const gx = Math.floor((mouseX - offsetX) / (cellSize * zoom));
  const gy = Math.floor((mouseY - offsetY) / (cellSize * zoom));
  if (gx >= 0 && gy >= 0 && gx < COLS && gy < ROWS) {
    grid[gx + gy * COLS] = 1 - grid[gx + gy * COLS];
    markChunkDirty(gx, gy);
  }
}

function keyPressed() {
  if (key === ' ') settings.running = !settings.running;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
