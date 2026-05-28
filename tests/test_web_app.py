import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import imageio.v3 as iio
import numpy as np

from web_app import (
    calculate_mask_metrics,
    ensure_rgb,
    list_sample_dirs,
    load_sample_payload,
    mask_overlay_rgba,
    mask_to_uint8,
    normalize_points,
    normalize_patch_rect,
    outline_mask,
    split_connected_components,
)


class WebAppTests(unittest.TestCase):
    def test_mask_to_uint8_converts_positive_labels_to_255(self):
        mask = np.array([[0, 1], [2, 0]], dtype=np.uint32)

        converted = mask_to_uint8(mask)

        self.assertEqual(converted.dtype, np.uint8)
        np.testing.assert_array_equal(converted, np.array([[0, 255], [255, 0]], dtype=np.uint8))

    def test_outline_mask_keeps_only_outer_edge(self):
        mask = np.ones((5, 5), dtype=np.uint8) * 255

        outline = outline_mask(mask)

        expected = np.array(
            [
                [255, 255, 255, 255, 255],
                [255, 0, 0, 0, 255],
                [255, 0, 0, 0, 255],
                [255, 0, 0, 0, 255],
                [255, 255, 255, 255, 255],
            ],
            dtype=np.uint8,
        )
        np.testing.assert_array_equal(outline, expected)

    def test_normalize_points_maps_prompt_types_to_sam_labels(self):
        points = [
            {"x": 10.5, "y": 20.25, "type": "positive"},
            {"x": 15, "y": 25, "type": "negative"},
        ]

        coords, labels = normalize_points(points)

        np.testing.assert_array_equal(coords, np.array([[10.5, 20.25], [15.0, 25.0]], dtype=np.float32))
        np.testing.assert_array_equal(labels, np.array([1, 0], dtype=np.int32))

    def test_normalize_patch_rect_clips_patch_to_image_bounds(self):
        patch = {"x": 8, "y": 7, "width": 10, "height": 10}

        normalized = normalize_patch_rect(patch, (12, 14, 3))

        self.assertEqual(normalized, {"x": 8, "y": 7, "width": 6, "height": 5})

    def test_ensure_rgb_repeats_grayscale_images_to_three_channels(self):
        image = np.array([[0, 10], [20, 30]], dtype=np.uint8)

        rgb = ensure_rgb(image)

        self.assertEqual(rgb.shape, (2, 2, 3))
        np.testing.assert_array_equal(rgb[..., 0], image)
        np.testing.assert_array_equal(rgb[..., 1], image)
        np.testing.assert_array_equal(rgb[..., 2], image)

    def test_mask_overlay_rgba_makes_background_transparent(self):
        mask = np.array([[0, 255]], dtype=np.uint8)

        overlay = mask_overlay_rgba(mask)

        self.assertEqual(overlay.shape, (1, 2, 4))
        self.assertEqual(overlay[0, 0, 3], 0)
        self.assertGreater(overlay[0, 1, 3], 0)

    def test_calculate_mask_metrics_returns_expected_values_for_square(self):
        mask = np.zeros((5, 5), dtype=np.uint8)
        mask[1:4, 1:4] = 1

        metrics = calculate_mask_metrics(mask)

        self.assertEqual(metrics["area_pixels"], 9)
        self.assertAlmostEqual(metrics["equivalent_diameter_pixels"], np.sqrt((4.0 * 9.0) / np.pi), places=5)
        self.assertAlmostEqual(metrics["bbox_width_pixels"], 3.0)
        self.assertAlmostEqual(metrics["bbox_height_pixels"], 3.0)
        self.assertGreater(metrics["feret_max_pixels"], 0.0)
        self.assertGreater(metrics["feret_min_pixels"], 0.0)

    def test_split_connected_components_splits_disconnected_regions(self):
        mask = np.zeros((6, 6), dtype=np.uint8)
        mask[1:3, 1:3] = 1
        mask[4:6, 4:6] = 1

        components = split_connected_components(mask)

        self.assertEqual(len(components), 2)
        self.assertEqual(int(np.count_nonzero(components[0])), 4)
        self.assertEqual(int(np.count_nonzero(components[1])), 4)

    def test_list_sample_dirs_only_returns_expected_sample_folders(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            valid = root / "sample_a"
            (valid / "Image").mkdir(parents=True)
            (valid / "mask").mkdir()
            (root / "other").mkdir()

            sample_dirs = list_sample_dirs(root)

            self.assertEqual(sample_dirs, [valid])

    def test_load_sample_payload_returns_image_and_mask_urls(self):
        with TemporaryDirectory() as temp_dir:
            sample_dir = Path(temp_dir) / "sample_a"
            image_dir = sample_dir / "Image"
            mask_dir = sample_dir / "mask"
            image_dir.mkdir(parents=True)
            mask_dir.mkdir()

            image = np.zeros((4, 5, 3), dtype=np.uint8)
            image[..., 1] = 120
            iio.imwrite(image_dir / "sample_a.png", image)

            mask = np.zeros((4, 5), dtype=np.uint8)
            mask[1:3, 2:4] = 255
            iio.imwrite(mask_dir / "sample_a.png", mask)

            payload = load_sample_payload(sample_dir)

            self.assertEqual(payload["sample_id"], "sample_a")
            self.assertEqual(payload["width"], 5)
            self.assertEqual(payload["height"], 4)
            self.assertTrue(payload["image_data_url"].startswith("data:image/png;base64,"))
            self.assertTrue(payload["mask_data_url"].startswith("data:image/png;base64,"))


if __name__ == "__main__":
    unittest.main()
