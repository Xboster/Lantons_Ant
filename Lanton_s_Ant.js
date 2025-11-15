// =====================
// Global Variables
// =====================
let cols = 8192, rows = 8192;
let grid;
let cellSize = 64;
let zoom = 0.2;
const minZoom = 0.001, maxZoom = 1;

let offsetX = 0, offsetY = 0;
let panning = false;
let lastMouseX = 0, lastMouseY = 0;

let antX, antY, antDir = 0;
let pendingSteps = 0;

let tiles = [];
const tileSize = 256; // tile in grid cells
let numTilesX = Math.ceil(cols / tileSize);
let numTilesY = Math.ceil(rows / tileSize);

let gui;
let settings = {
  running: false,
  stepsPerFrame: 1,
  stepsLinear: Math.log10(1000) / Math.log10(10000),
  get stepsDisplay() { return this.stepsPerFrame; },
  reset: () => {
    initGrid();
    tiles.forEach(row => row.forEach(tile => tile.dirty = true));
    settings.running = false;
    settings._controllers.runningController.updateDisplay();
  }
};

// =====================
// Tile Class
// =====================
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

    // Draw the ant if it is inside this tile
    const antTileX = Math.floor(antX / tileSize);
    const antTileY = Math.floor(antY / tileSize);
    if (antTileX === Math.floor(this.x / tileSize) && antTileY === Math.floor(this.y / tileSize)) {
      const localX = antX - this.x;
      const localY = antY - this.y;
      this.graphics.fill(255, 50, 50);
      this.graphics.noStroke();
      this.graphics.rect(localX, localY, 1, 1);
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

// =====================
// Setup & Initialization
// =====================
function setup() {
  createCanvas(windowWidth, windowHeight);
  noSmooth();
  document.body.style.margin = 0;
  document.body.style.overflow = "hidden";

  initGrid();
  initTiles();
  initUI();

  offsetX = -(cols * cellSize * zoom) / 2 + width / 2;
  offsetY = -(rows * cellSize * zoom) / 2 + height / 2;

  canvas.oncontextmenu = () => false;
}

function initTiles() {
  tiles = [];
  for (let tx = 0; tx < numTilesX; tx++) {
    const row = [];
    for (let ty = 0; ty < numTilesY; ty++) {
      row.push(new Tile(tx * tileSize, ty * tileSize, tileSize));
    }
    tiles.push(row);
  }
}

let stepsController;

function initUI() {
  gui = new lil.GUI({ title: "Langton's Ant Controls" });

  const runningController = gui.add(settings, "running").name("Running");

  // --- Step mode dropdown ---
  settings.stepMode = "Power of 2";
  const stepModeController = gui.add(settings, "stepMode", ["Power of 2", "Linear"])
    .name("Step Mode")
    .onChange(updateStepsController);

  // --- Single backing property for GUI ---
  settings._stepsSliderValue = 1; // starts at 1

  stepsController = gui.add(settings, "_stepsSliderValue", 1, 1048576, 1)
    .name("Steps / Frame")
    .onChange(updateStepsPerFrame);

  const stepButton = {
    stepOnce: () => {
      for (let i = 0; i < settings.stepsPerFrame; i++) stepAnt();
      drawCells(); // refresh immediately
    }
  };
  gui.add(stepButton, "stepOnce").name("Step Once");

  function updateStepsController() {
    const input = stepsController.domElement.querySelector('input[type="number"]');

    if (settings.stepMode === "Power of 2") {
      // Slider steps in powers of 2
      stepsController.min(0);
      stepsController.max(20);
      stepsController.step(1);
      if (input) input.value = settings.stepsPerFrame;
    } else {
      // Linear slider
      stepsController.min(1);
      stepsController.max(1000000);
      stepsController.step(1);
      if (input) input.value = settings.stepsPerFrame;
    }
    updateStepsPerFrame(stepsController.getValue());
  }

  function updateStepsPerFrame(val) {
    if (settings.stepMode === "Power of 2") {
      settings.stepsPerFrame = Math.pow(2, Math.round(val));
      // Update text input box to show actual step count
      const input = stepsController.domElement.querySelector('input[type="number"]');
      if (input) input.value = settings.stepsPerFrame;
    } else {
      settings.stepsPerFrame = Math.round(val);
    }
  }

  updateStepsController();

  // --- Zoom slider ---
  settings.zoomLinear = Math.log10(zoom / minZoom) / Math.log10(maxZoom / minZoom);
  const zoomController = gui.add(settings, "zoomLinear", 0, 1, 0.001)
    .name("Zoom")
    .onChange(updateZoomFromSlider);

  function updateZoomFromSlider(val) {
    const canvasCenterX = width / 2;
    const canvasCenterY = height / 2;
    const oldZoom = zoom;
    zoom = minZoom * Math.pow(maxZoom / minZoom, val);
    offsetX -= (canvasCenterX - offsetX) * (zoom / oldZoom - 1);
    offsetY -= (canvasCenterY - offsetY) * (zoom / oldZoom - 1);
    updateZoomDisplay();
  }

  function updateZoomDisplay() {
    const input = zoomController.domElement.querySelector('input[type="number"]');
    if (input) input.value = zoom.toFixed(3);
  }
  updateZoomDisplay();

  const resetController = gui.add(settings, "reset").name("Clear Grid");

  gui.domElement.style.position = "absolute";
  gui.domElement.style.left = "10px";
  gui.domElement.style.top = "10px";
  gui.width = 300;
  gui.close();

  settings._controllers = { runningController, stepsController, zoomController, resetController, stepModeController };
}

// =====================
// Grid & Ant Initialization
// =====================
function initGrid() {
  grid = new Uint8Array(cols * rows); // flat typed array
  antX = Math.floor(cols / 2);
  antY = Math.floor(rows / 2);
  antDir = 0;
}

// =====================
// Drawing Functions
// =====================
function draw() {
  background(30);

  if (!settings.running) {
    drawCells();
    return;
  }

  pendingSteps += settings.stepsPerFrame;

  const startTime = performance.now();
  const maxFrameTime = 1000 / 60; // limit to ~60 FPS

  while (pendingSteps > 0) {
    stepAnt();
    pendingSteps--;

    if (performance.now() - startTime > maxFrameTime) break;
  }

  drawCells();
}


function drawCells() {
  for (let tx = 0; tx < numTilesX; tx++) {
    for (let ty = 0; ty < numTilesY; ty++) {
      const tile = tiles[tx][ty];
      tile.update();
      tile.draw();
    }
  }

  push();
  translate(offsetX, offsetY);
  scale(cellSize * zoom);
  stroke(255, 150);
  strokeWeight(1 / (cellSize * zoom));
  noFill();
  rect(0, 0, cols, rows);
  pop();
}

// =====================
// Ant Logic
// =====================
function stepAnt() {
  const oldX = antX;
  const oldY = antY;

  const oldIndex = oldX + oldY * cols;
  grid[oldIndex] = 1 - grid[oldIndex];

  const oldTileX = Math.floor(oldX / tileSize);
  const oldTileY = Math.floor(oldY / tileSize);
  tiles[oldTileX][oldTileY].dirty = true;

  antDir = (antDir + (grid[oldIndex] === 1 ? 1 : 3)) % 4;
  if (antDir === 0) antY--;
  else if (antDir === 1) antX++;
  else if (antDir === 2) antY++;
  else if (antDir === 3) antX--;

  antX = (antX + cols) % cols;
  antY = (antY + rows) % rows;

  const newTileX = Math.floor(antX / tileSize);
  const newTileY = Math.floor(antY / tileSize);
  tiles[newTileX][newTileY].dirty = true;
}

// =====================
// Mouse / Input Handling
// =====================
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
    toggleCell();
  }
}

function mouseDragged() {
  if (isMouseOverGUI()) return;
  if (panning) {
    offsetX += mouseX - lastMouseX;
    offsetY += mouseY - lastMouseY;
    lastMouseX = mouseX;
    lastMouseY = mouseY;

    constrainOffsets();
  }
}

function mouseReleased() { panning = false; }

function toggleCell() {
  const cs = cellSize;
  const gx = Math.floor((mouseX - offsetX) / (cs * zoom));
  const gy = Math.floor((mouseY - offsetY) / (cs * zoom));

  if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
    const index = gx + gy * cols;
    grid[index] = 1 - grid[index];

    const tileX = Math.floor(gx / tileSize);
    const tileY = Math.floor(gy / tileSize);
    tiles[tileX][tileY].dirty = true;
  }
}

// =====================
// Mouse Wheel Zoom
// =====================
function mouseWheel(e) {
  if (isMouseOverGUI()) return false;

  const old = zoom;
  zoom = constrain(zoom * (1 - e.deltaY * 0.0015), minZoom, maxZoom);

  offsetX -= (mouseX - offsetX) * (zoom / old - 1);
  offsetY -= (mouseY - offsetY) * (zoom / old - 1);

  constrainOffsets();

  settings.zoomLinear = Math.log10(zoom / minZoom) / Math.log10(maxZoom / minZoom);
  if (settings._controllers?.zoomController) {
    settings._controllers.zoomController.updateDisplay();
  }

  return false;
}

// =====================
// Keyboard Handling
// =====================
function keyPressed() {
  if (key === " ") {
    settings.running = !settings.running;
    settings._controllers?.runningController.updateDisplay();
    settings._controllers?.zoomController.updateDisplay();
    settings._controllers?.stepsController.updateDisplay();
  }
  if (key === "C" || key === "c") settings.reset();
}

function constrainOffsets() {
  const scaledWidth = cols * cellSize * zoom;
  const scaledHeight = rows * cellSize * zoom;

  const maxOffscreenX = scaledWidth * 0.5;
  const maxOffscreenY = scaledHeight * 0.5;

  const minX = Math.min(width - maxOffscreenX, width / 2 - scaledWidth);
  const maxX = Math.max(maxOffscreenX, width / 2);
  const minY = Math.min(height - maxOffscreenY, height / 2 - scaledHeight);
  const maxY = Math.max(maxOffscreenY, height / 2);

  offsetX = constrain(offsetX, minX, maxX);
  offsetY = constrain(offsetY, minY, maxY);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
