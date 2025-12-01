const COLS = 8192;
const ROWS = 8192;
const cellSize = 16;
let zoom = 0.2;
const minZoom = 0.001, maxZoom = 1;
const chunkSize = 512;
let numChunksX, numChunksY;
let chunks = [];
let grid;
let pendingSteps = 0;
let offsetX = 0, offsetY = 0;
let lastCellX = null, lastCellY = null, isDrawing = false;
let isPanning = false, lastMouseX = 0, lastMouseY = 0;
let turmites = [];
let followedAnt = null;

let gui;
const settings = {
  running: false,
  stepsPerFrame: 1,
  parallel: false,
  stepsLinear: Math.log10(1000) / Math.log10(10000),
  get stepsDisplay() { return this.stepsPerFrame; },
  clear: () => resetWorld()
};
let antFolder = null;
let lastFrameSteps = 0;

const stateColors = [
  [255, 255, 255],   // state 0: white
  [255, 0, 0],       // state 1: red
  [0, 255, 0],       // state 2: green
  [0, 0, 255],       // state 3: blue
  // Add more colors if needed
];

class Chunk {
  constructor(cx, cy, size) {
    this.cx = cx;
    this.cy = cy;

    // Handle partial chunks at edges
    this.width = Math.min(size, COLS - cx * size);
    this.height = Math.min(size, ROWS - cy * size);

    this.x = cx * size;
    this.y = cy * size;

    // Graphics buffer matches actual chunk dimensions
    this.gfx = createGraphics(this.width, this.height, P2D, { willReadFrequently: true });
    this.gfx.noStroke();
    this.gfx.noSmooth();
    this.gfx.pixelDensity(1);

    this.dirtyCells = new Set();
    this.dirty = true;
  }

  markDirty(gx, gy) {
    if (gx >= this.x && gx < this.x + this.width &&
      gy >= this.y && gy < this.y + this.height) {
      const localX = gx - this.x;
      const localY = gy - this.y;
      this.dirtyCells.add(localY * this.width + localX);
    }
  }

  update() {
    if (this.dirty) {
      this.gfx.loadPixels();
      for (let j = 0; j < this.height; j++) {
        for (let i = 0; i < this.width; i++) {
          const gx = this.x + i;
          const gy = this.y + j;
          const cellState = (gx < COLS && gy < ROWS) ? grid[gx + gy * COLS] : 0;
          const colRGB = stateColors[cellState % stateColors.length];

          const pxIndex = 4 * (j * this.width + i);
          this.gfx.pixels[pxIndex] = colRGB[0];
          this.gfx.pixels[pxIndex + 1] = colRGB[1];
          this.gfx.pixels[pxIndex + 2] = colRGB[2];
          this.gfx.pixels[pxIndex + 3] = 255;

        }
      }
      this.gfx.updatePixels();
      this.dirty = false;
      this.dirtyCells.clear();
      return;
    }

    if (this.dirtyCells.size === 0) return;

    this.gfx.loadPixels();
    for (let idx of this.dirtyCells) {
      const localX = idx % this.width;
      const localY = Math.floor(idx / this.width);
      const gx = this.x + localX;
      const gy = this.y + localY;

      const cellState = (gx < COLS && gy < ROWS) ? grid[gx + gy * COLS] : 0;
      const colRGB = stateColors[cellState % stateColors.length];

      const pxIndex = 4 * (localY * this.width + localX);
      this.gfx.pixels[pxIndex] = colRGB[0];
      this.gfx.pixels[pxIndex + 1] = colRGB[1];
      this.gfx.pixels[pxIndex + 2] = colRGB[2];
      this.gfx.pixels[pxIndex + 3] = 255;
    }
    this.gfx.updatePixels();
    this.dirtyCells.clear();
  }

  draw() {
    const px = Math.round(this.x * cellSize * zoom + offsetX);
    const py = Math.round(this.y * cellSize * zoom + offsetY);
    const w = Math.ceil(this.width * cellSize * zoom);
    const h = Math.ceil(this.height * cellSize * zoom);

    if (px + w < 0 || px > width || py + h < 0 || py > height) return;

    this.update();
    image(this.gfx, px, py, w, h);
  }

  markAllDirty() {
    this.dirty = true;
    this.dirtyCells.clear();
  }
}

class Turmite {
  constructor(x, y, rule = "RL") {
    this.x = x;
    this.y = y;
    this.dir = 0;
    this.rule = rule;  // string of L/R for each state
  }

  // Sequential step
  step(grid) {
    const idx = this.x + this.y * COLS;
    const cell = grid[idx];
    const turn = this.rule[cell % this.rule.length] === 'L' ? -1 : 1;
    this.dir = (this.dir + turn + 4) % 4;
    grid[idx] = (cell + 1) % this.rule.length;

    markChunkDirty(this.x, this.y);

    let nx = this.x, ny = this.y;
    switch (this.dir) {
      case 0: ny = (this.y - 1 + ROWS) % ROWS; break;
      case 1: nx = (this.x + 1) % COLS; break;
      case 2: ny = (this.y + 1) % ROWS; break;
      case 3: nx = (this.x - 1 + COLS) % COLS; break;
    }

    markChunkDirty(nx, ny);
    const old = { x: this.x, y: this.y };
    this.x = nx; this.y = ny;
    return { old, newPos: { x: nx, y: ny } };
  }

  // Prepare step for parallel
  prepareStep() {
    const idx = this.x + this.y * COLS;
    const cell = grid[idx];
    const newDir = (this.dir + (this.rule[cell % this.rule.length] === 'L' ? -1 : 1) + 4) % 4;

    let nx = this.x, ny = this.y;
    switch (newDir) {
      case 0: ny = (this.y - 1 + ROWS) % ROWS; break;
      case 1: nx = (this.x + 1) % COLS; break;
      case 2: ny = (this.y + 1) % ROWS; break;
      case 3: nx = (this.x - 1 + COLS) % COLS; break;
    }

    return {
      oldPos: { x: this.x, y: this.y },
      newPos: { x: nx, y: ny },
      newDir,
      flipIdx: idx,
      oldCell: cell
    };
  }

  // Apply prepared step
  applyStep(step) {
    grid[step.flipIdx] = (step.oldCell + 1) % this.rule.length;
    markChunkDirty(step.oldPos.x, step.oldPos.y);
    markChunkDirty(step.newPos.x, step.newPos.y);
    this.x = step.newPos.x;
    this.y = step.newPos.y;
    this.dir = step.newDir;
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  noSmooth();
  setAttributes({ antialias: false });
  pixelDensity(1);
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

  initTurmites(1);
  initUI();

  offsetX = -(COLS * cellSize * zoom) / 2 + width / 2;
  offsetY = -(ROWS * cellSize * zoom) / 2 + height / 2;

}

function initTurmites(n) {
  turmites = [];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(COLS / 2);
    const y = Math.floor(ROWS / 2);
    const rule = "RRLLLRLLLRRR"; // any L/R string
    turmites.push(new Turmite(x, y, rule));
  }
  refreshAntFolder(); // refresh folder after creating ants
}

function resetWorld() {
  grid.fill(0);
  chunks.forEach(row => row.forEach(ch => ch.dirty = true));
}

function refreshAntFolder() {
  if (!gui) return;

  // If antFolder doesn't exist yet, create it
  if (!antFolder) {
    antFolder = gui.addFolder("Ants");
    antFolder.open();
  }

  turmites.forEach((ant, i) => {
    if (!ant._guiFolder) {
      const f = antFolder.addFolder(`Ant ${i}`);

      // Rule text field
      const ruleController = f.add(ant, 'rule').name('Rule').onChange(val => {
        ant.rule = val.toUpperCase().replace(/[^LR]/g, '');
      });

      // Randomize Rule button
      f.add({
        randomizeRule: () => {
          const len = ant.rule.length || 2; // fallback length
          let newRule = '';
          for (let j = 0; j < len; j++) {
            newRule += Math.random() < 0.5 ? 'L' : 'R';
          }
          ant.rule = newRule;

          // Update the GUI display explicitly
          ruleController.updateDisplay();
        }
      }, 'randomizeRule').name('Randomize Rule');

      // Follow toggle
      ant.follow = false; // default
      f.add(ant, 'follow').name('Follow Ant').onChange(val => {
        if (val) {
          turmites.forEach(a => {
            if (a !== ant) a.follow = false;
          });
          followedAnt = ant;
        } else if (followedAnt === ant) {
          followedAnt = null;
        }
        updateCameraFollow();
      });

      // Delete button
      f.add({
        delete: () => {
          turmites = turmites.filter(a => a !== ant);
          if (ant._guiFolder) {
            ant._guiFolder.destroy();
            delete ant._guiFolder;
          }

          if (followedAnt === ant) followedAnt = null;

          turmites.forEach((a, idx) => {
            if (a._guiFolder) a._guiFolder.title = `Ant ${idx}`;
          });
        }
      }, 'delete').name('Delete Ant');

      f.open();
      ant._guiFolder = f;
    }
  });
}

// In draw(), after updating turmites:
function updateCameraFollow() {
  if (followedAnt) {
    offsetX = width / 2 - followedAnt.x * cellSize * zoom;
    offsetY = height / 2 - followedAnt.y * cellSize * zoom;
  }
}

function initUI() {
  gui = new lil.GUI({ title: 'Langton Ant Controls' });

  // --- Running toggle ---
  const runningController = gui.add(settings, 'running').name('Running');

  // --- Step mode dropdown ---
  settings.stepMode = 'Fixed';
  const stepModeController = gui.add(settings, 'stepMode', ['Fixed', 'Exponential', 'Unlimited'])
    .name('Step Mode')
    .onChange(updateStepsController);

  // --- Steps per frame slider ---
  settings._stepsSliderValue = 0; // 2^0 = 1 step
  const stepsController = gui.add(settings, '_stepsSliderValue', 0, 20, 1)
    .name('Steps / Frame')
    .onChange(updateStepsPerFrame);

  // --- Step Once button ---

  const stepOnceController = gui.add({
    stepOnce: () => {
      for (let i = 0; i < settings.stepsPerFrame; i++) {
        if (settings.parallel) {
          // Parallel stepping
          const nextSteps = turmites.map(t => t.prepareStep());
          nextSteps.forEach((step, i) => turmites[i].applyStep(step));
        } else {
          // Sequential stepping
          turmites.forEach(t => {
            const step = t.step(grid);
            markChunkDirty(step.old.x, step.old.y);
            markChunkDirty(step.newPos.x, step.newPos.y);
          });
        }
      }

      // Redraw chunks and turmites immediately
      drawChunks();
      drawTurmites();
      drawBorder();
    }
  }, 'stepOnce').name('Step Once');

  function updateStepsController() {
    if (settings.stepMode === 'Fixed') {
      stepsController.enable();
      stepOnceController.enable();

      stepsController.min(1);
      stepsController.max(1000000);
      stepsController.step(1);

      const clamped = Math.max(1, Math.round(stepsController.getValue()));
      stepsController.setValue(clamped);

      stepsController.name('Steps / Frame');
    } else if (settings.stepMode === 'Exponential') {
      stepsController.enable();
      stepOnceController.enable();

      stepsController.min(0);
      stepsController.max(20);
      stepsController.step(1);

      // Convert previous value to nearest power-of-two exponent
      const prev = stepsController.getValue();
      const exponent = Math.round(Math.log2(Math.max(1, prev))); // clamp to >=1 for log2
      const clampedExp = Math.min(20, Math.max(0, exponent));

      stepsController.setValue(clampedExp);
      stepsController.name(`Steps / Frame: ${2 ** clampedExp}`);

      updateStepsPerFrame(exp);
    } else if (settings.stepMode === 'Unlimited') {
      stepsController.disable();
      stepOnceController.disable();

      // Display lastFrameSteps
      stepsController.name(`Steps / Frame: ${lastFrameSteps}`);
      settings.stepsPerFrame = Infinity; // or a sentinel like -1

      // Reset pendingSteps
      pendingSteps = 0;
    }
    updateStepsPerFrame(stepsController.getValue());
  }

  function updateStepsPerFrame(val) {
    if (settings.stepMode === "Unlimited") return;

    if (settings.stepMode === "Exponential") {
      settings.stepsPerFrame = Math.pow(2, Math.round(val));
      stepsController.name(`Steps / Frame: ${settings.stepsPerFrame}`);
    } else {
      settings.stepsPerFrame = Math.round(val);
      stepsController.name('Steps / Frame');
    }

    // Reset queued steps to avoid leftover backlog
    pendingSteps = 0;
  }

  updateStepsController();

  // --- Other controls ---
  gui.add(settings, 'parallel').name('Parallel Steps');
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

  // --- Ant folder ---
  antFolder = gui.addFolder('Ants');
  refreshAntFolder(); // populate folder with existing ants
  antFolder.open();

  // --- GUI style ---
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.left = '10px';
  gui.domElement.style.top = '10px';
  gui.close();

  // Store controllers for later access
  settings._controllers = { runningController, stepModeController, stepsController, stepOnceController, zoomController };
  gui.open();
}

function draw() {
  background(30);

  // When paused, just draw everything
  if (!settings.running) {
    drawChunks();
    drawTurmites();
    drawBorder();
    pendingSteps = 0;
    lastFrameSteps = 0;
    return;
  }

  // Accumulate steps
  pendingSteps += settings.stepsPerFrame;

  const startTime = performance.now();
  const maxFrameTime = 1000 / 2;
  let stepsProcessed = 0;

  while (pendingSteps > 0) {
    if (settings.parallel) {
      // Prepare all steps first
      const nextSteps = turmites.map(t => t.prepareStep());

      // Apply all steps simultaneously
      nextSteps.forEach((step, i) => turmites[i].applyStep(step));
    } else {
      // Sequential stepping
      turmites.forEach(t => {
        const step = t.step(grid);
        markChunkDirty(step.old.x, step.old.y);
        markChunkDirty(step.newPos.x, step.newPos.y);
      });
    }

    pendingSteps--;
    stepsProcessed++;

    // Stop if frame is taking too long
    if (performance.now() - startTime > maxFrameTime) break;
  }

  lastFrameSteps = stepsProcessed;

  // --- Draw chunks with dynamic LOD ---
  for (let cx = 0; cx < numChunksX; cx++) {
    for (let cy = 0; cy < numChunksY; cy++) {
      chunks[cx][cy].draw();
    }
  }

  // Draw turmites
  drawTurmites();
  drawBorder();
  updateCameraFollow();

  // Print steps processed for benchmarking
  // console.log(`Steps this frame: ${lastFrameSteps}`);
  if (settings.stepMode === "Unlimited") {
    settings._controllers.stepsController.name(`Steps / Frame: ${lastFrameSteps}`);
  }
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
  // Only skip drawing turmites when running and zoomed way out
  if (settings.running && cellSize * zoom < 2) return;

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

  if (mouseButton === LEFT) {
    isDrawing = true;
    toggleCellUnderCursor();
  }

  if (mouseButton === RIGHT && !keyIsDown(SHIFT)) {
    const worldX = Math.floor((mouseX - offsetX) / (cellSize * zoom));
    const worldY = Math.floor((mouseY - offsetY) / (cellSize * zoom));

    if (worldX >= 0 && worldX < COLS && worldY >= 0 && worldY < ROWS) {
      turmites.push(new Turmite(worldX, worldY));
      refreshAntFolder(); // update GUI dynamically
    }
  }


  if (mouseButton === CENTER) {
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
