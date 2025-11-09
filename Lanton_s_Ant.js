// === Langton's Ant with wrap-around, fixed grid, fixed UI ===
let cols = 400, rows = 400;
let grid;

let cellSize = 1;
let zoom = 1;
const minZoom = 0.2, maxZoom = 16;

let offsetX = 0, offsetY = 0;
let panning = false;
let lastMouseX = 0, lastMouseY = 0;

let running = false;
let antX, antY, antDir = 0;

let stepsPerFrameSlider;
let pendingSteps = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  document.body.style.margin = 0;
  document.body.style.overflow = "hidden";

  initGrid();

  offsetX = -(cols*cellSize*zoom)/2 + width/2;
  offsetY = -(rows*cellSize*zoom)/2 + height/2;

  canvas.oncontextmenu = () => false;

  // slider below UI
  stepsPerFrameSlider = createSlider(1, 10000, 1000, 1);
  stepsPerFrameSlider.position(20, 110);
  stepsPerFrameSlider.style("width", "200px");
}

function initGrid() {
  grid = Array.from({ length: cols }, () => Array(rows).fill(0));
  antX = floor(cols / 2);
  antY = floor(rows / 2);
  antDir = 0;
}

function draw() {
  background(30);

  if (running) {
    pendingSteps += stepsPerFrameSlider.value();
  }

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
  const cs = cellSize * zoom;

  // Draw all alive cells
  noStroke();
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (grid[x][y]) {
        fill(0);
        rect(x*cs + offsetX, y*cs + offsetY, cs, cs);
      }
    }
  }

  // Grid lines (optional, only when zoomed in enough)
  if (cs >= 6) {
    stroke(16);
    for (let x = 0; x <= cols; x++)
      line(x*cs+offsetX,0+offsetY,x*cs+offsetX,rows*cs+offsetY);
    for (let y = 0; y <= rows; y++)
      line(0+offsetX,y*cs+offsetY,cols*cs+offsetX,y*cs+offsetY);
  }

  // Draw a border rectangle around the grid
  stroke(255, 150); // white border, semi-transparent
  strokeWeight(2);
  noFill();
  rect(offsetX, offsetY, cols*cs, rows*cs);
}

function drawAnt() {
  const cs = cellSize * zoom;
  fill(255,50,50);
  noStroke();
  rect(antX*cs + offsetX, antY*cs + offsetY, cs, cs);
}

function stepAnt() {
  if (grid[antX][antY] === 0) {
    antDir = (antDir + 1) % 4;
    grid[antX][antY] = 1;
  } else {
    antDir = (antDir + 3) % 4;
    grid[antX][antY] = 0;
  }

  if (antDir === 0) antY--;
  else if (antDir === 1) antX++;
  else if (antDir === 2) antY++;
  else antX--;

  // wrap around
  antX = (antX + cols) % cols;
  antY = (antY + rows) % rows;
}

function drawUI() {
  push();
  fill(255,200);
  noStroke();
  rect(25,25,360,90,6);
  fill(10);
  textSize(14);
  text(`Langton's Ant (Wrap-around)
Steps/frame: ${stepsPerFrameSlider.value()}  Queued: ${pendingSteps}
Right drag: pan | Scroll: zoom | Left click: toggle
Space: ${running ? "Pause" : "Run"} | C: Clear`, 40, 50);
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
  const cs = cellSize * zoom;
  const gx = floor((mouseX - offsetX) / cs);
  const gy = floor((mouseY - offsetY) / cs);
  if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) grid[gx][gy] ^= 1;
}

function mouseWheel(e) {
  const old = zoom;
  zoom = constrain(zoom * (1 - e.deltaY * 0.0015), minZoom, maxZoom);
  offsetX -= (mouseX-offsetX)*(zoom/old-1);
  offsetY -= (mouseY-offsetY)*(zoom/old-1);
  return false;
}

function keyPressed() {
  if (key === " ") running = !running;
  if (key === "C" || key === "c") initGrid();
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }
