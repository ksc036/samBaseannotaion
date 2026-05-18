from __future__ import annotations

import json
import mimetypes
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import imageio.v3 as iio
import numpy as np
from scipy import ndimage as ndi


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "web_static"
UPLOAD_DIR = ROOT / "web_uploads"
OUTPUT_DIR = ROOT / "web_outputs"
DEFAULT_MODEL = "vit_b_lm"
DEFAULT_DEVICE = "cpu"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

STATE = {
    "predictor": None,
    "active_image_id": None,
    "images": {},
}


def mask_to_uint8(mask: np.ndarray) -> np.ndarray:
    return ((mask > 0) * 255).astype(np.uint8)


def mask_overlay_rgba(mask: np.ndarray, color: tuple[int, int, int] = (226, 90, 40), alpha: int = 115) -> np.ndarray:
    binary = mask > 0
    overlay = np.zeros((*binary.shape, 4), dtype=np.uint8)
    overlay[..., 0] = color[0]
    overlay[..., 1] = color[1]
    overlay[..., 2] = color[2]
    overlay[..., 3] = binary.astype(np.uint8) * int(alpha)
    return overlay


def outline_mask(mask: np.ndarray, thickness: int = 1) -> np.ndarray:
    binary = mask > 0
    size = 1 + (2 * max(1, int(thickness)))
    eroded = ndi.binary_erosion(binary, structure=np.ones((size, size), dtype=bool), border_value=0)
    return ((binary & ~eroded) * 255).astype(np.uint8)


def normalize_points(points: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    coords = []
    labels = []
    for point in points:
        coords.append([float(point["x"]), float(point["y"])])
        labels.append(1 if point.get("type") == "positive" else 0)
    return np.asarray(coords, dtype=np.float32), np.asarray(labels, dtype=np.int32)


def ensure_rgb(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return np.repeat(image[..., None], 3, axis=-1)
    if image.ndim == 3 and image.shape[-1] == 4:
        return image[..., :3]
    if image.ndim == 3 and image.shape[-1] == 3:
        return image
    raise ValueError(f"Only 2D grayscale or RGB/RGBA images are supported. Got shape {image.shape}.")


def read_image(path: Path) -> np.ndarray:
    image = iio.imread(path)
    return ensure_rgb(image)


def save_view_image(image: np.ndarray, image_id: str) -> Path:
    out = OUTPUT_DIR / f"{image_id}_image.png"
    if image.ndim == 2:
        data = image.astype(np.float32)
        data = data - data.min()
        if data.max() > 0:
            data = data / data.max()
        data = (data * 255).astype(np.uint8)
    else:
        data = image
    iio.imwrite(out, data)
    return out


def get_predictor():
    if STATE["predictor"] is None:
        try:
            from micro_sam.util import get_sam_model
        except ImportError as exc:
            raise RuntimeError(
                "micro_sam is not installed in the active environment. "
                "Create the conda environment from environment.yml and launch the app from it."
            ) from exc

        STATE["predictor"] = get_sam_model(model_type=DEFAULT_MODEL, device=DEFAULT_DEVICE)
    return STATE["predictor"]


def set_active_image(image_id: str):
    if STATE["active_image_id"] == image_id:
        return
    predictor = get_predictor()
    predictor.set_image(STATE["images"][image_id]["array"])
    STATE["active_image_id"] = image_id


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class SamWebHandler(BaseHTTPRequestHandler):
    server_version = "MicroSamWeb/0.1"

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            self.serve_file(STATIC_DIR / "index.html", "text/html")
        elif path.startswith("/static/"):
            self.serve_file(STATIC_DIR / path.removeprefix("/static/"))
        elif path.startswith("/outputs/"):
            self.serve_file(OUTPUT_DIR / path.removeprefix("/outputs/"))
        else:
            json_response(self, 404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/images":
                self.handle_upload()
            elif parsed.path == "/api/segment":
                self.handle_segment()
            else:
                json_response(self, 404, {"error": "Not found"})
        except Exception as exc:
            json_response(self, 500, {"error": str(exc)})

    def serve_file(self, path: Path, content_type: str | None = None):
        if not path.exists() or not path.is_file():
            json_response(self, 404, {"error": "File not found"})
            return
        body = path.read_bytes()
        guessed = content_type or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", guessed)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def handle_upload(self):
        length = int(self.headers.get("Content-Length", "0"))
        filename = self.headers.get("X-Filename", "image.tif")
        suffix = Path(filename).suffix or ".tif"
        image_id = uuid.uuid4().hex
        raw_path = UPLOAD_DIR / f"{image_id}{suffix}"
        raw_path.write_bytes(self.rfile.read(length))

        image = read_image(raw_path)
        view_path = save_view_image(image, image_id)
        STATE["images"][image_id] = {"path": raw_path, "array": image, "view": view_path}
        set_active_image(image_id)

        height, width = image.shape[:2]
        json_response(
            self,
            200,
            {
                "image_id": image_id,
                "width": int(width),
                "height": int(height),
                "image_url": f"/outputs/{view_path.name}",
            },
        )

    def handle_segment(self):
        payload = self.read_json()
        image_id = payload["image_id"]
        points = payload.get("points", [])
        if not points:
            raise ValueError("At least one point prompt is required.")
        if not any(point.get("type") == "positive" for point in points):
            raise ValueError("At least one positive point is required.")
        if image_id not in STATE["images"]:
            raise ValueError("Unknown image_id.")

        set_active_image(image_id)
        coords, labels = normalize_points(points)
        predictor = get_predictor()
        masks, scores, _ = predictor.predict(point_coords=coords, point_labels=labels, multimask_output=True)
        mask = masks[int(np.argmax(scores))]
        mask_255 = mask_to_uint8(mask)
        edge_255 = outline_mask(mask_255)
        overlay = mask_overlay_rgba(mask_255)

        mask_path = OUTPUT_DIR / f"{image_id}_mask_255.png"
        edge_path = OUTPUT_DIR / f"{image_id}_edge_1px.png"
        overlay_path = OUTPUT_DIR / f"{image_id}_overlay.png"
        iio.imwrite(mask_path, mask_255)
        iio.imwrite(edge_path, edge_255)
        iio.imwrite(overlay_path, overlay)

        json_response(
            self,
            200,
            {
                "mask_url": f"/outputs/{mask_path.name}",
                "edge_url": f"/outputs/{edge_path.name}",
                "overlay_url": f"/outputs/{overlay_path.name}",
                "score": float(np.max(scores)),
            },
        )


def main():
    host = "0.0.0.0"
    port = 8765
    print(f"micro-sam web UI: http://{host}:{port}")
    print("Model loads on first image upload. On CPU this can take a while.")
    ThreadingHTTPServer((host, port), SamWebHandler).serve_forever()


if __name__ == "__main__":
    main()
