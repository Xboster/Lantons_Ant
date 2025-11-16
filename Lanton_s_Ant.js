const COLS = 512;
const ROWS = 512;
const cellSize = 16;
let zoom = 0.2;
const minZoom = 0.001, maxZoom = 1;
const chunkSize = 64;
let numChunksX, numChunksY;
let chunks = [];
let grid;
let pendingSteps = 0;
let offsetX = 0, offsetY = 0;
let lastCellX = null, lastCellY = null, isDrawing = false;
let isPanning = false, lastMouseX = 0, lastMouseY = 0;
let turmites = [];
let gui;
const settings = {
  running: false,
  stepsPerFrame: 1,
  parallel: false,
  stepsLinear: Math.log10(1000) / Math.log10(10000),
  get stepsDisplay() { return this.stepsPerFrame; },
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

  document.body.style.margin = 0;
  document.body.style.overflow = "hidden";
  canvas.oncontextmenu = () => false;

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

  initTurmites(999);
  initUI();

  offsetX = -(COLS * cellSize * zoom) / 2 + width / 2;
  offsetY = -(ROWS * cellSize * zoom) / 2 + height / 2;

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
  gui = new lil.GUI({ title: 'Langton Ant Controls' });

  const runningController = gui.add(settings, 'running').name('Running');

  // --- Step mode dropdown ---
  settings.stepMode = 'Power of 2';
  const stepModeController = gui.add(settings, 'stepMode', ['Power of 2', 'Linear'])
    .name('Step Mode')
    .onChange(updateStepsController);

  // --- Steps per frame slider ---
  settings._stepsSliderValue = 0; // 2^0 = 1 step
  const stepsController = gui.add(settings, '_stepsSliderValue', 0, 20, 1)
    .name('Steps / Frame')
    .onChange(updateStepsPerFrame);

  function updateStepsController() {
    if (settings.stepMode === 'Power of 2') {
      stepsController.min(0);
      stepsController.max(20);
      stepsController.step(1);
    } else {
      stepsController.min(1);
      stepsController.max(1000000);
      stepsController.step(1);
    }
    updateStepsPerFrame(stepsController.getValue());
  }

  function updateStepsPerFrame(val) {
    if (settings.stepMode === "Power of 2") {
      settings.stepsPerFrame = Math.pow(2, Math.round(val));
    } else {
      settings.stepsPerFrame = Math.round(val);
    }

    // Reset queued steps to avoid leftover backlog
    pendingSteps = 0;
  }

  updateStepsController();

  // --- Step Once button ---
  gui.add({
    stepOnce: () => {
      for (let i = 0; i < settings.stepsPerFrame; i++) {
        turmites.forEach(t => {
          const step = t.step();
          markChunkDirty(step.old.x, step.old.y);
          markChunkDirty(step.newPos.x, step.newPos.y);
        });
      }
    }
  }, 'stepOnce').name('Step Once');

  gui.add(settings, 'parallel').name('Parallel Steps');
  // gui.add(settings, 'turmiteCount', 1, 500, 1).name('Turmites').onFinishChange(v => initTurmites(v));
  gui.add(settings, 'clear').name('Clear Grid');

  // --- Zoom slider ---
  settings.zoomLinear = Math.log10(zoom / minZoom) / Math.log10(maxZoom / minZoom);
  const zoomController = gui.add(settings, 'zoomLinear', 0, 1, 0.001)
    .name('Zoom')
    .onChange(val => {
      const canvasCenterX = width / 2;
      const canvasCenterY = height / 2;
      const oldZoom = zoom;
      zoom = minZoom * Math.pow(maxZoom / minZoom, val);
      offsetX -= (canvasCenterX - offsetX) * (zoom / oldZoom - 1);
      offsetY -= (canvasCenterY - offsetY) * (zoom / oldZoom - 1);
    });

  gui.domElement.style.position = 'absolute';
  gui.domElement.style.left = '10px';
  gui.domElement.style.top = '10px';
  gui.close();

  settings._controllers = { runningController, stepsController, zoomController, stepModeController };
}

function draw() {
  background(30);

  // Always draw when paused
  if (!settings.running) {
    drawChunks();
    drawTurmites();
    drawBorder();
    return;
  }

  // Accumulate steps for this frame
  pendingSteps += settings.stepsPerFrame;

  const startTime = performance.now();
  const maxFrameTime = 1000 / 60; // ~16.67ms per frame

  // Process steps but cap to avoid long freezes
  const MAX_STEPS_PER_FRAME = 10000;
  let stepsProcessed = 0;

  while (pendingSteps > 0 && stepsProcessed < MAX_STEPS_PER_FRAME) {
    // Sequential stepping
    turmites.forEach(t => {
      const step = t.step(grid); // returns old & new positions
      markChunkDirty(step.old.x, step.old.y);
      markChunkDirty(step.newPos.x, step.newPos.y);
    });

    pendingSteps--;
    stepsProcessed++;

    // Stop if we exceed max frame time
    if (performance.now() - startTime > maxFrameTime) break;
  }

  // Draw updated grid and turmites
  drawChunks();
  drawTurmites();
  drawBorder();
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

function drawBorder() {
  push();
  translate(offsetX, offsetY);
  scale(cellSize * zoom);
  stroke(255, 150);
  strokeWeight(1 / (cellSize * zoom));
  noFill();
  rect(0, 0, COLS, ROWS);
  pop();
}

function constrainOffsets() {
  const scaledWidth = COLS * cellSize * zoom;
  const scaledHeight = ROWS * cellSize * zoom;

  const maxOffscreenX = scaledWidth * 0.5;
  const maxOffscreenY = scaledHeight * 0.5;

  const minX = Math.min(width - maxOffscreenX, width / 2 - scaledWidth);
  const maxX = Math.max(maxOffscreenX, width / 2);
  const minY = Math.min(height - maxOffscreenY, height / 2 - scaledHeight);
  const maxY = Math.max(maxOffscreenY, height / 2);

  offsetX = constrain(offsetX, minX, maxX);
  offsetY = constrain(offsetY, minY, maxY);
}

function isMouseOverGUI() {
  const rect = gui.domElement.getBoundingClientRect();
  return mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom;
}

function mousePressed() {
  if (isMouseOverGUI()) return;
  // console.log("mousePressed", mouseButton, mouseX, mouseY);
  if (mouseButton === LEFT) {
    isDrawing = true;
    toggleCellUnderCursor();
  }

  if (mouseButton === RIGHT || mouseButton === CENTER) {
    isPanning = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
}


function mouseDragged() {
  if (isPanning && (mouseButton === RIGHT || mouseButton === CENTER)) {
    offsetX += mouseX - lastMouseX;
    offsetY += mouseY - lastMouseY;

    lastMouseX = mouseX;
    lastMouseY = mouseY;

    constrainOffsets();
    return;
  }

  // Drawing
  if (isDrawing && mouseButton === LEFT) {
    toggleCellUnderCursor();
  }
}

function mouseReleased() {
  if (mouseButton === LEFT) {
    isDrawing = false;
    lastCellX = null;
    lastCellY = null;
  }

  if (mouseButton === RIGHT || mouseButton === CENTER) {
    isPanning = false;
  }
}

function mouseWheel(e) {
  if (isMouseOverGUI()) return false;

  const oldZoom = zoom;
  zoom = constrain(zoom * (1 - e.deltaY * 0.0015), minZoom, maxZoom);

  // Determine zoom focal point
  let focalX, focalY;

  if (mouseIsPressed && mouseButton === RIGHT) {
    // Precise zoom toward mouse
    focalX = mouseX;
    focalY = mouseY;
  } else {
    // Normal zoom toward screen center
    focalX = width / 2;
    focalY = height / 2;
  }

  // Adjust offsets so the focal point stays stable through zoom
  offsetX -= (focalX - offsetX) * (zoom / oldZoom - 1);
  offsetY -= (focalY - offsetY) * (zoom / oldZoom - 1);

  // Keep grid on screen
  constrainOffsets();

  // Update GUI slider
  settings.zoomLinear =
    Math.log10(zoom / minZoom) / Math.log10(maxZoom / minZoom);

  if (settings._controllers?.zoomController) {
    settings._controllers.zoomController.updateDisplay();
  }

  return false;
}

function toggleCellUnderCursor() {
  // Convert screen → world
  const worldX = (mouseX - offsetX) / (cellSize * zoom);
  const worldY = (mouseY - offsetY) / (cellSize * zoom);

  const cx = Math.floor(worldX);
  const cy = Math.floor(worldY);

  // Debug log AFTER declaration
  // console.log("Toggle cell at:", cx, cy);

  // Correct bounds check
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;

  // Only toggle new cells
  if (cx === lastCellX && cy === lastCellY) return;

  // Toggle
  grid[cy * COLS + cx] = grid[cy * COLS + cx] ? 0 : 1;

  markChunkDirty(cx, cy);

  // Remember for drag mode
  lastCellX = cx;
  lastCellY = cy;
}

function keyPressed() {
  if (key === " ") {
    settings.running = !settings.running;
    settings._controllers?.runningController.updateDisplay();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
