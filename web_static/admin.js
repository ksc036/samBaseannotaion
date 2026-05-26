const sampleList = document.getElementById("sampleList");
const sampleCount = document.getElementById("sampleCount");
const refreshBtn = document.getElementById("refreshBtn");
const brushBtn = document.getElementById("brushBtn");
const eraserBtn = document.getElementById("eraserBtn");
const brushSize = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const overlayOpacity = document.getElementById("overlayOpacity");
const overlayOpacityValue = document.getElementById("overlayOpacityValue");
const maskPreviewBtn = document.getElementById("maskPreviewBtn");
const deleteBtn = document.getElementById("deleteBtn");
const approveBtn = document.getElementById("approveBtn");
const statusEl = document.getElementById("status");
const stageWrap = document.getElementById("stageWrap");
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");

let samples = [];
let selectedSampleId = null;
let mode = "brush";
let imageBitmap = null;
let naturalWidth = 0;
let naturalHeight = 0;
let maskCanvas = null;
let maskCtx = null;
let overlayBitmap = null;
let isMaskPreviewActive = false;
let isDrawing = false;
let lastPoint = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function setMode(nextMode) {
  mode = nextMode;
  brushBtn.classList.toggle("active", mode === "brush");
  eraserBtn.classList.toggle("active", mode === "eraser");
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

async function loadBitmap(url) {
  const blob = await fetch(url).then((response) => response.blob());
  return createImageBitmap(blob);
}

async function imageDataToBitmap(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");
  context.putImageData(imageData, 0, 0);
  return createImageBitmap(canvas);
}

async function rebuildOverlay() {
  if (!maskCtx) {
    overlayBitmap = null;
    return;
  }
  const source = maskCtx.getImageData(0, 0, naturalWidth, naturalHeight);
  const overlayData = new ImageData(naturalWidth, naturalHeight);
  for (let index = 0; index < source.data.length; index += 4) {
    if (source.data[index] <= 0) continue;
    overlayData.data[index] = 226;
    overlayData.data[index + 1] = 90;
    overlayData.data[index + 2] = 40;
    overlayData.data[index + 3] = 115;
  }
  overlayBitmap = await imageDataToBitmap(overlayData);
}

function draw() {
  ctx.clearRect(0, 0, stage.width, stage.height);
  if (!imageBitmap) return;
  if (isMaskPreviewActive && maskCtx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, stage.width, stage.height);
    const source = maskCtx.getImageData(0, 0, naturalWidth, naturalHeight).data;
    const maskOnly = new ImageData(naturalWidth, naturalHeight);
    for (let index = 0; index < source.length; index += 4) {
      if (source[index] <= 0) continue;
      maskOnly.data[index] = 255;
      maskOnly.data[index + 1] = 255;
      maskOnly.data[index + 2] = 255;
      maskOnly.data[index + 3] = 255;
    }
    imageDataToBitmap(maskOnly).then((bitmap) => {
      if (!isMaskPreviewActive) return;
      ctx.clearRect(0, 0, stage.width, stage.height);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, stage.width, stage.height);
      ctx.drawImage(bitmap, 0, 0, stage.width, stage.height);
    });
    return;
  }
  ctx.drawImage(imageBitmap, 0, 0, stage.width, stage.height);
  if (overlayBitmap) {
    ctx.save();
    ctx.globalAlpha = Number(overlayOpacity.value) / 100;
    ctx.drawImage(overlayBitmap, 0, 0, stage.width, stage.height);
    ctx.restore();
  }
}

function truncateLabel(text, maxLength = 15) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function renderList() {
  sampleCount.textContent = String(samples.length);
  sampleList.innerHTML = "";
  if (samples.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No pending samples.";
    sampleList.append(item);
    return;
  }

  samples.forEach((sample) => {
    const item = document.createElement("li");
    item.classList.toggle("active", sample.sample_id === selectedSampleId);
    item.dataset.sampleId = sample.sample_id;

    const title = document.createElement("span");
    title.className = "sampleName";
    title.textContent = truncateLabel(sample.folder_name, 15);

    const meta = document.createElement("span");
    meta.className = "sampleMeta";
    meta.textContent = `${sample.width} × ${sample.height}`;

    item.append(title, meta);
    sampleList.append(item);
  });
}

async function fetchSamples() {
  setStatus("Loading sample list...");
  const response = await fetch("/api/admin/samples");
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Failed to load admin samples.");
    return;
  }
  samples = data.samples;
  if (selectedSampleId && !samples.some((sample) => sample.sample_id === selectedSampleId)) {
    selectedSampleId = null;
    imageBitmap = null;
    maskCanvas = null;
    maskCtx = null;
    overlayBitmap = null;
    draw();
  }
  renderList();
  setStatus(samples.length > 0 ? "Select a sample to review." : "No pending samples found.");
}

async function loadSample(sampleId) {
  setStatus("Loading sample...");
  const response = await fetch(`/api/admin/sample?sample_id=${encodeURIComponent(sampleId)}`);
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Failed to load sample.");
    return;
  }

  selectedSampleId = sampleId;
  naturalWidth = data.width;
  naturalHeight = data.height;
  imageBitmap = await loadBitmap(data.image_data_url);
  maskCanvas = document.createElement("canvas");
  maskCanvas.width = naturalWidth;
  maskCanvas.height = naturalHeight;
  maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const maskBitmap = await loadBitmap(data.mask_data_url);
  maskCtx.clearRect(0, 0, naturalWidth, naturalHeight);
  maskCtx.drawImage(maskBitmap, 0, 0, naturalWidth, naturalHeight);
  await rebuildOverlay();
  fitCanvas();
  draw();
  renderList();
  setStatus(`Loaded ${data.folder_name}. Brush or erase the mask, then approve.`);
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
}

async function approveCurrentSample() {
  if (!selectedSampleId || !maskCanvas) {
    setStatus("Select a sample first.");
    return;
  }
  setStatus("Approving sample...");
  const response = await fetch("/api/admin/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sample_id: selectedSampleId,
      mask_data_url: maskCanvas.toDataURL("image/png"),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Approval failed.");
    return;
  }

  const approvedId = selectedSampleId;
  selectedSampleId = null;
  imageBitmap = null;
  maskCanvas = null;
  maskCtx = null;
  overlayBitmap = null;
  draw();
  await fetchSamples();
  setStatus(`Approved ${approvedId} and moved it to annotation_complete.`);
}

async function deleteCurrentSample() {
  if (!selectedSampleId) {
    setStatus("Select a sample first.");
    return;
  }
  setStatus("Deleting sample...");
  const response = await fetch("/api/admin/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sample_id: selectedSampleId,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Delete failed.");
    return;
  }

  const deletedId = selectedSampleId;
  selectedSampleId = null;
  imageBitmap = null;
  maskCanvas = null;
  maskCtx = null;
  overlayBitmap = null;
  draw();
  await fetchSamples();
  setStatus(`Deleted ${deletedId} and moved it to deleted_annotations.`);
}

brushBtn.addEventListener("click", () => setMode("brush"));
eraserBtn.addEventListener("click", () => setMode("eraser"));
refreshBtn.addEventListener("click", fetchSamples);
deleteBtn.addEventListener("click", deleteCurrentSample);
approveBtn.addEventListener("click", approveCurrentSample);

brushSize.addEventListener("input", () => {
  brushSizeValue.textContent = `${brushSize.value} px`;
});

overlayOpacity.addEventListener("input", () => {
  overlayOpacityValue.textContent = `${overlayOpacity.value}%`;
  draw();
});
maskPreviewBtn.addEventListener("mouseenter", () => {
  if (!maskCanvas) return;
  isMaskPreviewActive = true;
  draw();
});
maskPreviewBtn.addEventListener("mouseleave", () => {
  if (!isMaskPreviewActive) return;
  isMaskPreviewActive = false;
  draw();
});
maskPreviewBtn.addEventListener("blur", () => {
  if (!isMaskPreviewActive) return;
  isMaskPreviewActive = false;
  draw();
});

sampleList.addEventListener("click", (event) => {
  const item = event.target.closest("li[data-sample-id]");
  if (!item) return;
  loadSample(item.dataset.sampleId);
});

stage.addEventListener("pointerdown", (event) => {
  if (!maskCanvas) return;
  isDrawing = true;
  lastPoint = clientToImageCoords(event);
  drawMaskStroke(lastPoint, lastPoint);
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!isDrawing || !maskCanvas) return;
  const point = clientToImageCoords(event);
  drawMaskStroke(lastPoint || point, point);
  lastPoint = point;
  rebuildOverlay().then(draw);
});

stage.addEventListener("pointerup", async (event) => {
  if (!isDrawing) return;
  isDrawing = false;
  lastPoint = null;
  stage.releasePointerCapture(event.pointerId);
  await rebuildOverlay();
  draw();
  setStatus("Mask updated locally. Approve when review is complete.");
});

stage.addEventListener("pointerleave", () => {
  if (!isDrawing) return;
  lastPoint = null;
});

window.addEventListener("resize", () => {
  fitCanvas();
  draw();
});

brushSizeValue.textContent = `${brushSize.value} px`;
overlayOpacityValue.textContent = `${overlayOpacity.value}%`;
fetchSamples();
