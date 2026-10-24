import json
import hashlib
import sys
import time
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture_clock import CAPTURE_CLOCK_MODE, CaptureClockIsolation
from capture_actions import execute_capture_step
import capture as capture_module
from capture import close_capture_resources, iso_now


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


class FakeClock:
    def __init__(self, calls):
        self.calls = calls

    def install(self):
        self.calls.append("install")

    def resume(self):
        self.calls.append("resume")


class FakeCDP:
    def __init__(self, calls):
        self.calls = calls

    def send(self, _command, value):
        self.calls.append(value["state"])


class FakeContext:
    def __init__(self, calls):
        self.calls = calls

    def new_cdp_session(self, _page):
        self.calls.append("cdp")
        return FakeCDP(self.calls)


class FakePage:
    def __init__(self, calls):
        self.clock = FakeClock(calls)

    def evaluate(self, expression):
        self.clock.calls.append(("atomic-pause", "controller.pauseAt(current)" in expression))
        return 1234


class CaptureClockIsolationTest(unittest.TestCase):
    def test_cleanup_attempts_context_after_page_close_failure(self):
        calls = []

        class Page:
            @staticmethod
            def close():
                calls.append("page")
                raise RuntimeError("page failed")

        class Context:
            @staticmethod
            def close():
                calls.append("context")
                raise RuntimeError("context failed")

        self.assertEqual(close_capture_resources(Page(), Context(), True),
                         ["page.close: page failed", "context.close: context failed"])
        self.assertEqual(calls, ["page", "context"])

    def test_evidence_timestamp_matches_node_iso_shape(self):
        self.assertRegex(iso_now(), r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")

    def test_python_adapter_records_setup_failure_and_closes_resources(self):
        calls = []

        class Context:
            @staticmethod
            def new_page():
                raise RuntimeError("new page failed")

            @staticmethod
            def close():
                calls.append("context")
                raise RuntimeError("context close failed")

        class Browser:
            version = "fixture"

            @staticmethod
            def new_context(**_options):
                return Context()

            @staticmethod
            def close():
                calls.append("browser")

        class PlaywrightContext:
            def __enter__(self):
                return SimpleNamespace(chromium=SimpleNamespace(launch=lambda **_options: Browser()))

            def __exit__(self, *_args):
                return False

        root = Path(__file__).resolve().parent
        output = root / f"capture-{uuid.uuid4().hex}.json"
        diagnostic_path = None
        try:
            plan = {"deadline_ms": time.time() * 1000 + 5000, "root": str(root), "side": "candidate",
                    "contract": {"environment": {"dpr": 1, "locale": "en-US"}}, "frozen": False,
                    "binding": {"artifact_sha256": "fixture"}, "os": "fixture",
                    "states": [{"id": state_id, "path": "/", "viewport": {"width": 800, "height": 600},
                                "ready_selector": "body", "regions": ["scene"], "steps": [], "session_id": "progression"}
                               for state_id in ("setup-failure", "dependent")]}
            planned = SimpleNamespace(returncode=0, stdout=json.dumps(plan), stderr="")
            argv = ["capture.py", str(root), "candidate", "http://fixture.invalid/", str(output)]
            with patch.object(capture_module.subprocess, "run", return_value=planned), \
                 patch.object(capture_module, "sync_playwright", return_value=PlaywrightContext()), \
                 patch.object(sys, "argv", argv):
                self.assertEqual(capture_module.main(), 1)
            captured = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(captured["coverage"], [])
            self.assertEqual(len(captured["failures"]), 2)
            diagnostic_path = root / captured["failures"][0]["diagnostic_uri"]
            diagnostic = json.loads(diagnostic_path.read_text(encoding="utf-8"))
            self.assertEqual(diagnostic["phase"], "setup")
            self.assertIn("new page failed", diagnostic["reason"])
            self.assertIn("context.close: context close failed", diagnostic["reason"])
            dependent_path = root / captured["failures"][1]["diagnostic_uri"]
            dependent = json.loads(dependent_path.read_text(encoding="utf-8"))
            self.assertEqual(dependent["phase"], "prerequisite")
            self.assertIn("setup-failure: new page failed", dependent["reason"])
            self.assertEqual(calls, ["context", "browser"])
        finally:
            output.unlink(missing_ok=True)
            if diagnostic_path is not None:
                diagnostic_path.unlink(missing_ok=True)
            if 'dependent_path' in locals():
                dependent_path.unlink(missing_ok=True)
            try:
                (root / "evidence").rmdir()
            except OSError:
                pass

    def test_python_capture_failure_invalidates_session_and_keeps_cleanup_errors(self):
        calls = []

        class Page:
            url = "http://fixture.invalid/"

            @staticmethod
            def add_init_script(**_options):
                pass

            @staticmethod
            def on(*_args):
                pass

            @staticmethod
            def goto(*_args, **_options):
                raise RuntimeError("navigation failed")

            @staticmethod
            def close():
                calls.append("page")
                raise RuntimeError("page close failed")

        class Context:
            @staticmethod
            def new_page():
                return Page()

            @staticmethod
            def close():
                calls.append("context")
                raise RuntimeError("context close failed")

        class Browser:
            version = "fixture"

            @staticmethod
            def new_context(**_options):
                return Context()

            @staticmethod
            def close():
                calls.append("browser")

        class PlaywrightContext:
            def __enter__(self):
                return SimpleNamespace(chromium=SimpleNamespace(launch=lambda **_options: Browser()))

            def __exit__(self, *_args):
                return False

        class Clock:
            def __init__(self, *_args):
                pass

            @staticmethod
            def install():
                pass

        root = Path(__file__).resolve().parent
        output = root / f"capture-{uuid.uuid4().hex}.json"
        diagnostic_paths = []
        try:
            plan = {"deadline_ms": time.time() * 1000 + 5000, "root": str(root), "side": "candidate",
                    "contract": {"environment": {"dpr": 1, "locale": "en-US"}}, "frozen": False,
                    "binding": {"artifact_sha256": "fixture"}, "os": "fixture",
                    "states": [{"id": state_id, "path": "/", "viewport": {"width": 800, "height": 600},
                                "ready_selector": "body", "regions": ["scene"], "steps": [], "session_id": "progression"}
                               for state_id in ("capture-failure", "dependent")]}
            planned = SimpleNamespace(returncode=0, stdout=json.dumps(plan), stderr="")
            argv = ["capture.py", str(root), "candidate", "http://fixture.invalid/", str(output)]
            with patch.object(capture_module.subprocess, "run", return_value=planned), \
                 patch.object(capture_module, "sync_playwright", return_value=PlaywrightContext()), \
                 patch.object(capture_module, "CaptureClockIsolation", Clock), patch.object(sys, "argv", argv):
                self.assertEqual(capture_module.main(), 1)
            captured = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(len(captured["failures"]), 2)
            diagnostic_paths = [root / item["diagnostic_uri"] for item in captured["failures"]]
            failure = json.loads(diagnostic_paths[0].read_text(encoding="utf-8"))
            dependent = json.loads(diagnostic_paths[1].read_text(encoding="utf-8"))
            self.assertEqual(failure["phase"], "capture")
            self.assertIn("navigation failed; cleanup: page.close: page close failed; context.close: context close failed", failure["reason"])
            self.assertEqual(failure["cleanup_errors"], ["page.close: page close failed", "context.close: context close failed"])
            self.assertEqual(captured["evidence"][0]["sha256"], digest(diagnostic_paths[0].read_bytes()))
            self.assertEqual(dependent["phase"], "prerequisite")
            self.assertIn("capture-failure: navigation failed", dependent["reason"])
            self.assertEqual(calls, ["page", "context", "browser"])
        finally:
            output.unlink(missing_ok=True)
            for path in diagnostic_paths:
                path.unlink(missing_ok=True)
            try:
                (root / "evidence").rmdir()
            except OSError:
                pass

    def test_excludes_operation_time_and_restores_page(self):
        calls = []
        host = [0]
        isolation = CaptureClockIsolation(FakePage(calls), FakeContext(calls), now=lambda: host[0])
        isolation.install()

        def operation():
            calls.append("capture")
            host[0] += 875
            return b"png"

        value, timing = isolation.run(operation)
        self.assertEqual(value, b"png")
        self.assertEqual(timing, {"mode": CAPTURE_CLOCK_MODE, "page_time_ms": 1234,
                                  "excluded_wall_ms": 875})
        self.assertEqual(calls, ["install", "cdp", "frozen", ("atomic-pause", True),
                                 "capture", "active", "resume"])

    def test_restores_page_after_operation_failure(self):
        calls = []
        isolation = CaptureClockIsolation(FakePage(calls), FakeContext(calls))
        isolation.install()
        with self.assertRaisesRegex(RuntimeError, "png failed"):
            isolation.run(lambda: (_ for _ in ()).throw(RuntimeError("png failed")))
        self.assertEqual(calls[-2:], ["active", "resume"])

    def test_key_hold_samples_while_pressed_without_double_duration(self):
        timeline = [0]
        held = set()
        samples = []

        class Keyboard:
            def down(self, key):
                held.add(key)

            def up(self, key):
                held.discard(key)

        class Page:
            keyboard = Keyboard()

            @staticmethod
            def wait_for_timeout(ms):
                timeline[0] += ms

        def capture(label, timing):
            samples.append((label, "w" in held, timing["actual_offset_ms"]))
            timeline[0] += 25
            return {"excluded_wall_ms": 25}

        log = execute_capture_step(Page(), {"action": "key_hold", "key": "w", "duration_ms": 100,
                                           "capture_at_ms": [0, 40, 100]},
                                   lambda: 1000, capture, now=lambda: timeline[0])
        self.assertEqual(samples, [("after-0", True, 0), ("after-40", True, 40),
                                   ("after-100", True, 100)])
        self.assertFalse(held)
        self.assertEqual(log["input_duration_ms"], 100)
        self.assertEqual(log["elapsed_ms"], 100)
        self.assertEqual(log["wall_elapsed_ms"], 175)
        self.assertEqual(log["excluded_capture_ms"], 75)


if __name__ == "__main__":
    unittest.main()
