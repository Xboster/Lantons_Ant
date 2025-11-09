// FAST Langton's Ant + smooth panning
let cols = 400, rows = 400;
let grid;

let cellSize = 20;
let zoom = 1;
const minZoom = 0.2, maxZoom = 4;

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

  stepsPerFrameSlider = createSlider(1, 10000, 1000, 1);
  stepsPerFrameSlider.position(12, 84);
}

function initGrid() {
  grid = Array.from({ length: cols }, () => Array(rows).fill(0));
  antX = floor(cols / 2);
  antY = floor(rows / 2);
  antDir = 0;
}

function draw() {
  background(30);

  // update step queue
  if (running) {
    pendingSteps += stepsPerFrameSlider.value();
  }

  // simulate without freezing UI
  let maxThisFrame = 5000; // throttle to protect draw loop
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
  const xStart = max(0, floor((-offsetX) / cs));
  const yStart = max(0, floor((-offsetY) / cs));
  const xEnd   = min(cols-1, ceil((width-offsetX)/cs));
  const yEnd   = min(rows-1, ceil((height-offsetY)/cs));

  noStroke();
  for (let x=xStart; x<=xEnd; x++) {
    for (let y=yStart; y<=yEnd; y++) {
      if (grid[x][y]) {
        fill(0);
        rect(x*cs+offsetX, y*cs+offsetY, cs, cs);
      }
    }
  }

  if (cs >= 6) {
    stroke(70);
    for (let x=xStart; x<=xEnd+1; x++)
      line(x*cs+offsetX,yStart*cs+offsetY,x*cs+offsetX,(yEnd+1)*cs+offsetY);
    for (let y=yStart; y<=yEnd+1; y++)
      line(xStart*cs+offsetX,y*cs+offsetY,(xEnd+1)*cs+offsetX,y*cs+offsetY);
  }
}

function drawAnt() {
  const cs = cellSize * zoom;
  fill(255,50,50);
  noStroke();
  rect(antX*cs+offsetX, antY*cs+offsetY, cs, cs);
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

  if (antX<0||antX>=cols||antY<0||antY>=rows) running=false;
}

function drawUI() {
  fill(255,200);
  noStroke();
  rect(6,6,350,110,6);
  fill(10);
  textSize(14);
  text(`Langton's Ant (FAST)
Steps/frame: ${stepsPerFrameSlider.value()}
Queued steps: ${pendingSteps}
${running?"(Space to pause)":"(Space to run)"}
Right drag = Pan | Scroll = Zoom | Left = Toggle`, 12, 12);
}

function mousePressed() {
  if (mouseButton === RIGHT || mouseButton === CENTER) {
    panning = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  } else if (mouseButton === LEFT) {
    toggleCell();
  }
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
  if (gx>=0&&gx<cols&&gy>=0&&gy<rows) {
    grid[gx][gy] ^= 1;
  }
}

function mouseWheel(e) {
  const old = zoom;
  zoom = constrain(zoom * (1 - e.deltaY * 0.0015), minZoom, maxZoom);
  offsetX -= (mouseX-offsetX) * (zoom/old - 1);
  offsetY -= (mouseY-offsetY) * (zoom/old - 1);
  return false;
}

function keyPressed() {
  if (key === " ") running = !running;
  if (key === "C" || key === "c") initGrid();
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }
