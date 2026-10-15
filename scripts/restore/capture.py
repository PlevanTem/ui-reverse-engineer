#!/usr/bin/env python3
"""Capture frozen visual states with an existing Python Playwright installation.

The output is evidence, not a visual score. Browser launch may require a host
that permits Playwright's driver process; this script installs nothing.
"""
import hashlib
import json
import platform
import re
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe(root: Path, uri: str) -> Path:
    path = (root / uri).resolve()
    if root not in path.parents:
        raise ValueError(f"Evidence path outside run: {uri}")
    return path


def main() -> int:
    if len(sys.argv) != 5 or sys.argv[2] not in ("reference", "candidate"):
        print("Usage: python scripts/restore/capture.py RUN reference|candidate BASE_URL output.json", file=sys.stderr)
        return 2
    root = Path(sys.argv[1]).resolve()
    side, base_url, output = sys.argv[2:]
    run = json.loads((root / "run.json").read_text(encoding="utf-8"))
    contract = json.loads((root / "contract.json").read_text(encoding="utf-8"))
    if run.get("stop"):
        limit_ms = 1000 * {"ordinary": 30, "refined": 60, "complex": 120}[run["tier"]] * 60
    else:
        limit_ms = 1000 * ({"ordinary": 27, "refined": 54, "complex": 108}[run["tier"]]) * 60
    started = datetime.fromisoformat(run["started_at"].replace("Z", "+00:00")).timestamp()
    deadline = started + limit_ms / 1000
    if time.time() >= deadline:
        raise TimeoutError("Run capture budget exhausted")
    def timeout() -> int:
        value = int(min(30000, (deadline - time.time()) * 1000))
        if value <= 0:
            raise TimeoutError("Run capture budget exhausted")
        return value
    states = contract["states"]
    pending = run.get("pending")
    if side == "candidate" and pending:
        states = [s for s in states if s["id"] in pending["required_states"]]
    result = {"schema_version": "Capture/v0.2", "side": side, "environment": None,
              "evidence": [], "states": [], "coverage": [], "failures": []}
    (root / "evidence").mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, timeout=timeout())
        try:
            environment = {"browser": browser.version, "os": platform.system() + " " + platform.release(),
                           "dpr": contract["environment"]["dpr"], "locale": contract["environment"]["locale"]}
            result["environment"] = environment
            if run.get("contract_sha256") and environment != contract["environment"]:
                raise ValueError("Capture environment differs from frozen environment")
            for state in states:
                context = browser.new_context(viewport=state["viewport"], device_scale_factor=environment["dpr"],
                                              locale=environment["locale"], color_scheme=state.get("color_scheme", "light"),
                                              reduced_motion="no-preference",
                                              storage_state=str(safe(root, state["storage_state"])) if state.get("storage_state") else None)
                page = context.new_page()
                errors, resources, frames = [], [], []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on("response", lambda r: resources.append({"url": r.url, "status": r.status,
                                                                   "type": r.request.resource_type}))
                key = f"{side}-{re.sub(r'[^A-Za-z0-9_-]', '_', state['id'])}-{uuid.uuid4().hex[:12]}"

                def frame(label: str):
                    uri = f"evidence/{key}-{label}.png"
                    image = page.screenshot(animations="allow", timeout=timeout())
                    safe(root, uri).write_bytes(image)
                    item = {"id": key + "-" + label, "uri": uri, "sha256": digest(image),
                            "kind": "screenshot", "state_id": state["id"], "captured_at": time.time()}
                    result["evidence"].append(item)
                    frames.append({"id": item["id"], "at": time.time(), "uri": uri})

                try:
                    response = page.goto(urljoin(base_url, state["path"]), wait_until="domcontentloaded", timeout=timeout())
                    page.locator(state["ready_selector"]).wait_for(state="visible", timeout=timeout())
                    page.wait_for_function("document.fonts.status === 'loaded'", timeout=timeout())
                    page.mouse.move(0, 0)
                    frame("initial")
                    for index, step in enumerate(state.get("steps", [])):
                        action = step["action"]
                        if action == "click":
                            page.locator(step["selector"]).click(timeout=timeout())
                        elif action == "hover":
                            page.locator(step["selector"]).hover(timeout=timeout())
                        elif action == "key":
                            page.keyboard.press(step["key"])
                        elif action == "scroll":
                            page.evaluate("({x,y}) => window.scrollTo(x,y)", {"x": step.get("x", 0), "y": step.get("y", 0)})
                        elif action == "wait":
                            ms = step["ms"]
                            if not isinstance(ms, (int, float)) or not 0 <= ms <= 5000:
                                raise ValueError("Wait step must be 0–5000 ms")
                            page.wait_for_timeout(min(ms, timeout()))
                        else:
                            raise ValueError(f"Unsupported capture action: {action}")
                        if step.get("ready_selector"):
                            page.locator(step["ready_selector"]).wait_for(state="visible", timeout=timeout())
                        frame(f"step-{index}")
                    if not state.get("steps"):
                        page.wait_for_timeout(min(150, timeout()))
                        frame("repeat")
                    facts = page.evaluate("""selectors => ({
                      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},url:location.href,
                      title:document.title,overflow:document.documentElement.scrollWidth>innerWidth,
                      fonts:document.fonts.status,
                      broken_images:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.currentSrc),
                      regions:selectors.map(selector=>{const el=document.querySelector(selector);if(!el)return {selector,missing:true};
                        const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {selector,
                          rect:{x:b.x,y:b.y,width:b.width,height:b.height},
                          style:{fontFamily:s.fontFamily,fontSize:s.fontSize,color:s.color,backgroundColor:s.backgroundColor},
                          text:el.textContent.slice(0,500)};})})""", state.get("selectors", []))
                    if facts["viewport"] != {"width": state["viewport"]["width"],
                                               "height": state["viewport"]["height"], "dpr": environment["dpr"]}:
                        raise ValueError("Actual viewport differs from frozen viewport")
                    record = {"state_id": state["id"], "status": response.status if response else None,
                              "facts": facts, "errors": errors, "resources": resources, "frames": frames,
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
                    result["failures"].append({"state_id": state["id"], "reason": str(error)})
                finally:
                    context.close()
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
