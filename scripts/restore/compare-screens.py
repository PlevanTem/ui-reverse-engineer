#!/usr/bin/env python3
"""Pairwise screenshot diagnostic. Requires Pillow; does not decide Go/No-Go."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

parser = argparse.ArgumentParser()
parser.add_argument("reference", type=Path)
parser.add_argument("candidate", type=Path)
parser.add_argument("--diff", type=Path)
parser.add_argument("--json", type=Path)
parser.add_argument("--rect", nargs=4, type=int, metavar=("X", "Y", "WIDTH", "HEIGHT"), help="Score one frozen pixel region")
args = parser.parse_args()

reference = Image.open(args.reference).convert("RGB")
candidate = Image.open(args.candidate).convert("RGB")
original_size = reference.size
if args.rect and reference.size == candidate.size:
    x, y, width, height = args.rect
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > reference.width or y + height > reference.height:
        parser.error("--rect must lie within both screenshots")
    box = (x, y, x + width, y + height)
    reference = reference.crop(box)
    candidate = candidate.crop(box)
result = {
    "reference": str(args.reference), "candidate": str(args.candidate),
    "size_reference": list(reference.size), "size_candidate": list(candidate.size),
    "source_size": list(original_size), "rect": args.rect,
    "comparable": reference.size == candidate.size,
    "mae_0_255": None, "mean_absolute_error_ratio": None,
    "exact_pixel_ratio": None, "different_bbox": None,
}
if result["comparable"]:
    difference = ImageChops.difference(reference, candidate)
    result["mae_0_255"] = sum(ImageStat.Stat(difference).mean) / 3
    result["mean_absolute_error_ratio"] = result["mae_0_255"] / 255
    result["exact_pixel_ratio"] = sum(1 for pixel in difference.get_flattened_data() if pixel == (0, 0, 0)) / (reference.width * reference.height)
    result["different_bbox"] = list(difference.getbbox()) if difference.getbbox() else None
    if args.diff:
        args.diff.parent.mkdir(parents=True, exist_ok=True)
        difference.save(args.diff)
if args.json:
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
