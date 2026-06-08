from __future__ import annotations

import base64
import json
import mimetypes
import os
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import shutil
from pathlib import Path
import re
from urllib.parse import parse_qs, urlparse

import imageio.v3 as iio
import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "web_static"
UPLOAD_DIR = ROOT / "web_uploads"
APPROVED_DIR = ROOT / "annotation_complete"
DELETED_DIR = ROOT / "deleted_annotations"
OUTPUT_DIR = ROOT / "web_outputs"
DEFAULT_MODEL = "vit_b_lm"
DEFAULT_DEVICE = "cpu"
SEGMENT_COLORS = [
    (241, 91, 64),
    (47, 124, 246),
    (24, 168, 116),
    (243, 166, 35),
    (139, 92, 246),
    (223, 76, 153),
    (18, 181, 203),
    (139, 111, 71),
]

UPLOAD_DIR.mkdir(exist_ok=True)
APPROVED_DIR.mkdir(exist_ok=True)
DELETED_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

STATE = {
    "predictor": None,
    "active_image_id": None,
    "images": {},
}


def sanitize_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    cleaned = cleaned.strip("._-")
    return cleaned or "image"


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


def colorize_components_overlay(components: list[np.ndarray], colors: list[tuple[int, int, int]], alpha: int = 115) -> np.ndarray:
    if not components:
        return np.zeros((1, 1, 4), dtype=np.uint8)
    shape = components[0].shape
    overlay = np.zeros((*shape, 4), dtype=np.uint8)
    for component, color in zip(components, colors):
        binary = component > 0
        overlay[..., 0][binary] = color[0]
        overlay[..., 1][binary] = color[1]
        overlay[..., 2][binary] = color[2]
        overlay[..., 3][binary] = alpha
    return overlay


def outline_mask(mask: np.ndarray, thickness: int = 1) -> np.ndarray:
    binary = mask > 0
    size = 1 + (2 * max(1, int(thickness)))
    eroded = ndi.binary_erosion(binary, structure=np.ones((size, size), dtype=bool), border_value=0)
    return ((binary & ~eroded) * 255).astype(np.uint8)


def boundary_points(mask: np.ndarray) -> np.ndarray:
    binary = mask > 0
    if not np.any(binary):
        return np.empty((0, 2), dtype=np.float32)
    boundary = (outline_mask(mask_to_uint8(binary)) > 0)
    coords = np.argwhere(boundary)
    if coords.size == 0:
        coords = np.argwhere(binary)
    return coords[:, ::-1].astype(np.float32)


def contour_points_cv2(mask: np.ndarray) -> np.ndarray:
    binary = (mask > 0).astype(np.uint8)
    if not np.any(binary):
        return np.empty((0, 2), dtype=np.float32)

    contours, _ = cv2.findContours(
        binary,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_NONE,
    )

    if not contours:
        return np.empty((0, 2), dtype=np.float32)

    largest = max(contours, key=cv2.contourArea)
    return largest[:, 0, :].astype(np.float32)


def convex_hull_points(points: np.ndarray) -> np.ndarray:
    if len(points) <= 2:
        return points.astype(np.float32)
    try:
        hull = ConvexHull(points)
    except Exception:
        return points.astype(np.float32)
    return points[hull.vertices].astype(np.float32)


def feret_diameters(points: np.ndarray) -> tuple[float, float]:
    if len(points) == 0:
        return 0.0, 0.0
    if len(points) == 1:
        return 0.0, 0.0

    diffs = points[:, None, :] - points[None, :, :]
    feret_max = float(np.sqrt(np.max(np.sum(diffs * diffs, axis=-1))))

    # hull = convex_hull_points(points)  # 이전 convex hull 방식: 실제 오목한 경계를 고무줄처럼 감싸버림
    hull = points.astype(np.float32)  # 현재 방식: 실제 object contour point 그대로 사용
    if len(hull) <= 1:
        return feret_max, 0.0
    if len(hull) == 2:
        return feret_max, feret_max

    min_width = np.inf
    for idx in range(len(hull)):
        p1 = hull[idx]
        p2 = hull[(idx + 1) % len(hull)]
        edge = p2 - p1
        edge_length = float(np.linalg.norm(edge))
        if edge_length == 0:
            continue
        unit = edge / edge_length
        normal = np.array([-unit[1], unit[0]], dtype=np.float32)
        projections = hull @ normal
        width = float(projections.max() - projections.min())
        min_width = min(min_width, width)

    if not np.isfinite(min_width):
        min_width = 0.0
    return feret_max, float(min_width)


def calculate_mask_metrics(mask: np.ndarray) -> dict:
    binary = mask > 0
    area = int(np.count_nonzero(binary))
    if area == 0:
        return {
            "area_pixels": 0,
            "equivalent_diameter_pixels": 0.0,
            "feret_max_pixels": 0.0,
            "feret_min_pixels": 0.0,
            "bbox_width_pixels": 0.0,
            "bbox_height_pixels": 0.0,
            "perimeter_pixels": 0.0,
        }

    coords = np.argwhere(binary)
    y_min, x_min = coords.min(axis=0)
    y_max, x_max = coords.max(axis=0)
    bbox_width = float(x_max - x_min + 1)
    bbox_height = float(y_max - y_min + 1)
    perimeter = float(np.count_nonzero(outline_mask(mask_to_uint8(binary))))
    # feret_max, feret_min = feret_diameters(boundary_points(binary))  # 이전 outline 기반 방식
    feret_max, feret_min = feret_diameters(contour_points_cv2(binary))
    equivalent_diameter = float(np.sqrt((4.0 * area) / np.pi))

    return {
        "area_pixels": area,
        "equivalent_diameter_pixels": equivalent_diameter,
        "feret_max_pixels": feret_max,
        "feret_min_pixels": feret_min,
        "bbox_width_pixels": bbox_width,
        "bbox_height_pixels": bbox_height,
        "perimeter_pixels": perimeter,
    }


def split_connected_components(mask: np.ndarray) -> list[np.ndarray]:
    labeled, count = ndi.label(mask > 0)
    components = []
    for label_id in range(1, count + 1):
        component = labeled == label_id
        if np.any(component):
            components.append(component)
    components.sort(key=lambda component: int(np.count_nonzero(component)), reverse=True)
    return components


def combine_instance_masks(mask_dir: Path, shape: tuple[int, int]) -> np.ndarray:
    combined = np.zeros(shape, dtype=bool)
    if not mask_dir.exists():
        return combined
    for mask_path in sorted(mask_dir.iterdir()):
        if not mask_path.is_file():
            continue
        mask_data = iio.imread(mask_path)
        if getattr(mask_data, "ndim", 2) == 3:
            mask_data = mask_data[..., 0]
        if mask_data.shape[:2] == shape:
            combined |= mask_data > 0
    return combined


def save_instance_masks(mask: np.ndarray, mask_dir: Path, prefix: str) -> None:
    mask_dir.mkdir(parents=True, exist_ok=True)
    for existing_mask in mask_dir.glob("*.png"):
        existing_mask.unlink()
    for index, component in enumerate(split_connected_components(mask), start=1):
        mask_path = mask_dir / f"{prefix}_{index:04d}.png"
        iio.imwrite(mask_path, mask_to_uint8(component))


def save_mask_outputs(mask: np.ndarray, combined_mask_path: Path, instance_mask_dir: Path, prefix: str) -> None:
    combined_mask_path.parent.mkdir(parents=True, exist_ok=True)
    iio.imwrite(combined_mask_path, mask_to_uint8(mask))
    save_instance_masks(mask, instance_mask_dir, prefix)


def decode_mask_data_url(mask_data_url: str) -> np.ndarray:
    if "," not in mask_data_url:
        raise ValueError("Invalid mask payload.")
    _, encoded = mask_data_url.split(",", 1)
    raw = base64.b64decode(encoded)
    image = iio.imread(BytesIO(raw))
    if image.ndim == 3:
        image = image[..., 0]
    return image > 0


def image_to_png_data_url(image: np.ndarray) -> str:
    buffer = BytesIO()
    if image.ndim == 2:
        data = image.astype(np.float32)
        data = data - data.min()
        if data.max() > 0:
            data = data / data.max()
        data = (data * 255).astype(np.uint8)
    else:
        data = image
    iio.imwrite(buffer, data, extension=".png")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def build_mask_outputs(mask: np.ndarray) -> dict:
    mask_255 = mask_to_uint8(mask)
    return {
        "mask_data_url": image_to_png_data_url(mask_255),
    }


def list_sample_dirs(base_dir: Path) -> list[Path]:
    if not base_dir.exists():
        return []
    sample_dirs = []
    for path in sorted(base_dir.iterdir(), reverse=True):
        if not path.is_dir():
            continue
        has_legacy_layout = (path / "Image").is_dir() and (path / "mask").is_dir()
        has_dsb_layout = (path / "images").is_dir() and (path / "masks").is_dir()
        if has_legacy_layout or has_dsb_layout:
            sample_dirs.append(path)
    return sample_dirs


def first_file_in_dir(path: Path) -> Path | None:
    if not path.exists():
        return None
    files = [entry for entry in sorted(path.iterdir()) if entry.is_file()]
    return files[0] if files else None


def sample_record(sample_dir: Path) -> dict:
    image_path = first_file_in_dir(sample_dir / "Image") or first_file_in_dir(sample_dir / "images")
    mask_path = first_file_in_dir(sample_dir / "mask")
    if image_path is None:
        raise ValueError(f"Sample at {sample_dir} does not contain an image.")
    return {
        "sample_id": sample_dir.name,
        "folder_name": sample_dir.name,
        "sample_dir": sample_dir,
        "image_path": image_path,
        "mask_path": mask_path or (sample_dir / "mask" / f"{sample_dir.name}.png"),
        "instance_mask_dir": sample_dir / "masks",
    }


def load_sample_payload(sample_dir: Path) -> dict:
    record = sample_record(sample_dir)
    image = read_image(record["image_path"])
    height, width = image.shape[:2]
    mask_path = record["mask_path"]
    if mask_path.exists():
        mask_data = iio.imread(mask_path)
        if getattr(mask_data, "ndim", 2) == 3:
            mask_data = mask_data[..., 0]
        mask = mask_data > 0
    else:
        mask = combine_instance_masks(record["instance_mask_dir"], (height, width))
    return {
        "sample_id": record["sample_id"],
        "folder_name": record["folder_name"],
        "width": int(width),
        "height": int(height),
        "image_data_url": image_to_png_data_url(image),
        "mask_data_url": image_to_png_data_url(mask_to_uint8(mask)),
    }


def normalize_points(points: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    coords = []
    labels = []
    for point in points:
        coords.append([float(point["x"]), float(point["y"])])
        labels.append(1 if point.get("type") == "positive" else 0)
    return np.asarray(coords, dtype=np.float32), np.asarray(labels, dtype=np.int32)


def normalize_patch_rect(patch: dict | None, image_shape: tuple[int, ...]) -> dict | None:
    if not patch:
        return None
    height, width = image_shape[:2]
    x = int(round(float(patch.get("x", 0))))
    y = int(round(float(patch.get("y", 0))))
    patch_width = int(round(float(patch.get("width", 0))))
    patch_height = int(round(float(patch.get("height", 0))))
    if patch_width <= 0 or patch_height <= 0:
        raise ValueError("Patch width and height must be greater than zero.")
    x = max(0, min(width - 1, x))
    y = max(0, min(height - 1, y))
    x_end = min(width, x + patch_width)
    y_end = min(height, y + patch_height)
    if x_end <= x or y_end <= y:
        raise ValueError("Patch does not overlap the image.")
    return {
        "x": int(x),
        "y": int(y),
        "width": int(x_end - x),
        "height": int(y_end - y),
    }


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


def set_active_image_data(active_key, image_array: np.ndarray):
    if STATE["active_image_id"] == active_key:
        return
    predictor = get_predictor()
    predictor.set_image(image_array)
    STATE["active_image_id"] = active_key


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
        elif path == "/admin":
            self.serve_file(STATIC_DIR / "admin.html", "text/html")
        elif path.startswith("/static/"):
            self.serve_file(STATIC_DIR / path.removeprefix("/static/"))
        elif path.startswith("/outputs/"):
            self.serve_file(OUTPUT_DIR / path.removeprefix("/outputs/"))
        elif path == "/api/admin/samples":
            self.handle_admin_samples()
        elif path == "/api/admin/sample":
            self.handle_admin_sample(parsed.query)
        else:
            json_response(self, 404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/images":
                self.handle_upload()
            elif parsed.path == "/api/segment":
                self.handle_segment()
            elif parsed.path == "/api/calculate":
                self.handle_calculate()
            elif parsed.path == "/api/admin/approve":
                self.handle_admin_approve()
            elif parsed.path == "/api/admin/delete":
                self.handle_admin_delete()
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
        original_name = Path(filename)
        suffix = original_name.suffix or ".tif"
        stem = sanitize_name(original_name.stem)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        folder_name = f"{timestamp}_{stem}"
        image_id = uuid.uuid4().hex
        sample_dir = UPLOAD_DIR / folder_name
        image_dir = sample_dir / "Image"
        mask_dir = sample_dir / "mask"
        dsb_image_dir = sample_dir / "images"
        instance_mask_dir = sample_dir / "masks"
        image_dir.mkdir(parents=True, exist_ok=True)
        mask_dir.mkdir(parents=True, exist_ok=True)
        dsb_image_dir.mkdir(parents=True, exist_ok=True)
        instance_mask_dir.mkdir(parents=True, exist_ok=True)
        image_save_path = image_dir / f"{folder_name}{suffix}"
        dsb_image_save_path = dsb_image_dir / f"{folder_name}{suffix}"
        mask_save_path = mask_dir / f"{folder_name}.png"
        image_bytes = self.rfile.read(length)
        image_save_path.write_bytes(image_bytes)
        dsb_image_save_path.write_bytes(image_bytes)

        image = read_image(image_save_path)
        view_data_url = image_to_png_data_url(image)
        STATE["images"][image_id] = {
            "path": image_save_path,
            "array": image,
            "view": view_data_url,
            "segments": [],
            "last_mask": None,
            "sample_dir": sample_dir,
            "image_save_path": image_save_path,
            "mask_save_path": mask_save_path,
            "instance_mask_dir": instance_mask_dir,
            "folder_name": folder_name,
        }

        height, width = image.shape[:2]
        json_response(
            self,
            200,
            {
                "image_id": image_id,
                "width": int(width),
                "height": int(height),
                "image_data_url": view_data_url,
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

        image_state = STATE["images"][image_id]
        image_array = image_state["array"]
        patch = normalize_patch_rect(payload.get("patch"), image_array.shape)
        if patch:
            patch_image = image_array[patch["y"] : patch["y"] + patch["height"], patch["x"] : patch["x"] + patch["width"]]
            active_key = (image_id, patch["x"], patch["y"], patch["width"], patch["height"])
            set_active_image_data(active_key, patch_image)
        else:
            set_active_image_data(image_id, image_array)
        coords, labels = normalize_points(points)
        predictor = get_predictor()
        masks, scores, _ = predictor.predict(point_coords=coords, point_labels=labels, multimask_output=True)
        mask = masks[int(np.argmax(scores))]
        image_state["segments"] = []
        image_state["last_mask"] = mask.astype(bool)
        outputs = build_mask_outputs(image_state["last_mask"])

        json_response(
            self,
            200,
            {
                **outputs,
                "score": float(np.max(scores)),
                "patch": patch,
            },
        )

    def handle_calculate(self):
        payload = self.read_json()
        image_id = payload["image_id"]
        if image_id not in STATE["images"]:
            raise ValueError("Unknown image_id.")

        image_state = STATE["images"][image_id]
        mask_data_url = payload.get("mask_data_url")
        if mask_data_url:
            last_mask = decode_mask_data_url(mask_data_url).astype(bool)
            image_state["last_mask"] = last_mask
        else:
            last_mask = image_state.get("last_mask")

        if last_mask is None:
            raise ValueError("No segmentation results available. Segment at least one object first.")

        save_mask_outputs(
            last_mask,
            image_state["mask_save_path"],
            image_state["instance_mask_dir"],
            image_state["folder_name"],
        )

        segments = []
        components = split_connected_components(last_mask)
        colors = []
        for index, component in enumerate(components):
            color = SEGMENT_COLORS[index % len(SEGMENT_COLORS)]
            colors.append(color)
            metrics = calculate_mask_metrics(component)
            segments.append(
                {
                    "segment_id": f"component_{index + 1}",
                    "score": 0.0,
                    "color": "#{:02x}{:02x}{:02x}".format(*color),
                    **metrics,
                }
            )
        image_state["segments"] = segments
        json_response(
            self,
            200,
            {
                "segments": segments,
            },
        )

    def handle_admin_samples(self):
        samples = []
        for sample_dir in list_sample_dirs(UPLOAD_DIR):
            try:
                record = sample_record(sample_dir)
                image = read_image(record["image_path"])
                height, width = image.shape[:2]
                samples.append(
                    {
                        "sample_id": record["sample_id"],
                        "folder_name": record["folder_name"],
                        "width": int(width),
                        "height": int(height),
                    }
                )
            except Exception:
                continue
        json_response(self, 200, {"samples": samples})

    def handle_admin_sample(self, query: str):
        params = parse_qs(query)
        sample_id = params.get("sample_id", [""])[0]
        if not sample_id:
            raise ValueError("sample_id is required.")
        sample_dir = UPLOAD_DIR / sample_id
        if not sample_dir.exists():
            raise ValueError("Unknown sample_id.")
        json_response(self, 200, load_sample_payload(sample_dir))

    def handle_admin_approve(self):
        payload = self.read_json()
        sample_id = payload.get("sample_id", "")
        mask_data_url = payload.get("mask_data_url", "")
        if not sample_id:
            raise ValueError("sample_id is required.")
        if not mask_data_url:
            raise ValueError("mask_data_url is required.")

        sample_dir = UPLOAD_DIR / sample_id
        if not sample_dir.exists():
            raise ValueError("Unknown sample_id.")

        record = sample_record(sample_dir)
        mask = decode_mask_data_url(mask_data_url)
        save_mask_outputs(mask, record["mask_path"], record["instance_mask_dir"], record["folder_name"])

        destination = APPROVED_DIR / sample_dir.name
        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(sample_dir), str(destination))

        json_response(
            self,
            200,
            {
                "sample_id": sample_id,
                "status": "approved",
                "destination": str(destination),
            },
        )

    def handle_admin_delete(self):
        payload = self.read_json()
        sample_id = payload.get("sample_id", "")
        if not sample_id:
            raise ValueError("sample_id is required.")

        sample_dir = UPLOAD_DIR / sample_id
        if not sample_dir.exists():
            raise ValueError("Unknown sample_id.")

        destination = DELETED_DIR / sample_dir.name
        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(sample_dir), str(destination))

        json_response(
            self,
            200,
            {
                "sample_id": sample_id,
                "status": "deleted",
                "destination": str(destination),
            },
        )


def main():
    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", "8765"))
    print(f"micro-sam web UI: http://{host}:{port}")
    print("Model loads on first image upload. On CPU this can take a while.")
    ThreadingHTTPServer((host, port), SamWebHandler).serve_forever()


if __name__ == "__main__":
    main()
