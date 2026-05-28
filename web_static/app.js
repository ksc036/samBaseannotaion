const fileInput = document.getElementById("fileInput");
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");
const statusEl = document.getElementById("status");
const pointList = document.getElementById("pointList");
const positiveBtn = document.getElementById("positiveBtn");
const negativeBtn = document.getElementById("negativeBtn");
const brushBtn = document.getElementById("brushBtn");
const eraserBtn = document.getElementById("eraserBtn");
const segmentBtn = document.getElementById("segmentBtn");
const calculateBtn = document.getElementById("calculateBtn");
const clearBtn = document.getElementById("clearBtn");
const scalePixelInput = document.getElementById("scalePixelInput");
const scalePickBtn = document.getElementById("scalePickBtn");
const scaleLengthInput = document.getElementById("scaleLengthInput");
const pixelSizeInput = document.getElementById("pixelSizeInput");
const pixelUnitInput = document.getElementById("pixelUnitInput");
const brushSize = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const pointOpacity = document.getElementById("pointOpacity");
const pointOpacityValue = document.getElementById("pointOpacityValue");
const overlayOpacity = document.getElementById("overlayOpacity");
const overlayOpacityValue = document.getElementById("overlayOpacityValue");
const resultsBody = document.getElementById("resultsBody");
const resultsPanel = document.getElementById("resultsPanel");
const avgFeretHeader = document.getElementById("avgFeretHeader");
const areaHeader = document.getElementById("areaHeader");
const feretMaxHeader = document.getElementById("feretMaxHeader");
const feretMinHeader = document.getElementById("feretMinHeader");
const eqDiameterHeader = document.getElementById("eqDiameterHeader");
const bboxWidthHeader = document.getElementById("bboxWidthHeader");
const bboxHeightHeader = document.getElementById("bboxHeightHeader");

let mode = "positive";
let imageId = null;
let imageBitmap = null;
let sourceImageCanvas = null;
let sourceImageCtx = null;
let sourceImageData = null;
let naturalWidth = 0;
let naturalHeight = 0;
let points = [];
let measurements = [];
let maskCanvas = null;
let maskCtx = null;
let overlayBitmap = null;
let scaleOverlayBitmap = null;
let isDrawing = false;
let isScalePickMode = false;
let maskDirty = false;
let lastDrawPoint = null;
let currentStrokePoints = [];
let pendingStrokeSnapshot = null;
let actionHistory = [];
let hoveredPointIndex = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function setMode(nextMode) {
  mode = nextMode;
  setScalePickMode(false);
  positiveBtn.classList.toggle("active", mode === "positive");
  negativeBtn.classList.toggle("active", mode === "negative");
  brushBtn.classList.toggle("active", mode === "brush");
  eraserBtn.classList.toggle("active", mode === "eraser");
  updateStageCursor();
}

function updateStageCursor() {
  const showCrosshair = isScalePickMode || mode === "positive" || mode === "negative" || mode === "brush" || mode === "eraser";
  stage.classList.toggle("crosshairMode", showCrosshair);
}

function setScalePickMode(enabled) {
  isScalePickMode = enabled;
  if (!enabled) {
    scaleOverlayBitmap = null;
  }
  scalePickBtn.classList.toggle("active", enabled);
  updateStageCursor();
  draw();
}

function fitCanvas() {
  if (!imageBitmap) return;
  const wrap = document.getElementById("stageWrap");
  const maxW = Math.max(320, wrap.clientWidth - 36);
  const maxH = Math.max(240, wrap.clientHeight - 36);
  const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1);
  stage.width = Math.round(naturalWidth * scale);
  stage.height = Math.round(naturalHeight * scale);
}

function draw() {
  ctx.clearRect(0, 0, stage.width, stage.height);
  if (!imageBitmap) return;
  ctx.drawImage(imageBitmap, 0, 0, stage.width, stage.height);
  if (overlayBitmap) {
    ctx.save();
    ctx.globalAlpha = Number(overlayOpacity.value) / 100;
    ctx.drawImage(overlayBitmap, 0, 0, stage.width, stage.height);
    ctx.restore();
  }
  if (scaleOverlayBitmap) {
    ctx.save();
    ctx.globalAlpha = Number(overlayOpacity.value) / 100;
    ctx.drawImage(scaleOverlayBitmap, 0, 0, stage.width, stage.height);
    ctx.restore();
  }
  if (currentStrokePoints.length > 0) {
    drawTransientStroke();
  }
  const pointAlpha = Number(pointOpacity.value) / 100;
  for (const [index, point] of points.entries()) {
    const x = (point.x / naturalWidth) * stage.width;
    const y = (point.y / naturalHeight) * stage.height;
    const isHovered = hoveredPointIndex === index;
    ctx.beginPath();
    ctx.arc(x, y, isHovered ? 9 : 6, 0, Math.PI * 2);
    ctx.fillStyle = point.type === "positive" ? `rgba(22, 209, 116, ${pointAlpha})` : `rgba(255, 62, 62, ${pointAlpha})`;
    ctx.strokeStyle = isHovered ? "rgba(255, 214, 10, 0.95)" : `rgba(255, 255, 255, ${Math.max(pointAlpha, 0.35)})`;
    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.fill();
    ctx.stroke();
  }
}

function renderPointList() {
  pointList.innerHTML = "";
  points.forEach((point, index) => {
    const item = document.createElement("li");
    item.classList.toggle("active", hoveredPointIndex === index);
    item.dataset.pointIndex = String(index);
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = point.type === "positive" ? "#16d174" : "#ff3e3e";
    dot.style.opacity = String(Number(pointOpacity.value) / 100);
    const label = document.createElement("span");
    label.className = "pointLabel";
    label.textContent = `${index + 1}. ${point.type} (${Math.round(point.x)}, ${Math.round(point.y)})`;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "pointDeleteBtn";
    removeButton.textContent = "Delete";
    removeButton.dataset.pointIndex = String(index);
    item.append(dot, label, removeButton);
    pointList.append(item);
  });
}

function renderResults(rows = []) {
  updateMeasurementHeaders();
  resultsBody.innerHTML = "";
  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.className = "emptyCell";
    cell.textContent = "No calculation yet.";
    row.append(cell);
    resultsBody.append(row);
    return;
  }

  const scale = getPixelScale();
  rows.forEach((segment, index) => {
    const row = document.createElement("tr");
    const colorCell = document.createElement("td");
    const colorSwatch = document.createElement("span");
    colorSwatch.className = "colorSwatch";
    colorSwatch.style.background = segment.color;
    colorCell.append(colorSwatch);

    const segmentCell = document.createElement("td");
    segmentCell.textContent = `#${index + 1}`;

    const avgFeretCell = document.createElement("td");
    avgFeretCell.textContent = formatLength(
      (Number(segment.feret_max_pixels || 0) + Number(segment.feret_min_pixels || 0)) / 2,
      scale,
    );

    const areaCell = document.createElement("td");
    areaCell.textContent = formatArea(segment.area_pixels, scale);

    const feretMaxCell = document.createElement("td");
    feretMaxCell.textContent = formatLength(segment.feret_max_pixels, scale);

    const feretMinCell = document.createElement("td");
    feretMinCell.textContent = formatLength(segment.feret_min_pixels, scale);

    const eqCell = document.createElement("td");
    eqCell.textContent = formatLength(segment.equivalent_diameter_pixels, scale);

    const bboxWidthCell = document.createElement("td");
    bboxWidthCell.textContent = formatLength(segment.bbox_width_pixels, scale);

    const bboxHeightCell = document.createElement("td");
    bboxHeightCell.textContent = formatLength(segment.bbox_height_pixels, scale);

    row.append(colorCell, segmentCell, avgFeretCell, areaCell, feretMaxCell, feretMinCell, eqCell, bboxWidthCell, bboxHeightCell);
    resultsBody.append(row);
  });
}

function renderLoadingResults() {
  resultsBody.innerHTML = "";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 9;
  cell.className = "emptyCell";
  cell.textContent = "Calculating...";
  row.append(cell);
  resultsBody.append(row);
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function updateOpacityLabels() {
  pointOpacityValue.textContent = `${pointOpacity.value}%`;
  overlayOpacityValue.textContent = `${overlayOpacity.value}%`;
}

function updatePixelSizeFromCalibration() {
  const pixelWidth = Number(scalePixelInput.value);
  const actualLength = Number(scaleLengthInput.value);
  if (!Number.isFinite(pixelWidth) || pixelWidth <= 0 || !Number.isFinite(actualLength) || actualLength <= 0) {
    pixelSizeInput.value = "";
    renderResults(measurements);
    return;
  }
  pixelSizeInput.value = (actualLength / pixelWidth).toFixed(8).replace(/\.?0+$/, "");
  renderResults(measurements);
}

function colorDistanceAt(data, pixelIndex, target) {
  const offset = pixelIndex * 4;
  return Math.abs(data[offset] - target.r) + Math.abs(data[offset + 1] - target.g) + Math.abs(data[offset + 2] - target.b);
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

async function imageDataToBitmap(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");
  context.putImageData(imageData, 0, 0);
  return createImageBitmap(canvas);
}

function splitConnectedComponents(maskValues, width, height) {
  const visited = new Uint8Array(maskValues.length);
  const components = [];

  for (let index = 0; index < maskValues.length; index += 1) {
    if (!maskValues[index] || visited[index]) continue;
    const stack = [index];
    const component = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (visited[current] || !maskValues[current]) continue;
      visited[current] = 1;
      component.push(current);

      const x = current % width;
      const y = Math.floor(current / width);
      if (x > 0) stack.push(current - 1);
      if (x < width - 1) stack.push(current + 1);
      if (y > 0) stack.push(current - width);
      if (y < height - 1) stack.push(current + width);
    }

    if (component.length > 0) {
      components.push(component);
    }
  }

  components.sort((a, b) => b.length - a.length);
  return components;
}

async function buildSingleColorOverlayFromMask(maskImageData, color = { r: 226, g: 90, b: 40 }, alpha = 115) {
  const overlayData = new ImageData(maskImageData.width, maskImageData.height);
  for (let index = 0; index < maskImageData.data.length; index += 4) {
    if (maskImageData.data[index] <= 0) continue;
    overlayData.data[index] = color.r;
    overlayData.data[index + 1] = color.g;
    overlayData.data[index + 2] = color.b;
    overlayData.data[index + 3] = alpha;
  }
  return imageDataToBitmap(overlayData);
}

async function buildComponentOverlayFromMask(maskImageData, segments, alpha = 115) {
  const width = maskImageData.width;
  const height = maskImageData.height;
  const maskValues = new Uint8Array(width * height);
  for (let index = 0; index < maskValues.length; index += 1) {
    maskValues[index] = maskImageData.data[index * 4] > 0 ? 1 : 0;
  }

  const components = splitConnectedComponents(maskValues, width, height);
  const overlayData = new ImageData(width, height);

  components.forEach((component, index) => {
    const color = hexToRgb(segments[index]?.color || "#e25a28");
    component.forEach((pixelIndex) => {
      const offset = pixelIndex * 4;
      overlayData.data[offset] = color.r;
      overlayData.data[offset + 1] = color.g;
      overlayData.data[offset + 2] = color.b;
      overlayData.data[offset + 3] = alpha;
    });
  });

  return imageDataToBitmap(overlayData);
}

async function buildScaleOverlay(selected) {
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = naturalWidth;
  overlayCanvas.height = naturalHeight;
  const overlayCtx = overlayCanvas.getContext("2d");
  const overlayData = overlayCtx.createImageData(naturalWidth, naturalHeight);

  for (let index = 0; index < selected.length; index += 1) {
    if (!selected[index]) continue;
    const offset = index * 4;
    overlayData.data[offset] = 24;
    overlayData.data[offset + 1] = 220;
    overlayData.data[offset + 2] = 235;
    overlayData.data[offset + 3] = 135;
  }

  overlayCtx.putImageData(overlayData, 0, 0);
  return createImageBitmap(overlayCanvas);
}

async function detectScaleBarAt(point) {
  if (!sourceImageData) {
    setStatus("Open an image first.");
    return;
  }

  const x = Math.max(0, Math.min(naturalWidth - 1, Math.round(point.x)));
  const y = Math.max(0, Math.min(naturalHeight - 1, Math.round(point.y)));
  const startIndex = y * naturalWidth + x;
  const source = sourceImageData.data;
  const startOffset = startIndex * 4;
  const target = {
    r: source[startOffset],
    g: source[startOffset + 1],
    b: source[startOffset + 2],
  };
  const tolerance = 42;
  const visited = new Uint8Array(naturalWidth * naturalHeight);
  const selected = new Uint8Array(naturalWidth * naturalHeight);
  const stack = [startIndex];
  let count = 0;
  let minX = x;
  let maxX = x;

  while (stack.length > 0) {
    const index = stack.pop();
    if (visited[index]) continue;
    visited[index] = 1;
    if (colorDistanceAt(source, index, target) > tolerance) continue;

    selected[index] = 1;
    count += 1;
    const px = index % naturalWidth;
    const py = Math.floor(index / naturalWidth);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);

    if (px > 0) stack.push(index - 1);
    if (px < naturalWidth - 1) stack.push(index + 1);
    if (py > 0) stack.push(index - naturalWidth);
    if (py < naturalHeight - 1) stack.push(index + naturalWidth);
  }

  if (count === 0) {
    scaleOverlayBitmap = null;
    draw();
    setStatus("Could not detect a matching scale bar region from that click.");
    return;
  }

  scaleOverlayBitmap = await buildScaleOverlay(selected);
  scalePixelInput.value = String(maxX - minX + 1);
  updatePixelSizeFromCalibration();
  draw();
  setStatus(`Scale bar region selected: ${maxX - minX + 1} px wide.`);
}

function getPixelScale() {
  const raw = Number(pixelSizeInput.value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const unit = (pixelUnitInput.value || "").trim() || "unit";
  return { value: raw, unit };
}

function formatLength(pixelValue, scale) {
  if (!scale) return formatNumber(pixelValue);
  return formatNumber(Number(pixelValue || 0) * scale.value);
}

function formatArea(pixelArea, scale) {
  if (!scale) return `${pixelArea}`;
  return formatNumber(Number(pixelArea || 0) * scale.value * scale.value);
}

function updateMeasurementHeaders() {
  const scale = getPixelScale();
  const lengthUnit = scale ? scale.unit : "px";
  const areaUnit = scale ? `${scale.unit}²` : "px²";
  avgFeretHeader.textContent = `Avg Feret (${lengthUnit})`;
  areaHeader.textContent = `Area (${areaUnit})`;
  feretMaxHeader.textContent = `Feret max (${lengthUnit})`;
  feretMinHeader.textContent = `Min Feret (${lengthUnit})`;
  eqDiameterHeader.textContent = `Eq. diameter (${lengthUnit})`;
  bboxWidthHeader.textContent = `BBox W (${lengthUnit})`;
  bboxHeightHeader.textContent = `BBox H (${lengthUnit})`;
}

function isEditMode() {
  return mode === "brush" || mode === "eraser";
}

function clientToImageCoords(event) {
  const rect = stage.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * naturalWidth,
    y: ((event.clientY - rect.top) / rect.height) * naturalHeight,
  };
}

function ensureMaskCanvas() {
  if (maskCanvas) return;
  maskCanvas = document.createElement("canvas");
  maskCanvas.width = naturalWidth;
  maskCanvas.height = naturalHeight;
  maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskCtx.fillStyle = "#000000";
  maskCtx.fillRect(0, 0, naturalWidth, naturalHeight);
}

function prepareSourceImageData() {
  if (!imageBitmap) return;
  sourceImageCanvas = document.createElement("canvas");
  sourceImageCanvas.width = naturalWidth;
  sourceImageCanvas.height = naturalHeight;
  sourceImageCtx = sourceImageCanvas.getContext("2d", { willReadFrequently: true });
  sourceImageCtx.drawImage(imageBitmap, 0, 0, naturalWidth, naturalHeight);
  sourceImageData = sourceImageCtx.getImageData(0, 0, naturalWidth, naturalHeight);
}

function clonePoints() {
  return points.map((point) => ({ ...point }));
}

function cloneMeasurements() {
  return measurements.map((measurement) => ({ ...measurement }));
}

function overlayBitmapToDataUrl() {
  if (!overlayBitmap) return null;
  const canvas = document.createElement("canvas");
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  canvas.getContext("2d").drawImage(overlayBitmap, 0, 0, naturalWidth, naturalHeight);
  return canvas.toDataURL("image/png");
}

function captureSnapshot({ includeMask = false } = {}) {
  return {
    points: clonePoints(),
    measurements: cloneMeasurements(),
    overlayDataUrl: overlayBitmapToDataUrl(),
    maskImageData: includeMask && maskCtx ? maskCtx.getImageData(0, 0, naturalWidth, naturalHeight) : null,
  };
}

function pushHistory(snapshot) {
  actionHistory.push(snapshot);
  if (actionHistory.length > 100) {
    actionHistory.shift();
  }
}

async function restoreSnapshot(snapshot) {
  points = snapshot.points.map((point) => ({ ...point }));
  measurements = snapshot.measurements.map((measurement) => ({ ...measurement }));
  if (snapshot.maskImageData && maskCtx) {
    maskCtx.putImageData(snapshot.maskImageData, 0, 0);
  }
  overlayBitmap = snapshot.overlayDataUrl ? await loadBitmap(snapshot.overlayDataUrl) : null;
  maskDirty = false;
  currentStrokePoints = [];
  pendingStrokeSnapshot = null;
  renderPointList();
  draw();
  renderResults(measurements);
}

async function undoLastAction() {
  if (actionHistory.length === 0) {
    setStatus("Nothing to undo.");
    return;
  }
  const snapshot = actionHistory.pop();
  await restoreSnapshot(snapshot);
  setStatus("Undid last action.");
}

async function refreshOverlayFromMaskCanvas() {
  if (!maskCanvas || !maskCtx) {
    overlayBitmap = null;
    return;
  }
  const maskImageData = maskCtx.getImageData(0, 0, naturalWidth, naturalHeight);
  overlayBitmap = await buildSingleColorOverlayFromMask(maskImageData);
}

async function setMaskFromUrl(maskUrl) {
  ensureMaskCanvas();
  const bitmap = await loadBitmap(maskUrl);
  maskCtx.clearRect(0, 0, naturalWidth, naturalHeight);
  maskCtx.drawImage(bitmap, 0, 0, naturalWidth, naturalHeight);
  await refreshOverlayFromMaskCanvas();
  maskDirty = false;
  currentStrokePoints = [];
  actionHistory = [];
}

function drawMaskStroke(fromPoint, toPoint) {
  if (!maskCtx) return;
  maskCtx.save();
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  maskCtx.lineWidth = Number(brushSize.value);
  maskCtx.strokeStyle = mode === "brush" ? "#ffffff" : "#000000";
  maskCtx.globalCompositeOperation = "source-over";
  maskCtx.beginPath();
  maskCtx.moveTo(fromPoint.x, fromPoint.y);
  maskCtx.lineTo(toPoint.x, toPoint.y);
  maskCtx.stroke();
  maskCtx.restore();
  maskDirty = true;
}

function drawTransientStroke() {
  if (currentStrokePoints.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, (Number(brushSize.value) / naturalWidth) * stage.width);
  ctx.strokeStyle = mode === "brush" ? "rgba(226, 90, 40, 0.55)" : "rgba(20, 26, 32, 0.55)";
  ctx.beginPath();
  currentStrokePoints.forEach((point, index) => {
    const x = (point.x / naturalWidth) * stage.width;
    const y = (point.y / naturalHeight) * stage.height;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.restore();
}

async function loadBitmap(url) {
  const blob = await fetch(url).then((response) => response.blob());
  return createImageBitmap(blob);
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  setStatus("Uploading image and preparing model. CPU mode can take a while.");
  const response = await fetch("/api/images", {
    method: "POST",
    headers: { "X-Filename": encodeURIComponent(file.name) },
    body: await file.arrayBuffer(),
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Image upload failed.");
    return;
  }
  imageId = data.image_id;
  naturalWidth = data.width;
  naturalHeight = data.height;
  points = [];
  measurements = [];
  maskCanvas = null;
  maskCtx = null;
  overlayBitmap = null;
  maskDirty = false;
  currentStrokePoints = [];
  pendingStrokeSnapshot = null;
  actionHistory = [];
  hoveredPointIndex = null;
  imageBitmap = await loadBitmap(data.image_data_url);
  prepareSourceImageData();
  ensureMaskCanvas();
  scaleOverlayBitmap = null;
  setScalePickMode(false);
  fitCanvas();
  draw();
  renderPointList();
  renderResults();
  setStatus("Image ready. Add points, paint the mask directly, or segment an object.");
});

positiveBtn.addEventListener("click", () => setMode("positive"));
negativeBtn.addEventListener("click", () => setMode("negative"));
brushBtn.addEventListener("click", () => setMode("brush"));
eraserBtn.addEventListener("click", () => setMode("eraser"));
brushSize.addEventListener("input", () => {
  brushSizeValue.textContent = `${brushSize.value} px`;
});
pointOpacity.addEventListener("input", () => {
  updateOpacityLabels();
  renderPointList();
  draw();
});
overlayOpacity.addEventListener("input", () => {
  updateOpacityLabels();
  draw();
});
scalePixelInput.addEventListener("input", updatePixelSizeFromCalibration);
scaleLengthInput.addEventListener("input", updatePixelSizeFromCalibration);
pixelSizeInput.addEventListener("input", () => renderResults(measurements));
pixelUnitInput.addEventListener("change", () => renderResults(measurements));
pointList.addEventListener("mouseover", (event) => {
  const item = event.target.closest("li[data-point-index]");
  if (!item) return;
  const index = Number(item.dataset.pointIndex);
  if (!Number.isInteger(index) || hoveredPointIndex === index) return;
  hoveredPointIndex = index;
  renderPointList();
  draw();
});
pointList.addEventListener("mouseout", (event) => {
  const item = event.target.closest("li[data-point-index]");
  if (!item) return;
  const nextTarget = event.relatedTarget;
  if (nextTarget && item.contains(nextTarget)) return;
  if (hoveredPointIndex === null) return;
  hoveredPointIndex = null;
  renderPointList();
  draw();
});
pointList.addEventListener("click", (event) => {
  const button = event.target.closest(".pointDeleteBtn");
  if (!button) return;
  const index = Number(button.dataset.pointIndex);
  if (!Number.isInteger(index)) return;
  pushHistory(captureSnapshot());
  points.splice(index, 1);
  if (hoveredPointIndex === index) {
    hoveredPointIndex = null;
  } else if (hoveredPointIndex !== null && hoveredPointIndex > index) {
    hoveredPointIndex -= 1;
  }
  renderPointList();
  draw();
  setStatus("Removed point.");
});
scalePickBtn.addEventListener("click", () => {
  if (!imageBitmap) {
    setStatus("Open an image first.");
    return;
  }
  setScalePickMode(!isScalePickMode);
  if (isScalePickMode) {
    setStatus("Pick Scale Bar mode is on. Click the scale bar to highlight it and fill the pixel width.");
  } else {
    setStatus("Pick Scale Bar mode cancelled.");
  }
});

clearBtn.addEventListener("click", () => {
  points = [];
  hoveredPointIndex = null;
  measurements = [];
  overlayBitmap = null;
  scaleOverlayBitmap = null;
  currentStrokePoints = [];
  pendingStrokeSnapshot = null;
  actionHistory = [];
  maskDirty = false;
  setScalePickMode(false);
  if (maskCtx) {
    maskCtx.clearRect(0, 0, naturalWidth, naturalHeight);
    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, naturalWidth, naturalHeight);
  }
  draw();
  renderPointList();
  renderResults();
  setStatus("Cleared points, overlays, and local mask edits.");
});

segmentBtn.addEventListener("click", async () => {
  if (!imageId || points.length === 0) {
    setStatus("Open an image and add at least one positive point.");
    return;
  }
  setStatus("Segmenting...");
  const response = await fetch("/api/segment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_id: imageId, points }),
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Segmentation failed.");
    return;
  }
  await setMaskFromUrl(data.mask_data_url);
  measurements = [];
  renderResults();
  draw();
  renderPointList();
  setStatus(`Mask generated. Score ${data.score.toFixed(3)}.`);
});

calculateBtn.addEventListener("click", async () => {
  if (!imageId || !maskCanvas) {
    setStatus("Open an image first.");
    return;
  }
  measurements = [];
  renderLoadingResults();
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("Calculating pixel measurements...");
  const response = await fetch("/api/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_id: imageId,
      mask_data_url: maskCanvas.toDataURL("image/png"),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Calculation failed.");
    renderResults();
    return;
  }

  measurements = data.segments;
  overlayBitmap = await buildComponentOverlayFromMask(maskCtx.getImageData(0, 0, naturalWidth, naturalHeight), measurements);
  maskDirty = false;
  currentStrokePoints = [];
  renderResults(measurements);
  draw();
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus(`Calculated ${measurements.length} segment measurements in pixels.`);
});

stage.addEventListener("pointerdown", (event) => {
  if (!imageBitmap) return;
  const point = clientToImageCoords(event);
  if (isScalePickMode) {
    detectScaleBarAt(point);
    setScalePickMode(false);
    return;
  }
  if (isEditMode()) {
    ensureMaskCanvas();
    isDrawing = true;
    pendingStrokeSnapshot = captureSnapshot({ includeMask: true });
    lastDrawPoint = point;
    currentStrokePoints = [point];
    drawMaskStroke(point, point);
    draw();
    stage.setPointerCapture(event.pointerId);
    return;
  }
  pushHistory(captureSnapshot());
  points.push({ x: point.x, y: point.y, type: mode });
  renderPointList();
  draw();
});

stage.addEventListener("pointermove", (event) => {
  if (!isDrawing || !isEditMode()) return;
  const point = clientToImageCoords(event);
  const previous = lastDrawPoint || point;
  drawMaskStroke(previous, point);
  lastDrawPoint = point;
  currentStrokePoints.push(point);
  draw();
});

stage.addEventListener("pointerup", async (event) => {
  if (!isDrawing) return;
  isDrawing = false;
  lastDrawPoint = null;
  stage.releasePointerCapture(event.pointerId);
  if (pendingStrokeSnapshot) {
    pushHistory(pendingStrokeSnapshot);
  }
  pendingStrokeSnapshot = null;
  currentStrokePoints = [];
  measurements = [];
  await refreshOverlayFromMaskCanvas();
  maskDirty = false;
  draw();
  renderResults();
  setStatus("Mask edit applied locally. Run Calculate to update measurements.");
});

stage.addEventListener("pointerleave", () => {
  if (!isDrawing) return;
  lastDrawPoint = null;
});

window.addEventListener("keydown", async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    await undoLastAction();
  }
});

window.addEventListener("resize", () => {
  fitCanvas();
  draw();
});

updateOpacityLabels();
