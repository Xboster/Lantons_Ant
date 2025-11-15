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

let turmites = [];

function initTurmites(n = 1) {
  turmites = [];
  for (let i = 0; i < n; i++) {
    turmites.push(new Turmite(
      Math.floor(cols / 2),
      Math.floor(rows / 2),
      cols,
      rows
    ));
  }
}

let pendingSteps = 0;

let tiles = [];
const tileSize = 256; // tile in grid cells
let numTilesX = Math.ceil(cols / tileSize);
let numTilesY = Math.ceil(rows / tileSize);

let gui;
let settings = {
  running: false,
  stepsPerFrame: 1,
  parallelSteps: false,
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
// Setup & Initialization
// =====================
function setup() {
  createCanvas(windowWidth, windowHeight);
  noSmooth();
  document.body.style.margin = 0;
  document.body.style.overflow = "hidden";

  initGrid();
  initTurmites(3);
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
  settings._stepsSliderValue = 0; // 2^0 = 1 step

  stepsController = gui.add(settings, "_stepsSliderValue", 1, 1048576, 1)
    .name("Steps / Frame")
    .onChange(updateStepsPerFrame);

  const stepButton = {
    stepOnce: () => {
      for (let i = 0; i < settings.stepsPerFrame; i++) stepTurmites();
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
      stepsController.name("Steps / Frame");
      if (input) input.value = settings.stepsPerFrame;
    }

    updateStepsPerFrame(stepsController.getValue());
  }

  function updateStepsPerFrame(val) {
    if (settings.stepMode === "Power of 2") {
      settings.stepsPerFrame = Math.pow(2, Math.round(val));

      // Update the input box
      const input = stepsController.domElement.querySelector('input[type="number"]');
      if (input) input.value = settings.stepsPerFrame;

      // Update the left label
      if (stepsController) stepsController.name(`Steps / Frame: ${settings.stepsPerFrame}`);
    } else {
      settings.stepsPerFrame = Math.round(val);

      // Reset label in linear mode
      if (stepsController) stepsController.name("Steps / Frame");
    }
  }
  // Helper to update the left label
  function updateStepsLabel(value) {
    if (stepsController) stepsController.name(`Steps / Frame: ${value}`);
  }

  function updateStepsPerFrame(val) {
    if (settings.stepMode === "Power of 2") {
      settings.stepsPerFrame = Math.pow(2, Math.round(val));
      // Update text input box to show actual step count
      const input = stepsController.domElement.querySelector('input[type="number"]');
      updateStepsLabel(settings.stepsPerFrame);
      if (input) input.value = settings.stepsPerFrame;
    } else {
      settings.stepsPerFrame = Math.round(val);
    }
  }

  updateStepsController();

  gui.add(settings, "parallelSteps").name("parallel Steps");

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
    stepTurmites();
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
function stepTurmites() {
  if (!settings.parallelSteps) {
    // Sequential: read, update, flip, move immediately
    for (const ant of turmites) {
      const oldX = ant.x;
      const oldY = ant.y;
      const newPos = ant.step(grid);

      markTileDirty(oldX, oldY);
      markTileDirty(newPos.x, newPos.y);
    }
  } else {
    // Parallel: compute all steps first
    const steps = turmites.map(a => a.nextStep(grid));

    steps.forEach((info, i) => {
      const ant = turmites[i];
      const oldTileX = Math.floor(ant.x / tileSize);
      const oldTileY = Math.floor(ant.y / tileSize);
      tiles[oldTileX][oldTileY].dirty = true;

      const newPos = ant.applyStep(info, grid);
      markTileDirty(newPos.x, newPos.y);
    });
  }
}

// Helper to mark a tile dirty
function markTileDirty(gx, gy) {
  const tileX = Math.floor(gx / tileSize);
  const tileY = Math.floor(gy / tileSize);
  if (tiles[tileX] && tiles[tileX][tileY]) tiles[tileX][tileY].dirty = true;
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
