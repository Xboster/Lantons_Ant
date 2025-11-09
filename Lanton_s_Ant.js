// ✅ p5.5.js Langton’s Ant — fast, responsive, UI controlled

// Set screen requirements + export resolution (in PPI)
p5.initMetrics(16, 300);

let cols = 400, rows = 400;
let grid;

let cellSize = 10; // logical size — p5.5 scales it
let antX, antY, antDir;

let running = false;
let queuedSteps = 0;

let params = {
  stepsPerFrame: 500,
  reset: () => initGrid(),
  run: () => running = true,
  pause: () => running = false,
  step: () => { queuedSteps += params.stepsPerFrame; }
};

function setup() {
  createCanvas(cols * cellSize, rows * cellSize, {
    zoomMin: 0.1,
    zoomMax: 50,
    zoomInc: 0.05,
    guiOpen: true,
    guiTheme: "dark",
    cmdFullScreenToggle: "Shift+F",
    loop: true,
    panButtons: [RIGHT]
  });

  initGrid();

  // GUI setup
  let gui = addGUI("Langton’s Ant");
  gui.add(params, "stepsPerFrame", 1, 5000, 1).name("Steps Per Frame");
  gui.add(params, "step").name("Single Step");
  gui.add(params, "run").name("Run");
  gui.add(params, "pause").name("Pause");
  gui.add(params, "reset").name("Reset");

  noSmooth();
}

function initGrid() {
  grid = Array.from({ length: cols }, () => Array(rows).fill(0));
  antX = floor(cols / 2);
  antY = floor(rows / 2);
  antDir = 0;
}

function draw() {
  background(240); // p5.5 wallpaper still visible outside canvas

  // simulation update loop
  if (running) queuedSteps += params.stepsPerFrame;

  let maxThisFrame = 10000;
  while (queuedSteps > 0 && maxThisFrame-- > 0) {
    stepAnt();
    queuedSteps--;
  }

  // draw only visible region (p5.5 handles screen culling internally)
  noStroke();
  fill(0);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (grid[x][y]) {
        rect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }

  // draw ant
  fill(255, 50, 50);
  rect(antX * cellSize, antY * cellSize, cellSize, cellSize);
}

function stepAnt() {
  const cell = grid[antX][antY];

  // white → turn right, black → turn left
  antDir = (antDir + (cell === 0 ? 1 : 3)) % 4;
  grid[antX][antY] = 1 - cell;

  if (antDir === 0) antY--;
  else if (antDir === 1) antX++;
  else if (antDir === 2) antY++;
  else antX--;

  // Wrap around instead of freezing UI ✅
  antX = (antX + cols) % cols;
  antY = (antY + rows) % rows;
}

function mousePressed() {
  if (mouseButton !== LEFT) return;

  // Convert screen → canvas coordinates
  const cx = convertFromScreenX(mouseX);
  const cy = convertFromScreenY(mouseY);

  // Ensure within canvas
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return;

  // Convert to grid coords
  const gx = floor(cx / cellSize);
  const gy = floor(cy / cellSize);

  grid[gx][gy] ^= 1; // Toggle
}

function mouseDragged() {
  if (mouseButton === LEFT) mousePressed();
}
