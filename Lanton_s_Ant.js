// =====================
// Global Variables
// =====================
let cols = 8192, rows = 8192;
let grid;
let cellSize = 64;
let zoom = .2;
const minZoom = 0.001, maxZoom = 1;

let offsetX = 0, offsetY = 0;
let panning = false;
let lastMouseX = 0, lastMouseY = 0;

let antX, antY, antDir = 0;
let pendingSteps = 0;

let cellBuffer; // offscreen buffer for alive cells

let gui;
let settings = {
  running: false,
  stepsPerFrame: 1,
  stepsLinear: Math.log10(1000) / Math.log10(10000),
  get stepsDisplay() { return this.stepsPerFrame; },
  reset: () => {
    initGrid();
    updateBuffer();
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
  initUI();

  // Center the view
  offsetX = -(cols * cellSize * zoom) / 2 + width / 2;
  offsetY = -(rows * cellSize * zoom) / 2 + height / 2;

  canvas.oncontextmenu = () => false;

  // Offscreen buffer for alive cells
  cellBuffer = createGraphics(cols, rows);
  cellBuffer.noStroke();
  cellBuffer.clear();
  cellBuffer.noSmooth();
  updateBuffer();
}

// =====================
// GUI Initialization
// =====================
function initUI() {
  gui = new lil.GUI({ title: "Langton's Ant Controls" });

  // --- Running toggle ---
  const runningController = gui.add(settings, "running").name("Running");

  // --- Steps/Frame slider (logarithmic) ---
  Object.defineProperty(settings, "stepsLog", {
    get() { return settings.stepsPerFrame; },
    set(val) {
      const min = 1, max = 10000;
      settings.stepsPerFrame = Math.round(val);
      settings.stepsLinear = Math.log10(settings.stepsPerFrame / min) / Math.log10(max / min);
    }
  });
  const stepsController = gui.add(settings, "stepsLog", 1, 10000, 1).name("Steps / Frame");

  // --- Logarithmic zoom slider ---
  settings.zoomLinear = Math.log10(zoom / minZoom) / Math.log10(maxZoom / minZoom);
  const zoomController = gui.add(settings, "zoomLinear", 0, 1, 0.001)
    .name("Zoom")
    .onChange(val => updateZoomFromSlider(val));

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

  // --- Reset button ---
  const resetController = gui.add(settings, "reset").name("Clear Grid");

  // --- GUI positioning ---
  gui.domElement.style.position = "absolute";
  gui.domElement.style.left = "10px";
  gui.domElement.style.top = "10px";
  gui.width = 300;
  gui.close();

  // --- Store controllers ---
  settings._controllers = { runningController, stepsController, zoomController, resetController };
}

// =====================
// Grid & Ant Initialization
// =====================
function initGrid() {
  grid = Array.from({ length: cols }, () => Array(rows).fill(0));
  antX = floor(cols / 2);
  antY = floor(rows / 2);
  antDir = 0;
}

// =====================
// Drawing Functions
// =====================
function draw() {
  background(30);

  if (settings.running) pendingSteps += settings.stepsPerFrame;

  let maxThisFrame = 5000;
  while (pendingSteps > 0 && maxThisFrame-- > 0) {
    stepAnt();
    pendingSteps--;
  }

  drawCells();
  drawAnt();
}

function drawCells() {
  push();
  scale(zoom);
  translate(offsetX / zoom, offsetY / zoom);
  image(cellBuffer, 0, 0, cols * cellSize, rows * cellSize);

  stroke(255, 150);
  strokeWeight(1 / zoom);
  noFill();
  rect(0, 0, cols * cellSize, rows * cellSize);
  pop();
}

function drawAnt() {
  const cs = cellSize * zoom;
  fill(255, 50, 50);
  noStroke();
  rect(antX * cs + offsetX, antY * cs + offsetY, cs, cs);
}

// =====================
// Ant Logic
// =====================
function stepAnt() {
  let oldX = antX;
  let oldY = antY;

  // Flip current cell
  grid[oldX][oldY] = 1 - grid[oldX][oldY];

  // Update buffer
  if (grid[oldX][oldY]) {
    cellBuffer.fill(0);
    cellBuffer.noStroke();
    cellBuffer.rect(oldX, oldY, 1, 1);
  } else {
    cellBuffer.erase();
    cellBuffer.rect(oldX, oldY, 1, 1);
    cellBuffer.noErase();
  }

  // Turn and move
  antDir = (antDir + (grid[oldX][oldY] === 1 ? 1 : 3)) % 4;
  if (antDir === 0) antY--;
  else if (antDir === 1) antX++;
  else if (antDir === 2) antY++;
  else if (antDir === 3) antX--;

  // Wrap around
  antX = (antX + cols) % cols;
  antY = (antY + rows) % rows;
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
  // Convert mouse coordinates to grid coordinates
  const gx = floor((mouseX - offsetX) / (cs * zoom));
  const gy = floor((mouseY - offsetY) / (cs * zoom));

  // Check bounds
  if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
    // Flip the cell
    grid[gx][gy] = 1 - grid[gx][gy];

    // Draw on the offscreen buffer (1 px per cell)
    if (grid[gx][gy]) {
      cellBuffer.fill(0);
      cellBuffer.noStroke();
      cellBuffer.rect(gx, gy, 1, 1);
    } else {
      cellBuffer.erase();
      cellBuffer.rect(gx, gy, 1, 1);
      cellBuffer.noErase();
    }
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

  // Amount of grid allowed to go off-screen
  const maxOffscreenX = scaledWidth * 0.5;
  const maxOffscreenY = scaledHeight * 0.5;

  // If the grid is smaller than the canvas, allow panning fully to center it
  const minX = Math.min(width - maxOffscreenX, width / 2 - scaledWidth);
  const maxX = Math.max(maxOffscreenX, width / 2);
  const minY = Math.min(height - maxOffscreenY, height / 2 - scaledHeight);
  const maxY = Math.max(maxOffscreenY, height / 2);

  offsetX = constrain(offsetX, minX, maxX);
  offsetY = constrain(offsetY, minY, maxY);
}

// =====================
// Window Resize
// =====================
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// =====================
// Update Offscreen Buffer
// =====================
function updateBuffer() {
  cellBuffer.clear();
  cellBuffer.fill(0);
  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++)
      if (grid[x][y]) cellBuffer.rect(x, y, 1, 1);
}
