const fileInput = document.getElementById("fileInput");
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");
const statusEl = document.getElementById("status");
const pointList = document.getElementById("pointList");
const positiveBtn = document.getElementById("positiveBtn");
const negativeBtn = document.getElementById("negativeBtn");
const segmentBtn = document.getElementById("segmentBtn");
const clearBtn = document.getElementById("clearBtn");
const maskDownload = document.getElementById("maskDownload");
const edgeDownload = document.getElementById("edgeDownload");

let mode = "positive";
let imageId = null;
let imageBitmap = null;
let maskBitmap = null;
let naturalWidth = 0;
let naturalHeight = 0;
let points = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function setMode(nextMode) {
  mode = nextMode;
  positiveBtn.classList.toggle("active", mode === "positive");
  negativeBtn.classList.toggle("active", mode === "negative");
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
  if (maskBitmap) {
    ctx.drawImage(maskBitmap, 0, 0, stage.width, stage.height);
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

async function loadBitmap(url) {
  const blob = await fetch(url, { cache: "no-store" }).then((response) => response.blob());
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
  maskBitmap = null;
  imageBitmap = await loadBitmap(data.image_url);
  fitCanvas();
  draw();
  setStatus("Image ready. Add positive and negative points, then Segment Object.");
});

stage.addEventListener("click", (event) => {
  if (!imageBitmap) return;
  const rect = stage.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * naturalWidth;
  const y = ((event.clientY - rect.top) / rect.height) * naturalHeight;
  points.push({ x, y, type: mode });
  draw();
});

positiveBtn.addEventListener("click", () => setMode("positive"));
negativeBtn.addEventListener("click", () => setMode("negative"));

clearBtn.addEventListener("click", () => {
  points = [];
  maskBitmap = null;
  maskDownload.classList.add("disabled");
  edgeDownload.classList.add("disabled");
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
  maskBitmap = await loadBitmap(data.overlay_url);
  maskDownload.href = data.mask_url;
  edgeDownload.href = data.edge_url;
  maskDownload.classList.remove("disabled");
  edgeDownload.classList.remove("disabled");
  draw();
  setStatus(`Mask generated. Score ${data.score.toFixed(3)}.`);
});

window.addEventListener("resize", () => {
  fitCanvas();
  draw();
});
