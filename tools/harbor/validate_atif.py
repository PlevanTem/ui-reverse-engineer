"""Validate ATIF-v1.8 fixtures or trial trajectories with Harbor's Pydantic model."""
import argparse
import json
from pathlib import Path

from harbor.models.trajectories import Trajectory


def assert_preserved(source, round_trip, path="$root") -> None:
    """Fail if any explicitly supplied non-null field is lost or changed."""
    if isinstance(source, dict):
        for key, value in source.items():
            if value is None:
                continue
            if key not in round_trip:
                raise ValueError(f"{path}.{key}: field lost during Harbor model round-trip")
            assert_preserved(value, round_trip[key], f"{path}.{key}")
    elif isinstance(source, list):
        if len(source) != len(round_trip):
            raise ValueError(f"{path}: list length changed during Harbor model round-trip")
        for index, value in enumerate(source):
            assert_preserved(value, round_trip[index], f"{path}[{index}]")
    elif source != round_trip:
        raise ValueError(f"{path}: value changed during Harbor model round-trip")


def validate(path: Path) -> tuple[dict, dict]:
    source = json.loads(path.read_text(encoding="utf-8-sig"))
    model = Trajectory.model_validate(source)
    if model.schema_version != "ATIF-v1.8":
        raise ValueError(f"{path}: expected ATIF-v1.8")
    round_trip = model.to_json_dict(exclude_none=True)
    Trajectory.model_validate(round_trip)
    assert_preserved(source, round_trip)
    return source, round_trip


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    records = []
    by_name = {}
    for path in args.paths:
        source, round_trip = validate(path)
        by_name[path.name] = source
        records.append({"path": str(path), "steps": len(round_trip["steps"]), "trajectory_id": round_trip.get("trajectory_id")})
    for name, value in by_name.items():
        ref = value.get("continued_trajectory_ref")
        if ref:
            if ref not in by_name:
                raise ValueError(f"{name}: missing continuation {ref}")
            if by_name[ref].get("session_id") != value.get("session_id"):
                raise ValueError(f"{name}: continuation session_id mismatch")
    print(json.dumps({"status": "passed", "atif_version": "ATIF-v1.8", "files": records}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
