"""Validate a Harbor dataset.toml with Harbor 0.25.0 and round-trip it losslessly."""
import argparse
from pathlib import Path

from harbor.models.dataset.manifest import DatasetManifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    source = DatasetManifest.from_toml_file(args.path)
    round_trip = DatasetManifest.from_toml(source.to_toml())
    if source.model_dump(mode="json") != round_trip.model_dump(mode="json"):
        raise ValueError("Harbor dataset manifest changed during model round-trip")
    print(f'{{"status":"passed","dataset":"{source.dataset.name}","tasks":{len(source.tasks)}}}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
