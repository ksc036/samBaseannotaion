const fileInput = document.getElementById("fileInput");
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");
const statusEl = document.getElementById("status");
const pointList = document.getElementById("pointList");
const patchList = document.getElementById("patchList");
const patchSummary = document.getElementById("patchSummary");
const positiveBtn = document.getElementById("positiveBtn");
const negativeBtn = document.getElementById("negativeBtn");
const patchBtn = document.getElementById("patchBtn");
const deletePatchBtn = document.getElementById("deletePatchBtn");
const removePointBtn = document.getElementById("removePointBtn");
const brushBtn = document.getElementById("brushBtn");
const eraserBtn = document.getElementById("eraserBtn");
const segmentBtn = document.getElementById("segmentBtn");
const calculateBtn = document.getElementById("calculateBtn");
const clearBtn = document.getElementById("clearBtn");
const controlsToggleBtn = document.getElementById("controlsToggleBtn");
const controlsPanel = document.getElementById("controlsPanel");
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
const exportResultsBtn = document.getElementById("exportResultsBtn");
const stageWrap = document.getElementById("stageWrap");
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
let globalWorkspace = null;
let patches = [];
let activePatchId = null;
let measurements = [];
let combinedOverlayBitmap = null;
let scaleOverlayBitmap = null;
let isScalePickMode = false;
let isDrawing = false;
let drawingWorkspaceId = null;
let isPatchDrawing = false;
let patchDrawStart = null;
let patchDraftRect = null;
let controlsCollapsed = false;
let patchCounter = 0;
let selectedMeasurementIds = new Set();

function setStatus(text) {
  statusEl.textContent = text;
}

function createMaskCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const maskCtx = canvas.getContext("2d", { willReadFrequently: true });
  maskCtx.fillStyle = "#000000";
  maskCtx.fillRect(0, 0, width, height);
  return { canvas, maskCtx };
}

function createWorkspace(id, rect, name) {
  const { canvas, maskCtx } = createMaskCanvas(rect.width, rect.height);
  return {
    id,
    name,
    rect: { ...rect },
    points: [],
    maskCanvas: canvas,
    maskCtx,
    overlayBitmap: null,
    actionHistory: [],
    hoveredPointIndex: null,
    currentStrokePoints: [],
    pendingStrokeSnapshot: null,
  };
}

function resetGlobalWorkspace() {
  globalWorkspace = createWorkspace("full-image", { x: 0, y: 0, width: naturalWidth, height: naturalHeight }, "Full image");
}

function setControlsCollapsed(collapsed) {
  controlsCollapsed = collapsed;
  controlsPanel.classList.toggle("collapsed", collapsed);
  controlsToggleBtn.textContent = collapsed ? "Show Controls" : "Hide Controls";
}

function hasExplicitPatches() {
  return patches.length > 0;
}

function getCurrentWorkspaces() {
  if (hasExplicitPatches()) return patches;
  return globalWorkspace ? [globalWorkspace] : [];
}

function getPatchIndex(workspaceId) {
  return patches.findIndex((patch) => patch.id === workspaceId);
}

function workspaceLabel(workspace) {
  if (!workspace) return "No workspace";
  if (!hasExplicitPatches()) return "Full image";
  const index = getPatchIndex(workspace.id);
  return index >= 0 ? `Patch ${index + 1}` : workspace.name;
}

function getActiveWorkspace() {
  if (!hasExplicitPatches()) return globalWorkspace;
  return patches.find((patch) => patch.id === activePatchId) || patches[0] || null;
}

function clearHoveredPoints() {
  getCurrentWorkspaces().forEach((workspace) => {
    workspace.hoveredPointIndex = null;
  });
}

function renderPatchSummary() {
  const activeWorkspace = getActiveWorkspace();
  if (!hasExplicitPatches()) {
    patchSummary.textContent = "Whole image mode";
    return;
  }
  if (!activeWorkspace) {
    patchSummary.textContent = `Patch mode · ${patches.length} patch(es)`;
    return;
  }
  patchSummary.textContent = `${workspaceLabel(activeWorkspace)} active · ${activeWorkspace.rect.width} × ${activeWorkspace.rect.height}px`;
}

function renderPatchList() {
  patchList.innerHTML = "";
  if (!hasExplicitPatches()) {
    const item = document.createElement("li");
    item.textContent = "No patches yet";
    patchList.append(item);
    deletePatchBtn.disabled = true;
    renderPatchSummary();
    return;
  }

  patches.forEach((patch, index) => {
    const item = document.createElement("li");
    item.dataset.patchId = patch.id;
    item.classList.toggle("active", patch.id === activePatchId);

    const title = document.createElement("span");
    title.textContent = `Patch ${index + 1}`;

    const meta = document.createElement("span");
    meta.className = "patchMeta";
    meta.textContent = `${patch.rect.width}×${patch.rect.height}`;

    item.append(title, meta);
    patchList.append(item);
  });

  deletePatchBtn.disabled = false;
  renderPatchSummary();
}

function renderPointList() {
  pointList.innerHTML = "";
  const workspace = getActiveWorkspace();
  if (!workspace) return;
  workspace.points.forEach((point, index) => {
    const item = document.createElement("li");
    item.classList.toggle("active", workspace.hoveredPointIndex === index);
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

function setMode(nextMode) {
  mode = nextMode;
  setScalePickMode(false);
  if (mode !== "point-remove") {
    clearHoveredPoints();
    renderPointList();
  }
  positiveBtn.classList.toggle("active", mode === "positive");
  negativeBtn.classList.toggle("active", mode === "negative");
  patchBtn.classList.toggle("active", mode === "patch-draw");
  removePointBtn.classList.toggle("active", mode === "point-remove");
  brushBtn.classList.toggle("active", mode === "brush");
  eraserBtn.classList.toggle("active", mode === "eraser");
  updateStageCursor();
  draw();
}

function updateStageCursor() {
  const showCrosshair =
    isScalePickMode ||
    mode === "positive" ||
    mode === "negative" ||
    mode === "patch-draw" ||
    mode === "point-remove" ||
    mode === "brush" ||
    mode === "eraser";
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
  const maxW = Math.max(320, stageWrap.clientWidth - 36);
  const maxH = Math.max(240, stageWrap.clientHeight - 36);
  const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1);
  stage.width = Math.round(naturalWidth * scale);
  stage.height = Math.round(naturalHeight * scale);
}

function clientToImageCoords(event) {
  const rect = stage.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * naturalWidth,
    y: ((event.clientY - rect.top) / rect.height) * naturalHeight,
  };
}

function clampPointToImage(point) {
  return {
    x: Math.max(0, Math.min(naturalWidth, point.x)),
    y: Math.max(0, Math.min(naturalHeight, point.y)),
  };
}

function normalizeRect(startPoint, endPoint) {
  const x1 = Math.floor(Math.min(startPoint.x, endPoint.x));
  const y1 = Math.floor(Math.min(startPoint.y, endPoint.y));
  const x2 = Math.ceil(Math.max(startPoint.x, endPoint.x));
  const y2 = Math.ceil(Math.max(startPoint.y, endPoint.y));
  return {
    x: Math.max(0, x1),
    y: Math.max(0, y1),
    width: Math.min(naturalWidth, x2) - Math.max(0, x1),
    height: Math.min(naturalHeight, y2) - Math.max(0, y1),
  };
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function absToLocal(workspace, point) {
  return {
    x: point.x - workspace.rect.x,
    y: point.y - workspace.rect.y,
  };
}

function localToAbs(workspace, point) {
  return {
    x: workspace.rect.x + point.x,
    y: workspace.rect.y + point.y,
  };
}

function clampPointToWorkspace(workspace, point) {
  return {
    x: Math.max(workspace.rect.x, Math.min(workspace.rect.x + workspace.rect.width, point.x)),
    y: Math.max(workspace.rect.y, Math.min(workspace.rect.y + workspace.rect.height, point.y)),
  };
}

function getWorkspaceAtPoint(point) {
  if (!hasExplicitPatches()) return globalWorkspace;
  for (let index = patches.length - 1; index >= 0; index -= 1) {
    if (pointInRect(point, patches[index].rect)) {
      return patches[index];
    }
  }
  return null;
}

function setActivePatch(patchId) {
  activePatchId = patchId;
  clearHoveredPoints();
  renderPatchList();
  renderPointList();
  draw();
}

function setHoveredPointIndex(workspace, index) {
  const currentWorkspace = getActiveWorkspace();
  let changed = false;
  getCurrentWorkspaces().forEach((candidate) => {
    const nextIndex = candidate === workspace ? index : null;
    if (candidate.hoveredPointIndex !== nextIndex) {
      candidate.hoveredPointIndex = nextIndex;
      changed = true;
    }
  });
  if (!changed) return;
  if (workspace && currentWorkspace && workspace.id !== currentWorkspace.id) {
    setActivePatch(workspace.id);
    return;
  }
  renderPointList();
  draw();
}

function findNearestPointIndex(workspace, absolutePoint, thresholdScreenPx = 16) {
  if (!workspace || workspace.points.length === 0 || !stage.width || !stage.height) return null;
  const localPoint = absToLocal(workspace, absolutePoint);
  const thresholdLocalX = (thresholdScreenPx / stage.width) * naturalWidth;
  const thresholdLocalY = (thresholdScreenPx / stage.height) * naturalHeight;
  const thresholdSq = thresholdLocalX * thresholdLocalX + thresholdLocalY * thresholdLocalY;
  let nearestIndex = null;
  let nearestDistanceSq = thresholdSq;
  workspace.points.forEach((point, index) => {
    const dx = point.x - localPoint.x;
    const dy = point.y - localPoint.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq <= nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
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

function renderResults(rows = []) {
  updateMeasurementHeaders();
  resultsBody.innerHTML = "";
  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.className = "emptyCell";
    cell.textContent = "No calculation yet.";
    row.append(cell);
    resultsBody.append(row);
    exportResultsBtn.disabled = true;
    return;
  }

  const scale = getPixelScale();
  rows.forEach((segment, index) => {
    const row = document.createElement("tr");
    const selectCell = document.createElement("td");
    selectCell.className = "resultSelectCell";
    const selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.className = "resultSelect";
    selectInput.checked = selectedMeasurementIds.has(segment.segment_id);
    selectInput.dataset.segmentId = segment.segment_id;
    selectCell.append(selectInput);

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

    row.append(selectCell, colorCell, segmentCell, avgFeretCell, areaCell, feretMaxCell, feretMinCell, eqCell, bboxWidthCell, bboxHeightCell);
    resultsBody.append(row);
  });
  exportResultsBtn.disabled = rows.length === 0;
}

function renderLoadingResults() {
  resultsBody.innerHTML = "";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 10;
  cell.className = "emptyCell";
  cell.textContent = "Calculating...";
  row.append(cell);
  resultsBody.append(row);
  exportResultsBtn.disabled = true;
}

function updateOpacityLabels() {
  pointOpacityValue.textContent = `${pointOpacity.value}%`;
  overlayOpacityValue.textContent = `${overlayOpacity.value}%`;
}

function updatePixelSizeFromCalibration() {
  const pixelWidth = Number(scalePixelInput.value);
  const actualLength = Number(scaleLengthInput.value);
  if (!Number.isFinite(pixelWidth) || pixelWidth <= 0 || !Number.isFinite(actualLength) || actualLength <= 0) {
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

function prepareSourceImageData() {
  if (!imageBitmap) return;
  sourceImageCanvas = document.createElement("canvas");
  sourceImageCanvas.width = naturalWidth;
  sourceImageCanvas.height = naturalHeight;
  sourceImageCtx = sourceImageCanvas.getContext("2d", { willReadFrequently: true });
  sourceImageCtx.drawImage(imageBitmap, 0, 0, naturalWidth, naturalHeight);
  sourceImageData = sourceImageCtx.getImageData(0, 0, naturalWidth, naturalHeight);
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

function loadBitmap(url) {
  return fetch(url)
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob));
}

function workspaceOverlayToDataUrl(workspace) {
  if (!workspace.overlayBitmap) return null;
  const canvas = document.createElement("canvas");
  canvas.width = workspace.rect.width;
  canvas.height = workspace.rect.height;
  canvas.getContext("2d").drawImage(workspace.overlayBitmap, 0, 0, workspace.rect.width, workspace.rect.height);
  return canvas.toDataURL("image/png");
}

function captureWorkspaceSnapshot(workspace, { includeMask = false } = {}) {
  return {
    points: workspace.points.map((point) => ({ ...point })),
    overlayDataUrl: workspaceOverlayToDataUrl(workspace),
    maskImageData: includeMask ? workspace.maskCtx.getImageData(0, 0, workspace.rect.width, workspace.rect.height) : null,
  };
}

function pushWorkspaceHistory(workspace, snapshot) {
  workspace.actionHistory.push(snapshot);
  if (workspace.actionHistory.length > 100) {
    workspace.actionHistory.shift();
  }
}

async function restoreWorkspaceSnapshot(workspace, snapshot) {
  workspace.points = snapshot.points.map((point) => ({ ...point }));
  if (snapshot.maskImageData) {
    workspace.maskCtx.putImageData(snapshot.maskImageData, 0, 0);
  }
  workspace.overlayBitmap = snapshot.overlayDataUrl ? await loadBitmap(snapshot.overlayDataUrl) : null;
  workspace.currentStrokePoints = [];
  workspace.pendingStrokeSnapshot = null;
  measurements = [];
  combinedOverlayBitmap = null;
  renderPointList();
  renderResults();
  draw();
}

async function undoLastAction() {
  const workspace = getActiveWorkspace();
  if (!workspace || workspace.actionHistory.length === 0) {
    setStatus("Nothing to undo.");
    return;
  }
  const snapshot = workspace.actionHistory.pop();
  await restoreWorkspaceSnapshot(workspace, snapshot);
  setStatus(`Undid last action in ${workspaceLabel(workspace)}.`);
}

async function refreshWorkspaceOverlay(workspace) {
  const maskImageData = workspace.maskCtx.getImageData(0, 0, workspace.rect.width, workspace.rect.height);
  workspace.overlayBitmap = await buildSingleColorOverlayFromMask(maskImageData);
}

async function setWorkspaceMaskFromUrl(workspace, maskUrl) {
  const bitmap = await loadBitmap(maskUrl);
  workspace.maskCtx.clearRect(0, 0, workspace.rect.width, workspace.rect.height);
  workspace.maskCtx.drawImage(bitmap, 0, 0, workspace.rect.width, workspace.rect.height);
  await refreshWorkspaceOverlay(workspace);
  workspace.currentStrokePoints = [];
  workspace.pendingStrokeSnapshot = null;
  workspace.actionHistory = [];
}

function invalidateCalculatedResults() {
  measurements = [];
  combinedOverlayBitmap = null;
  selectedMeasurementIds = new Set();
  renderResults();
}

function exportSelectedMeasurements() {
  const selectedRows = measurements.filter((segment) => selectedMeasurementIds.has(segment.segment_id));
  if (selectedRows.length === 0) {
    setStatus("Select at least one measurement row to export.");
    return;
  }
  if (!window.XLSX) {
    setStatus("XLSX export library is not loaded yet. Please refresh and try again.");
    return;
  }

  const scale = getPixelScale();
  const lengthUnit = scale ? scale.unit : "px";
  const areaUnit = scale ? `${scale.unit}²` : "px²";
  const headers = [
    "Segment",
    `Avg Feret (${lengthUnit})`,
    `Area (${areaUnit})`,
    `Feret max (${lengthUnit})`,
    `Min Feret (${lengthUnit})`,
    `Eq. diameter (${lengthUnit})`,
    `BBox W (${lengthUnit})`,
    `BBox H (${lengthUnit})`,
  ];

  const bodyRows = selectedRows.map((segment) => ({
    [headers[0]]: `#${measurements.findIndex((candidate) => candidate.segment_id === segment.segment_id) + 1}`,
    [headers[1]]: formatLength((Number(segment.feret_max_pixels || 0) + Number(segment.feret_min_pixels || 0)) / 2, scale),
    [headers[2]]: formatArea(segment.area_pixels, scale),
    [headers[3]]: formatLength(segment.feret_max_pixels, scale),
    [headers[4]]: formatLength(segment.feret_min_pixels, scale),
    [headers[5]]: formatLength(segment.equivalent_diameter_pixels, scale),
    [headers[6]]: formatLength(segment.bbox_width_pixels, scale),
    [headers[7]]: formatLength(segment.bbox_height_pixels, scale),
  }));

  const worksheet = window.XLSX.utils.json_to_sheet(bodyRows, { header: headers });
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "Measurements");
  window.XLSX.writeFile(workbook, "segment_measurements.xlsx");
  setStatus(`Exported ${selectedRows.length} selected measurement row(s) to XLSX.`);
}

function clearWorkspaceMask(workspace) {
  workspace.maskCtx.clearRect(0, 0, workspace.rect.width, workspace.rect.height);
  workspace.maskCtx.fillStyle = "#000000";
  workspace.maskCtx.fillRect(0, 0, workspace.rect.width, workspace.rect.height);
  workspace.overlayBitmap = null;
  workspace.currentStrokePoints = [];
  workspace.pendingStrokeSnapshot = null;
  workspace.actionHistory = [];
}

function drawMaskStroke(workspace, fromAbsPoint, toAbsPoint) {
  const fromPoint = absToLocal(workspace, clampPointToWorkspace(workspace, fromAbsPoint));
  const toPoint = absToLocal(workspace, clampPointToWorkspace(workspace, toAbsPoint));
  workspace.maskCtx.save();
  workspace.maskCtx.lineCap = "round";
  workspace.maskCtx.lineJoin = "round";
  workspace.maskCtx.lineWidth = Number(brushSize.value);
  workspace.maskCtx.strokeStyle = mode === "brush" ? "#ffffff" : "#000000";
  workspace.maskCtx.globalCompositeOperation = "source-over";
  workspace.maskCtx.beginPath();
  workspace.maskCtx.moveTo(fromPoint.x, fromPoint.y);
  workspace.maskCtx.lineTo(toPoint.x, toPoint.y);
  workspace.maskCtx.stroke();
  workspace.maskCtx.restore();
}

function drawTransientStroke(workspace) {
  if (!workspace || workspace.currentStrokePoints.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, (Number(brushSize.value) / naturalWidth) * stage.width);
  ctx.strokeStyle = mode === "brush" ? "rgba(226, 90, 40, 0.55)" : "rgba(20, 26, 32, 0.55)";
  ctx.beginPath();
  workspace.currentStrokePoints.forEach((point, index) => {
    const absolute = localToAbs(workspace, point);
    const x = (absolute.x / naturalWidth) * stage.width;
    const y = (absolute.y / naturalHeight) * stage.height;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.restore();
}

function drawPatchFrames() {
  if (!hasExplicitPatches()) return;
  patches.forEach((workspace, index) => {
    const x = (workspace.rect.x / naturalWidth) * stage.width;
    const y = (workspace.rect.y / naturalHeight) * stage.height;
    const width = (workspace.rect.width / naturalWidth) * stage.width;
    const height = (workspace.rect.height / naturalHeight) * stage.height;
    const active = workspace.id === activePatchId;
    ctx.save();
    ctx.fillStyle = active ? "rgba(33, 94, 168, 0.08)" : "rgba(38, 51, 61, 0.04)";
    ctx.strokeStyle = active ? "rgba(33, 94, 168, 0.95)" : "rgba(61, 79, 94, 0.72)";
    ctx.lineWidth = active ? 3 : 2;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = active ? "rgba(33, 94, 168, 0.96)" : "rgba(61, 79, 94, 0.88)";
    ctx.fillRect(x, y, 62, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial";
    ctx.fillText(`Patch ${index + 1}`, x + 8, y + 14);
    ctx.restore();
  });
}

function drawPatchDraft() {
  if (!patchDraftRect) return;
  const x = (patchDraftRect.x / naturalWidth) * stage.width;
  const y = (patchDraftRect.y / naturalHeight) * stage.height;
  const width = (patchDraftRect.width / naturalWidth) * stage.width;
  const height = (patchDraftRect.height / naturalHeight) * stage.height;
  ctx.save();
  ctx.setLineDash([8, 5]);
  ctx.strokeStyle = "rgba(33, 94, 168, 0.95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

function drawPoints() {
  const pointAlpha = Number(pointOpacity.value) / 100;
  getCurrentWorkspaces().forEach((workspace) => {
    workspace.points.forEach((point, index) => {
      const absolute = localToAbs(workspace, point);
      const x = (absolute.x / naturalWidth) * stage.width;
      const y = (absolute.y / naturalHeight) * stage.height;
      const isHovered = workspace.hoveredPointIndex === index;
      ctx.beginPath();
      ctx.arc(x, y, isHovered ? 9 : 6, 0, Math.PI * 2);
      ctx.fillStyle = point.type === "positive" ? `rgba(22, 209, 116, ${pointAlpha})` : `rgba(255, 62, 62, ${pointAlpha})`;
      ctx.strokeStyle = isHovered ? "rgba(255, 214, 10, 0.95)" : `rgba(255, 255, 255, ${Math.max(pointAlpha, 0.35)})`;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.fill();
      ctx.stroke();
    });
  });
}

function draw() {
  ctx.clearRect(0, 0, stage.width, stage.height);
  if (!imageBitmap) return;
  ctx.drawImage(imageBitmap, 0, 0, stage.width, stage.height);

  if (combinedOverlayBitmap && measurements.length > 0) {
    ctx.save();
    ctx.globalAlpha = Number(overlayOpacity.value) / 100;
    ctx.drawImage(combinedOverlayBitmap, 0, 0, stage.width, stage.height);
    ctx.restore();
  } else {
    getCurrentWorkspaces().forEach((workspace) => {
      if (!workspace.overlayBitmap) return;
      const x = (workspace.rect.x / naturalWidth) * stage.width;
      const y = (workspace.rect.y / naturalHeight) * stage.height;
      const width = (workspace.rect.width / naturalWidth) * stage.width;
      const height = (workspace.rect.height / naturalHeight) * stage.height;
      ctx.save();
      ctx.globalAlpha = Number(overlayOpacity.value) / 100;
      ctx.drawImage(workspace.overlayBitmap, x, y, width, height);
      ctx.restore();
    });
  }

  if (scaleOverlayBitmap) {
    ctx.save();
    ctx.globalAlpha = Number(overlayOpacity.value) / 100;
    ctx.drawImage(scaleOverlayBitmap, 0, 0, stage.width, stage.height);
    ctx.restore();
  }

  drawPatchFrames();
  drawPatchDraft();
  if (drawingWorkspaceId) {
    drawTransientStroke(getCurrentWorkspaces().find((workspace) => workspace.id === drawingWorkspaceId) || null);
  }
  drawPoints();
}

function buildCombinedMaskCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const canvasCtx = canvas.getContext("2d", { willReadFrequently: true });
  canvasCtx.fillStyle = "#000000";
  canvasCtx.fillRect(0, 0, naturalWidth, naturalHeight);
  if (hasExplicitPatches()) {
    patches.forEach((workspace) => {
      canvasCtx.drawImage(workspace.maskCanvas, workspace.rect.x, workspace.rect.y);
    });
  } else if (globalWorkspace) {
    canvasCtx.drawImage(globalWorkspace.maskCanvas, 0, 0);
  }
  return { canvas, canvasCtx };
}

function getPointWorkspaceForInteraction(point) {
  if (!hasExplicitPatches()) return globalWorkspace;
  return getWorkspaceAtPoint(point);
}

function updateHoveredPointFromImagePoint(point) {
  if (mode !== "point-remove") {
    setHoveredPointIndex(null, null);
    return;
  }
  const workspace = getPointWorkspaceForInteraction(point);
  if (!workspace) {
    setHoveredPointIndex(null, null);
    return;
  }
  const pointIndex = findNearestPointIndex(workspace, point);
  setHoveredPointIndex(workspace, pointIndex);
}

function createPatch(rect) {
  patchCounter += 1;
  const workspace = createWorkspace(`patch-${Date.now()}-${patchCounter}`, rect, `Patch ${patchCounter}`);
  patches.push(workspace);
  activePatchId = workspace.id;
  renderPatchList();
  renderPointList();
  draw();
}

async function handleImageFile(file) {
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
  imageBitmap = await loadBitmap(data.image_data_url);
  prepareSourceImageData();
  resetGlobalWorkspace();
  patches = [];
  activePatchId = null;
  patchCounter = 0;
  measurements = [];
  combinedOverlayBitmap = null;
  scaleOverlayBitmap = null;
  isDrawing = false;
  drawingWorkspaceId = null;
  isPatchDrawing = false;
  patchDraftRect = null;
  patchDrawStart = null;
  fitCanvas();
  renderPatchList();
  renderPointList();
  renderResults();
  draw();
  setStatus("Image ready. Draw patches if you want ROI-specific work, or work on the full image directly.");
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  await handleImageFile(file);
});

positiveBtn.addEventListener("click", () => setMode("positive"));
negativeBtn.addEventListener("click", () => setMode("negative"));
patchBtn.addEventListener("click", () => {
  setMode("patch-draw");
  setStatus("Draw Patch mode is on. Drag a rectangle over the image to create an ROI patch.");
});
deletePatchBtn.addEventListener("click", () => {
  if (!hasExplicitPatches()) {
    setStatus("There is no patch to delete.");
    return;
  }
  const index = patches.findIndex((patch) => patch.id === activePatchId);
  if (index < 0) return;
  patches.splice(index, 1);
  activePatchId = patches[0]?.id || null;
  clearHoveredPoints();
  invalidateCalculatedResults();
  renderPatchList();
  renderPointList();
  draw();
  setStatus("Deleted the active patch.");
});
removePointBtn.addEventListener("click", () => {
  setMode("point-remove");
  setStatus("Remove Point mode is on. Move near a point to highlight it, then click to delete it.");
});
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

controlsToggleBtn.addEventListener("click", () => {
  setControlsCollapsed(!controlsCollapsed);
});

scalePixelInput.addEventListener("input", updatePixelSizeFromCalibration);
scaleLengthInput.addEventListener("input", updatePixelSizeFromCalibration);
pixelSizeInput.addEventListener("input", () => renderResults(measurements));
pixelUnitInput.addEventListener("change", () => renderResults(measurements));

patchList.addEventListener("click", (event) => {
  const item = event.target.closest("li[data-patch-id]");
  if (!item) return;
  setActivePatch(item.dataset.patchId);
  setStatus(`${workspaceLabel(getActiveWorkspace())} selected.`);
});

resultsBody.addEventListener("change", (event) => {
  const input = event.target.closest(".resultSelect");
  if (!input) return;
  const segmentId = input.dataset.segmentId;
  if (!segmentId) return;
  if (input.checked) {
    selectedMeasurementIds.add(segmentId);
  } else {
    selectedMeasurementIds.delete(segmentId);
  }
});

exportResultsBtn.addEventListener("click", () => {
  exportSelectedMeasurements();
});

pointList.addEventListener("mouseover", (event) => {
  const item = event.target.closest("li[data-point-index]");
  const workspace = getActiveWorkspace();
  if (!item || !workspace) return;
  const index = Number(item.dataset.pointIndex);
  if (!Number.isInteger(index)) return;
  setHoveredPointIndex(workspace, index);
});

pointList.addEventListener("mouseout", (event) => {
  const item = event.target.closest("li[data-point-index]");
  if (!item) return;
  const nextTarget = event.relatedTarget;
  if (nextTarget && item.contains(nextTarget)) return;
  setHoveredPointIndex(getActiveWorkspace(), null);
});

pointList.addEventListener("click", (event) => {
  const button = event.target.closest(".pointDeleteBtn");
  const workspace = getActiveWorkspace();
  if (!button || !workspace) return;
  const index = Number(button.dataset.pointIndex);
  if (!Number.isInteger(index)) return;
  pushWorkspaceHistory(workspace, captureWorkspaceSnapshot(workspace));
  workspace.points.splice(index, 1);
  workspace.hoveredPointIndex = null;
  invalidateCalculatedResults();
  renderPointList();
  draw();
  setStatus(`Removed a point from ${workspaceLabel(workspace)}.`);
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
  if (!globalWorkspace) return;
  resetGlobalWorkspace();
  patches = [];
  activePatchId = null;
  measurements = [];
  combinedOverlayBitmap = null;
  scaleOverlayBitmap = null;
  isDrawing = false;
  drawingWorkspaceId = null;
  isPatchDrawing = false;
  patchDraftRect = null;
  patchDrawStart = null;
  renderPatchList();
  renderPointList();
  renderResults();
  draw();
  setStatus("Cleared patches, points, overlays, and local mask edits.");
});

segmentBtn.addEventListener("click", async () => {
  const workspace = getActiveWorkspace();
  if (!imageId || !workspace || workspace.points.length === 0) {
    setStatus("Open an image and add at least one positive point.");
    return;
  }
  if (!workspace.points.some((point) => point.type === "positive")) {
    setStatus("Add at least one positive point before segmenting.");
    return;
  }

  setStatus(`Segmenting ${workspaceLabel(workspace)}...`);
  const payload = {
    image_id: imageId,
    points: workspace.points,
  };
  if (hasExplicitPatches()) {
    payload.patch = workspace.rect;
  }

  const response = await fetch("/api/segment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Segmentation failed.");
    return;
  }

  await setWorkspaceMaskFromUrl(workspace, data.mask_data_url);
  invalidateCalculatedResults();
  renderResults();
  draw();
  renderPointList();
  setStatus(`${workspaceLabel(workspace)} mask generated. Score ${data.score.toFixed(3)}.`);
});

calculateBtn.addEventListener("click", async () => {
  if (!imageId || !globalWorkspace) {
    setStatus("Open an image first.");
    return;
  }
  measurements = [];
  selectedMeasurementIds = new Set();
  renderLoadingResults();
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("Calculating pixel measurements...");

  const { canvas, canvasCtx } = buildCombinedMaskCanvas();
  const response = await fetch("/api/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_id: imageId,
      mask_data_url: canvas.toDataURL("image/png"),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Calculation failed.");
    renderResults();
    return;
  }

  measurements = data.segments;
  selectedMeasurementIds = new Set(measurements.map((segment) => segment.segment_id));
  combinedOverlayBitmap = await buildComponentOverlayFromMask(canvasCtx.getImageData(0, 0, naturalWidth, naturalHeight), measurements);
  renderResults(measurements);
  draw();
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus(`Calculated ${measurements.length} segment measurements in pixels.`);
});

stage.addEventListener("pointerdown", (event) => {
  if (!imageBitmap) return;
  const absolutePoint = clampPointToImage(clientToImageCoords(event));

  if (isScalePickMode) {
    detectScaleBarAt(absolutePoint);
    setScalePickMode(false);
    return;
  }

  if (mode === "patch-draw") {
    isPatchDrawing = true;
    patchDrawStart = absolutePoint;
    patchDraftRect = normalizeRect(absolutePoint, absolutePoint);
    draw();
    stage.setPointerCapture(event.pointerId);
    return;
  }

  const workspace = getPointWorkspaceForInteraction(absolutePoint);
  if (!workspace) {
    setStatus("Draw a patch first or click inside an existing patch.");
    return;
  }
  if (hasExplicitPatches() && workspace.id !== activePatchId) {
    setActivePatch(workspace.id);
  }

  if (mode === "point-remove") {
    const pointIndex = findNearestPointIndex(workspace, absolutePoint);
    if (pointIndex === null) {
      setStatus("Move closer to a point, then click to remove it.");
      return;
    }
    pushWorkspaceHistory(workspace, captureWorkspaceSnapshot(workspace));
    workspace.points.splice(pointIndex, 1);
    workspace.hoveredPointIndex = null;
    invalidateCalculatedResults();
    renderPointList();
    draw();
    setStatus(`Removed a point from ${workspaceLabel(workspace)}.`);
    return;
  }

  if (mode === "brush" || mode === "eraser") {
    isDrawing = true;
    drawingWorkspaceId = workspace.id;
    workspace.pendingStrokeSnapshot = captureWorkspaceSnapshot(workspace, { includeMask: true });
    const localStart = absToLocal(workspace, clampPointToWorkspace(workspace, absolutePoint));
    workspace.currentStrokePoints = [localStart];
    drawMaskStroke(workspace, absolutePoint, absolutePoint);
    invalidateCalculatedResults();
    draw();
    stage.setPointerCapture(event.pointerId);
    return;
  }

  pushWorkspaceHistory(workspace, captureWorkspaceSnapshot(workspace));
  workspace.points.push({
    ...absToLocal(workspace, absolutePoint),
    type: mode,
  });
  invalidateCalculatedResults();
  renderPointList();
  draw();
});

stage.addEventListener("pointermove", (event) => {
  if (!imageBitmap) return;
  const absolutePoint = clampPointToImage(clientToImageCoords(event));

  if (isPatchDrawing && patchDrawStart) {
    patchDraftRect = normalizeRect(patchDrawStart, absolutePoint);
    draw();
    return;
  }

  if (mode === "point-remove" && !isDrawing) {
    const workspace = getPointWorkspaceForInteraction(absolutePoint);
    if (!workspace) {
      setHoveredPointIndex(null, null);
      return;
    }
    const pointIndex = findNearestPointIndex(workspace, absolutePoint);
    setHoveredPointIndex(workspace, pointIndex);
    return;
  }

  if (!isDrawing || !drawingWorkspaceId) return;
  const workspace = getCurrentWorkspaces().find((candidate) => candidate.id === drawingWorkspaceId);
  if (!workspace) return;
  const lastPoint = workspace.currentStrokePoints[workspace.currentStrokePoints.length - 1];
  const lastAbsPoint = localToAbs(workspace, lastPoint);
  const nextAbsPoint = clampPointToWorkspace(workspace, absolutePoint);
  drawMaskStroke(workspace, lastAbsPoint, nextAbsPoint);
  workspace.currentStrokePoints.push(absToLocal(workspace, nextAbsPoint));
  draw();
});

stage.addEventListener("pointerup", async (event) => {
  if (isPatchDrawing) {
    isPatchDrawing = false;
    if (event.pointerId) {
      stage.releasePointerCapture(event.pointerId);
    }
    if (patchDraftRect && patchDraftRect.width >= 8 && patchDraftRect.height >= 8) {
      createPatch(patchDraftRect);
      invalidateCalculatedResults();
      setStatus(`Created ${workspaceLabel(getActiveWorkspace())}.`);
    } else {
      setStatus("Patch was too small. Drag a larger rectangle.");
    }
    patchDraftRect = null;
    patchDrawStart = null;
    draw();
    return;
  }

  if (!isDrawing || !drawingWorkspaceId) return;
  const workspace = getCurrentWorkspaces().find((candidate) => candidate.id === drawingWorkspaceId);
  isDrawing = false;
  drawingWorkspaceId = null;
  stage.releasePointerCapture(event.pointerId);
  if (!workspace) return;
  if (workspace.pendingStrokeSnapshot) {
    pushWorkspaceHistory(workspace, workspace.pendingStrokeSnapshot);
  }
  workspace.pendingStrokeSnapshot = null;
  workspace.currentStrokePoints = [];
  await refreshWorkspaceOverlay(workspace);
  draw();
  renderResults();
  setStatus(`${workspaceLabel(workspace)} mask edit applied locally. Run Calculate to update measurements.`);
});

stage.addEventListener("pointerleave", () => {
  if (mode === "point-remove") {
    setHoveredPointIndex(null, null);
  }
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

["dragenter", "dragover"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});

["dragleave", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});

stageWrap.addEventListener("dragenter", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  stageWrap.classList.add("dragOver");
});

stageWrap.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.dataTransfer.dropEffect = "copy";
  stageWrap.classList.add("dragOver");
});

stageWrap.addEventListener("dragleave", (event) => {
  if (!stageWrap.contains(event.relatedTarget)) {
    stageWrap.classList.remove("dragOver");
  }
});

stageWrap.addEventListener("drop", async (event) => {
  stageWrap.classList.remove("dragOver");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  fileInput.value = "";
  await handleImageFile(file);
});

updateOpacityLabels();
brushSizeValue.textContent = `${brushSize.value} px`;
exportResultsBtn.disabled = true;
renderPatchList();
renderPointList();
renderResults();
