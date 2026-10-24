#!/usr/bin/env python3
"""Capture frozen visual states with an existing Python Playwright installation.

The output is evidence, not a visual score. Browser launch may require a host
that permits Playwright's driver process; this script installs nothing.
"""
import hashlib
import json
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright
from capture_actions import execute_capture_step
from capture_clock import CaptureClockIsolation, CAPTURE_CLOCK_MODE


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def safe(root: Path, uri: str) -> Path:
    path = (root / uri).resolve()
    if root not in path.parents:
        raise ValueError(f"Evidence path outside run: {uri}")
    return path


def close_capture_resources(page, context, close_context: bool):
    errors = []
    if page is not None:
        try:
            page.close()
        except Exception as error:
            errors.append(f"page.close: {error}")
    if close_context and context is not None:
        try:
            context.close()
        except Exception as error:
            errors.append(f"context.close: {error}")
    return errors


def main() -> int:
    if len(sys.argv) != 5 or sys.argv[2] not in ("reference", "candidate"):
        print("Usage: python scripts/restore/capture.py RUN reference|candidate BASE_URL output.json", file=sys.stderr)
        return 2
    root = Path(sys.argv[1]).resolve()
    side, base_url, output = sys.argv[2:]
    # Node is already required by Restore; use its canonical hashing and budget
    # implementation instead of reproducing JS JSON/number normalization here.
    planner = Path(__file__).with_name("capture-plan.mjs")
    planned = subprocess.run(["node", str(planner), str(root), side], capture_output=True, text=True, encoding="utf-8", timeout=30)
    if planned.returncode:
        raise ValueError(planned.stderr.strip())
    plan = json.loads(planned.stdout)
    contract = plan["contract"]
    facts_expression = Path(__file__).with_name("capture-page-facts.js").read_text(encoding="utf-8")
    deadline = plan["deadline_ms"] / 1000
    if time.time() >= deadline:
        raise TimeoutError("Run capture budget exhausted")
    def timeout() -> int:
        value = int(min(30000, (deadline - time.time()) * 1000))
        if value <= 0:
            raise TimeoutError("Run capture budget exhausted")
        return value
    states = plan["states"]
    result = {"schema_version": "Capture/v0.2", "side": side, "environment": None,
              "binding": plan["binding"], "evidence": [], "states": [], "coverage": [], "failures": []}
    (root / "evidence").mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, timeout=timeout())
        try:
            environment = {"browser": browser.version, "os": plan["os"],
                           "dpr": contract["environment"]["dpr"], "locale": contract["environment"]["locale"]}
            result["environment"] = environment
            if plan["frozen"] and environment != contract["environment"]:
                raise ValueError("Capture environment differs from frozen environment")
            shared_contexts = {}
            invalid_sessions = {}
            for state in states:
                owns_context = not state.get("session_id")
                errors, resources, frames, actions, request_failures = [], [], [], [], []
                key = f"{side}-{re.sub(r'[^A-Za-z0-9_-]', '_', state['id'])}-{uuid.uuid4().hex[:12]}"
                context = page = capture_clock = None
                state_failed = False
                if state.get("session_id") in invalid_sessions:
                    reason = f"Shared session prerequisite failed: {invalid_sessions[state['session_id']]}"
                    uri = f"evidence/{key}-prerequisite-failure.json"
                    encoded = json.dumps({"state_id": state["id"], "session_id": state.get("session_id"),
                        "url": None, "phase": "prerequisite", "reason": reason}, ensure_ascii=False, indent=2).encode("utf-8")
                    safe(root, uri).write_bytes(encoded)
                    result["evidence"].append({"id": key + "-prerequisite-failure", "uri": uri,
                        "sha256": digest(encoded), "kind": "checks", "state_id": state["id"]})
                    result["failures"].append({"state_id": state["id"], "reason": reason, "diagnostic_uri": uri})
                    continue
                try:
                    context = shared_contexts.get(state.get("session_id")) if not owns_context else None
                    if context is None:
                        context = browser.new_context(viewport=state["viewport"], device_scale_factor=environment["dpr"],
                                                      locale=environment["locale"], color_scheme=state.get("color_scheme", "light"),
                                                      reduced_motion="no-preference",
                                                      storage_state=str(safe(root, state["storage_state"])) if state.get("storage_state") else None)
                        if not owns_context:
                            shared_contexts[state["session_id"]] = context
                    page = context.new_page()
                    capture_clock = CaptureClockIsolation(page, context)
                    capture_clock.install()
                    page.add_init_script(script=f"globalThis.__restoreCaptureFacts=({facts_expression});")
                    page.on("pageerror", lambda e: errors.append(str(e)))
                    page.on("response", lambda r: resources.append({"url": r.url, "status": r.status,
                                                                       "type": r.request.resource_type}))
                    page.on("requestfailed", lambda r: request_failures.append({"url": r.url, "reason": r.failure, "type": r.resource_type}))
                except Exception as error:
                    state_failed = True
                    if state.get("session_id"):
                        invalid_sessions[state["session_id"]] = f"{state['id']}: {error}"
                    cleanup_errors = close_capture_resources(page, context, True)
                    if state.get("session_id"):
                        shared_contexts.pop(state["session_id"], None)
                    reason = "; ".join([str(error), *cleanup_errors])
                    uri = f"evidence/{key}-failure.json"
                    encoded = json.dumps({"state_id": state["id"], "session_id": state.get("session_id"),
                        "url": page.url if page else None, "phase": "setup", "reason": reason,
                        "errors": errors, "resources": resources, "request_failures": request_failures,
                        "actions": actions, "frames": frames}, ensure_ascii=False, indent=2).encode("utf-8")
                    safe(root, uri).write_bytes(encoded)
                    result["evidence"].append({"id": key + "-failure", "uri": uri, "sha256": digest(encoded),
                        "kind": "checks", "state_id": state["id"]})
                    result["failures"].append({"state_id": state["id"], "reason": reason, "diagnostic_uri": uri})
                    continue

                def frame(label: str, timing=None):
                    capture_started_at = iso_now()
                    uri = f"evidence/{key}-{label}.png"
                    image, isolation = capture_clock.run(
                        lambda: page.screenshot(animations="allow", timeout=timeout()))
                    safe(root, uri).write_bytes(image)
                    item = {"id": key + "-" + label, "uri": uri, "sha256": digest(image),
                            "kind": "screenshot", "state_id": state["id"], "captured_at": iso_now(),
                            "artifact_sha256": plan["binding"]["artifact_sha256"] if plan["binding"] else None}
                    result["evidence"].append(item)
                    frames.append({"id": item["id"], "at": time.time() * 1000, "uri": uri,
                                   "capture_started_at": capture_started_at, "timing": timing,
                                   "clock_isolation": isolation})
                    return isolation

                try:
                    ready_deadline = min(deadline, time.time() + state.get("ready_timeout_ms", 30000) / 1000)
                    def ready_timeout():
                        remaining = int((ready_deadline - time.time()) * 1000)
                        if remaining <= 0:
                            raise TimeoutError("State readiness deadline exhausted")
                        return remaining
                    response = page.goto(urljoin(base_url, state["path"]), wait_until="domcontentloaded", timeout=ready_timeout())
                    page.locator(state["ready_selector"]).wait_for(state="visible", timeout=ready_timeout())
                    for check in state.get("ready_checks", []):
                        page.locator(check["selector"]).wait_for(state=check["state"], timeout=ready_timeout())
                    page.wait_for_function("document.fonts.status === 'loaded'", timeout=ready_timeout())
                    page.mouse.move(0, 0)
                    frame("initial")
                    for index, step in enumerate(state.get("steps", [])):
                        actions.append(execute_capture_step(page, step, timeout,
                            lambda label, timing: frame(f"step-{index}-{label}", timing)))
                    if not state.get("steps"):
                        page.wait_for_timeout(min(150, timeout()))
                        frame("repeat")
                    facts = page.evaluate("selectors => globalThis.__restoreCaptureFacts(selectors)", state.get("selectors", []))
                    if facts["viewport"] != {"width": state["viewport"]["width"],
                                               "height": state["viewport"]["height"], "dpr": environment["dpr"]}:
                        raise ValueError("Actual viewport differs from frozen viewport")
                    record = {"state_id": state["id"], "session_id": state.get("session_id"), "status": response.status if response else None,
                              "facts": facts, "errors": errors, "resources": resources, "request_failures": request_failures,
                              "actions": actions, "frames": frames,
                              "clock_isolation": {"mode": CAPTURE_CLOCK_MODE,
                                  "excluded_capture_ms": sum(f["clock_isolation"]["excluded_wall_ms"] for f in frames)},
                              "stability": "dynamic" if state.get("steps") else
                              ("stable" if result["evidence"][-1]["sha256"] == result["evidence"][-2]["sha256"] else "variable")}
                    uri = f"evidence/{key}.json"
                    encoded = json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8")
                    safe(root, uri).write_bytes(encoded)
                    result["evidence"].append({"id": key + "-checks", "uri": uri, "sha256": digest(encoded),
                                               "kind": "checks", "state_id": state["id"]})
                    if state.get("steps"):
                        result["evidence"].append({"id": key + "-sequence", "uri": uri, "sha256": digest(encoded),
                                                   "kind": "sequence", "state_id": state["id"]})
                    result["states"].append(record)
                    result["coverage"].append(state["id"])
                except Exception as error:
                    state_failed = True
                    if state.get("session_id"):
                        invalid_sessions[state["session_id"]] = f"{state['id']}: {error}"
                    uri = f"evidence/{key}-failure.json"
                    encoded = json.dumps({"state_id": state["id"], "session_id": state.get("session_id"),
                        "url": page.url, "phase": "capture", "reason": str(error),
                        "errors": errors, "resources": resources, "request_failures": request_failures,
                        "actions": actions, "frames": frames}, ensure_ascii=False, indent=2).encode("utf-8")
                    safe(root, uri).write_bytes(encoded)
                    result["evidence"].append({"id": key + "-failure", "uri": uri, "sha256": digest(encoded),
                        "kind": "checks", "state_id": state["id"]})
                    result["failures"].append({"state_id": state["id"], "reason": str(error), "diagnostic_uri": uri})
                finally:
                    close_context = owns_context or state_failed
                    cleanup_errors = close_capture_resources(page, context, close_context)
                    if state.get("session_id") and close_context:
                        shared_contexts.pop(state["session_id"], None)
                    if cleanup_errors:
                        if state.get("session_id") and state["session_id"] not in invalid_sessions:
                            invalid_sessions[state["session_id"]] = f"{state['id']}: {'; '.join(cleanup_errors)}"
                        if state_failed:
                            failure = next(item for item in reversed(result["failures"]) if item["state_id"] == state["id"])
                            reason = f"{failure['reason']}; cleanup: {'; '.join(cleanup_errors)}"
                            uri = failure["diagnostic_uri"]
                            encoded = json.dumps({"state_id": state["id"], "session_id": state.get("session_id"),
                                "url": page.url if page else None, "phase": "capture" if page else "setup", "reason": reason,
                                "cleanup_errors": cleanup_errors, "errors": errors, "resources": resources,
                                "request_failures": request_failures, "actions": actions, "frames": frames},
                                ensure_ascii=False, indent=2).encode("utf-8")
                            safe(root, uri).write_bytes(encoded)
                            evidence = next(item for item in result["evidence"] if item["uri"] == uri)
                            evidence["sha256"] = digest(encoded)
                            failure["reason"] = reason
                        else:
                            result["states"] = [item for item in result["states"] if item["state_id"] != state["id"]]
                            result["coverage"] = [item for item in result["coverage"] if item != state["id"]]
                            result["evidence"] = [item for item in result["evidence"] if item.get("state_id") != state["id"] or not (item["id"].endswith("-checks") or item["id"].endswith("-sequence"))]
                            reason = "; ".join(cleanup_errors)
                            uri = f"evidence/{key}-cleanup-failure.json"
                            encoded = json.dumps({"state_id": state["id"], "session_id": state.get("session_id"),
                                "url": None, "phase": "cleanup", "reason": reason, "errors": errors,
                                "resources": resources, "request_failures": request_failures, "actions": actions,
                                "frames": frames}, ensure_ascii=False, indent=2).encode("utf-8")
                            safe(root, uri).write_bytes(encoded)
                            result["evidence"].append({"id": key + "-cleanup-failure", "uri": uri,
                                "sha256": digest(encoded), "kind": "checks", "state_id": state["id"]})
                            result["failures"].append({"state_id": state["id"], "reason": reason, "diagnostic_uri": uri})
            for session_id, context in list(shared_contexts.items()):
                cleanup_errors = close_capture_resources(None, context, True)
                if not cleanup_errors:
                    continue
                key = f"{side}-session-{session_id}-{uuid.uuid4().hex[:12]}"
                uri = f"evidence/{key}-cleanup-failure.json"
                reason = "; ".join(cleanup_errors)
                encoded = json.dumps({"state_id": f"session:{session_id}", "session_id": session_id,
                    "url": None, "phase": "session_cleanup", "reason": reason}, ensure_ascii=False, indent=2).encode("utf-8")
                safe(root, uri).write_bytes(encoded)
                result["evidence"].append({"id": key + "-cleanup-failure", "uri": uri,
                    "sha256": digest(encoded), "kind": "checks", "state_id": f"session:{session_id}"})
                result["failures"].append({"state_id": f"session:{session_id}", "reason": reason, "diagnostic_uri": uri})
        finally:
            browser.close()
    Path(output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(Path(output).resolve()), "coverage": result["coverage"],
                      "failures": result["failures"], "environment": result["environment"]}, ensure_ascii=False))
    return 1 if result["failures"] else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
