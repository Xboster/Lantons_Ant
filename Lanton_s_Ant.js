let cols = 8192, rows = 8192;
let grid;
let cellSize = 1;
let zoom = 1;
const minZoom = 0.2, maxZoom = 8;

let offsetX = 0, offsetY = 0;
let panning = false;
let lastMouseX = 0, lastMouseY = 0;

let running = false;
let antX, antY, antDir = 0;

let stepsPerFrameSlider;
let pendingSteps = 0;

let cellBuffer; // offscreen buffer for alive cells

function setup() {
  createCanvas(windowWidth, windowHeight);
  noSmooth();
  document.body.style.margin = 0;
  document.body.style.overflow = "hidden";

  initGrid();

  offsetX = -(cols * cellSize * zoom) / 2 + width / 2;
  offsetY = -(rows * cellSize * zoom) / 2 + height / 2;

  canvas.oncontextmenu = () => false;

  // Slider
  stepsPerFrameSlider = createSlider(1, 10000, 1000, 1);
  stepsPerFrameSlider.position(20, 110);
  stepsPerFrameSlider.style("width", "200px");

  // Offscreen buffer (1 px per cell)
  cellBuffer = createGraphics(cols, rows);
  cellBuffer.noStroke();
  cellBuffer.clear();
  cellBuffer.noSmooth();
  updateBuffer();
}

function initGrid() {
  grid = Array.from({ length: cols }, () => Array(rows).fill(0));
  antX = floor(cols / 2);
  antY = floor(rows / 2);
  antDir = 0;
}

function updateBuffer() {
  // cellBuffer.background(255); // white background
  cellBuffer.clear();
  cellBuffer.fill(0);         // alive cells black
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (grid[x][y]) cellBuffer.rect(x, y, 1, 1);
    }
  }
}

function draw() {
  background(30);

  if (running) pendingSteps += stepsPerFrameSlider.value();

  let maxThisFrame = 5000;
  while (pendingSteps > 0 && maxThisFrame-- > 0) {
    stepAnt();
    pendingSteps--;
  }

  drawCells();
  drawAnt();
  drawUI();
}

function drawCells() {
  push();
  scale(zoom);
  translate(offsetX / zoom, offsetY / zoom);

  // draw alive cells from buffer
  image(cellBuffer, 0, 0, cols * cellSize, rows * cellSize);

  // draw border
  stroke(255, 150);
  strokeWeight(2 / zoom);
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

function stepAnt() {
  let oldX = antX;
  let oldY = antY;

  // flip current cell
  grid[oldX][oldY] = 1 - grid[oldX][oldY];

  // update buffer for that flipped cell
  if (grid[oldX][oldY]) {
    cellBuffer.fill(0);
    cellBuffer.noStroke();
    cellBuffer.rect(oldX, oldY, 1, 1);
  } else {
    cellBuffer.erase();           // make transparent
    cellBuffer.rect(oldX, oldY, 1, 1);
    cellBuffer.noErase();
  }

  // turn based on new state
  if (grid[oldX][oldY] === 1) antDir = (antDir + 1) % 4; // black -> right
  else antDir = (antDir + 3) % 4;                        // white -> left

  // move forward
  if (antDir === 0) antY--;
  else if (antDir === 1) antX++;
  else if (antDir === 2) antY++;
  else if (antDir === 3) antX--;

  // wrap
  antX = (antX + cols) % cols;
  antY = (antY + rows) % rows;
}

function drawUI() {
  push();
  fill(255, 200);
  noStroke();
  rect(12, 12, 360, 90, 6);
  fill(10);
  textSize(14);
  text(`Langton's Ant (Fast Grid + Buffer)
Steps/frame: ${stepsPerFrameSlider.value()}  Queued: ${pendingSteps}
Right drag: pan | Scroll: zoom | Left click: toggle
Space: ${running ? "Pause" : "Run"} | C: Clear`, 20, 20);
  pop();
}

function mousePressed() {
  if (mouseButton === RIGHT || mouseButton === CENTER) {
    panning = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  } else if (mouseButton === LEFT) toggleCell();
}

function mouseDragged() {
  if (panning) {
    offsetX += mouseX - lastMouseX;
    offsetY += mouseY - lastMouseY;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
}

function mouseReleased() { panning = false; }

function toggleCell() {
  const cs = cellSize;
  const gx = floor((mouseX - offsetX) / (cs * zoom));
  const gy = floor((mouseY - offsetY) / (cs * zoom));
  if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
    grid[gx][gy] = 1 - grid[gx][gy];

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

function mouseWheel(e) {
  const old = zoom;
  zoom = constrain(zoom * (1 - e.deltaY * 0.0015), minZoom, maxZoom);
  offsetX -= (mouseX - offsetX) * (zoom / old - 1);
  offsetY -= (mouseY - offsetY) * (zoom / old - 1);
  return false;
}

function keyPressed() {
  if (key === " ") running = !running;
  if (key === "C" || key === "c") {
    initGrid();
    updateBuffer();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
