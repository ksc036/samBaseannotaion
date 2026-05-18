import unittest

import numpy as np

from web_app import ensure_rgb, mask_overlay_rgba, mask_to_uint8, outline_mask, normalize_points


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


if __name__ == "__main__":
    unittest.main()
