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
const brushSize = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const maskDownload = document.getElementById("maskDownload");
const edgeDownload = document.getElementById("edgeDownload");
const metricSelect = document.getElementById("metricSelect");
const resultsBody = document.getElementById("resultsBody");
const resultsPanel = document.getElementById("resultsPanel");

let mode = "positive";
let imageId = null;
let imageBitmap = null;
let naturalWidth = 0;
let naturalHeight = 0;
let points = [];
let measurements = [];
let maskCanvas = null;
let maskCtx = null;
let overlayBitmap = null;
let isDrawing = false;
let maskDirty = false;
let lastDrawPoint = null;
let isSyncingMask = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function setMode(nextMode) {
  mode = nextMode;
  positiveBtn.classList.toggle("active", mode === "positive");
  negativeBtn.classList.toggle("active", mode === "negative");
  brushBtn.classList.toggle("active", mode === "brush");
  eraserBtn.classList.toggle("active", mode === "eraser");
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
  if (maskCanvas && maskDirty) {
    drawMaskPreview();
  } else if (overlayBitmap) {
    ctx.drawImage(overlayBitmap, 0, 0, stage.width, stage.height);
  }
  for (const point of points) {
    const x = (point.x / naturalWidth) * stage.width;
    const y = (point.y / naturalHeight) * stage.height;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = point.type === "positive" ? "#16d174" : "#ff3e3e";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }
  renderPointList();
}

function renderPointList() {
  pointList.innerHTML = "";
  points.forEach((point, index) => {
    const item = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = point.type === "positive" ? "#16d174" : "#ff3e3e";
    item.append(dot, `${index + 1}. ${point.type} (${Math.round(point.x)}, ${Math.round(point.y)})`);
    pointList.append(item);
  });
}

function renderResults(rows = []) {
  resultsBody.innerHTML = "";
  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "emptyCell";
    cell.textContent = "No calculation yet.";
    row.append(cell);
    resultsBody.append(row);
    return;
  }

  const selectedMetric = metricSelect.value;
  rows.forEach((segment, index) => {
    const row = document.createElement("tr");
    const colorCell = document.createElement("td");
    const colorSwatch = document.createElement("span");
    colorSwatch.className = "colorSwatch";
    colorSwatch.style.background = segment.color;
    colorCell.append(colorSwatch);

    const segmentCell = document.createElement("td");
    segmentCell.textContent = `#${index + 1}`;

    const selectedCell = document.createElement("td");
    selectedCell.textContent = formatNumber(segment[selectedMetric]);

    const areaCell = document.createElement("td");
    areaCell.textContent = `${segment.area_pixels}`;

    const feretMaxCell = document.createElement("td");
    feretMaxCell.textContent = formatNumber(segment.feret_max_pixels);

    const feretMinCell = document.createElement("td");
    feretMinCell.textContent = formatNumber(segment.feret_min_pixels);

    const eqCell = document.createElement("td");
    eqCell.textContent = formatNumber(segment.equivalent_diameter_pixels);

    row.append(colorCell, segmentCell, selectedCell, areaCell, feretMaxCell, feretMinCell, eqCell);
    resultsBody.append(row);
  });
}

function renderLoadingResults() {
  resultsBody.innerHTML = "";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 7;
  cell.className = "emptyCell";
  cell.textContent = "Calculating...";
  row.append(cell);
  resultsBody.append(row);
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function triggerDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function triggerCanvasDownload(canvas, filename) {
  triggerDownload(canvas.toDataURL("image/png"), filename);
}

function drawMaskPreview() {
  const preview = document.createElement("canvas");
  preview.width = naturalWidth;
  preview.height = naturalHeight;
  const previewCtx = preview.getContext("2d");
  const source = maskCtx.getImageData(0, 0, naturalWidth, naturalHeight);
  const tinted = previewCtx.createImageData(naturalWidth, naturalHeight);

  for (let index = 0; index < source.data.length; index += 4) {
    const value = source.data[index];
    if (value > 0) {
      tinted.data[index] = 226;
      tinted.data[index + 1] = 90;
      tinted.data[index + 2] = 40;
      tinted.data[index + 3] = 115;
    }
  }

  previewCtx.putImageData(tinted, 0, 0);
  ctx.drawImage(preview, 0, 0, stage.width, stage.height);
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

async function setMaskFromUrl(maskUrl, nextOverlayUrl) {
  ensureMaskCanvas();
  const bitmap = await loadBitmap(maskUrl);
  maskCtx.clearRect(0, 0, naturalWidth, naturalHeight);
  maskCtx.drawImage(bitmap, 0, 0, naturalWidth, naturalHeight);
  overlayBitmap = await loadBitmap(nextOverlayUrl);
  maskDirty = false;
  maskDownload.classList.remove("disabled");
  edgeDownload.classList.remove("disabled");
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

async function syncMaskToServer() {
  if (!imageId || !maskCanvas || !maskDirty || isSyncingMask) return;
  isSyncingMask = true;
  try {
    const response = await fetch("/api/mask/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_id: imageId,
        mask_data_url: maskCanvas.toDataURL("image/png"),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Mask update failed.");
    }
    overlayBitmap = await loadBitmap(data.overlay_url);
    maskDirty = false;
  } finally {
    isSyncingMask = false;
  }
}

async function ensureLatestMaskOutputs() {
  if (!maskDirty) return true;
  setStatus("Saving edited mask...");
  try {
    await syncMaskToServer();
    draw();
    setStatus("Edited mask saved.");
    return true;
  } catch (error) {
    setStatus(error.message);
    return false;
  }
}

async function loadBitmap(url) {
  const blob = await fetch(url, { cache: "no-store" }).then((response) => response.blob());
  return createImageBitmap(blob);
}

function buildEdgeCanvas() {
  if (!maskCanvas || !maskCtx) return null;
  const source = maskCtx.getImageData(0, 0, naturalWidth, naturalHeight);
  const edgeCanvas = document.createElement("canvas");
  edgeCanvas.width = naturalWidth;
  edgeCanvas.height = naturalHeight;
  const edgeCtx = edgeCanvas.getContext("2d");
  const edgeData = edgeCtx.createImageData(naturalWidth, naturalHeight);

  const isForeground = (x, y) => {
    if (x < 0 || y < 0 || x >= naturalWidth || y >= naturalHeight) return false;
    const index = (y * naturalWidth + x) * 4;
    return source.data[index] > 0;
  };

  for (let y = 0; y < naturalHeight; y += 1) {
    for (let x = 0; x < naturalWidth; x += 1) {
      if (!isForeground(x, y)) continue;
      const edge =
        !isForeground(x - 1, y) ||
        !isForeground(x + 1, y) ||
        !isForeground(x, y - 1) ||
        !isForeground(x, y + 1) ||
        !isForeground(x - 1, y - 1) ||
        !isForeground(x + 1, y - 1) ||
        !isForeground(x - 1, y + 1) ||
        !isForeground(x + 1, y + 1);
      if (!edge) continue;
      const index = (y * naturalWidth + x) * 4;
      edgeData.data[index] = 255;
      edgeData.data[index + 1] = 255;
      edgeData.data[index + 2] = 255;
      edgeData.data[index + 3] = 255;
    }
  }

  edgeCtx.putImageData(edgeData, 0, 0);
  return edgeCanvas;
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
  imageBitmap = await loadBitmap(data.image_url);
  fitCanvas();
  draw();
  renderResults();
  setStatus("Image ready. Add positive and negative points, then Segment Object.");
});

positiveBtn.addEventListener("click", () => setMode("positive"));
negativeBtn.addEventListener("click", () => setMode("negative"));
brushBtn.addEventListener("click", () => setMode("brush"));
eraserBtn.addEventListener("click", () => setMode("eraser"));
brushSize.addEventListener("input", () => {
  brushSizeValue.textContent = `${brushSize.value} px`;
});

clearBtn.addEventListener("click", () => {
  points = [];
  draw();
  setStatus("Points cleared.");
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
  await setMaskFromUrl(data.mask_url, data.overlay_url);
  maskDownload.href = data.mask_url;
  edgeDownload.href = data.edge_url;
  maskDownload.classList.remove("disabled");
  edgeDownload.classList.remove("disabled");
  measurements = [];
  renderResults();
  draw();
  setStatus(`Mask generated. Score ${data.score.toFixed(3)}.`);
});

calculateBtn.addEventListener("click", async () => {
  if (!imageId || !maskCanvas) {
    setStatus("Segment at least one object before calculating.");
    return;
  }
  measurements = [];
  renderLoadingResults();
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("Calculating pixel measurements...");
  const ready = await ensureLatestMaskOutputs();
  if (!ready) {
    renderResults();
    return;
  }
  const response = await fetch("/api/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_id: imageId }),
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Calculation failed.");
    renderResults();
    return;
  }

  measurements = data.segments;
  renderResults(measurements);
  draw();
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus(`Calculated ${measurements.length} segment measurements in pixels.`);
});

metricSelect.addEventListener("change", () => renderResults(measurements));

stage.addEventListener("pointerdown", (event) => {
  if (!imageBitmap) return;
  const point = clientToImageCoords(event);
  if (isEditMode()) {
    if (!maskCanvas) {
      setStatus("Run Segment Object first, then edit the mask.");
      return;
    }
    isDrawing = true;
    lastDrawPoint = point;
    drawMaskStroke(point, point);
    draw();
    stage.setPointerCapture(event.pointerId);
    return;
  }
  points.push({ x: point.x, y: point.y, type: mode });
  draw();
});

stage.addEventListener("pointermove", (event) => {
  if (!isDrawing || !isEditMode()) return;
  const point = clientToImageCoords(event);
  const previous = lastDrawPoint || point;
  drawMaskStroke(previous, point);
  lastDrawPoint = point;
  draw();
});

stage.addEventListener("pointerup", async (event) => {
  if (!isDrawing) return;
  isDrawing = false;
  lastDrawPoint = null;
  stage.releasePointerCapture(event.pointerId);
  setStatus("Updating edited mask...");
  try {
    await syncMaskToServer();
    draw();
    setStatus("Mask edit applied.");
  } catch (error) {
    setStatus(error.message);
  }
});

stage.addEventListener("pointerleave", () => {
  if (!isDrawing) return;
  lastDrawPoint = null;
});

maskDownload.addEventListener("click", (event) => {
  event.preventDefault();
  if (!maskCanvas) return;
  triggerCanvasDownload(maskCanvas, maskDownload.download || "mask_255.png");
});

edgeDownload.addEventListener("click", (event) => {
  event.preventDefault();
  const edgeCanvas = buildEdgeCanvas();
  if (!edgeCanvas) return;
  triggerCanvasDownload(edgeCanvas, edgeDownload.download || "edge_1px.png");
});

window.addEventListener("resize", () => {
  fitCanvas();
  draw();
});
