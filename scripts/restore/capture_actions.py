"""Playwright Python input executor. Steps are validated by capture-plan.mjs."""
import time


def execute_capture_step(page, step, timeout, capture, now=lambda: time.monotonic() * 1000):
    wall_start = now()
    excluded_capture_ms = 0

    def active_now():
        return now() - excluded_capture_ms

    start = active_now()
    log = {"step": step, "samples": []}

    def wait_until(origin, offset):
        delay = offset - (active_now() - origin)
        if delay > 0:
            if delay > timeout():
                raise TimeoutError("Capture deadline exhausted")
            page.wait_for_timeout(delay)
        timeout()

    def sample(label, origin, offset):
        nonlocal excluded_capture_ms
        actual = active_now() - origin
        result = capture(label, {"scheduled_ms": offset, "actual_offset_ms": actual,
                                 "lateness_ms": max(0, actual - offset)})
        if result:
            excluded_capture_ms += result.get("excluded_wall_ms", 0)
        log["samples"].append({"label": label, "scheduled_ms": offset, "actual_offset_ms": actual})

    def box():
        target = page.locator(step["selector"])
        target.wait_for(state="visible", timeout=timeout())
        value = target.bounding_box(timeout=timeout())
        if not value or value["width"] <= 0 or value["height"] <= 0:
            raise ValueError("Action target has no visible box")
        return value

    action = step["action"]
    captured_within_input = False
    if action == "click":
        options = {"timeout": timeout()}
        if step.get("position"):
            b = box()
            options["position"] = {"x": b["width"] * step["position"]["x"],
                                   "y": b["height"] * step["position"]["y"]}
        page.locator(step["selector"]).click(**options)
    elif action == "hover":
        page.locator(step["selector"]).hover(timeout=timeout())
    elif action == "key":
        page.keyboard.press(step["key"])
    elif action == "key_hold":
        page.keyboard.down(step["key"])
        origin = active_now()
        offsets = step.get("capture_at_ms", [step["duration_ms"]])
        try:
            for offset in offsets:
                wait_until(origin, offset)
                sample(f"after-{offset}", origin, offset)
            wait_until(origin, step["duration_ms"])
        finally:
            page.keyboard.up(step["key"])
        captured_within_input = True
    elif action == "scroll":
        page.evaluate("({x,y})=>window.scrollTo(x,y)", {"x": step.get("x", 0), "y": step["y"]})
    elif action == "wait":
        if step["ms"] > timeout():
            raise TimeoutError("Capture deadline exhausted")
        page.wait_for_timeout(step["ms"])
    elif action == "reload":
        page.reload(wait_until="domcontentloaded", timeout=timeout())
    elif action == "fill":
        page.locator(step["selector"]).fill(step["value"], timeout=timeout())
    elif action == "select":
        page.locator(step["selector"]).select_option(step["value"], timeout=timeout())
    elif action == "wheel":
        b = box()
        page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        page.mouse.wheel(step["delta_x"], step["delta_y"])
    elif action == "drag":
        b = box()
        path = step["path"]
        def move(p):
            page.mouse.move(b["x"] + p["x"] * b["width"], b["y"] + p["y"] * b["height"])
        move(path[0])
        page.mouse.down()
        origin = active_now()
        try:
            for index, p in enumerate(path):
                wait_until(origin, p["at_ms"])
                if index:
                    move(p)
                if p.get("capture"):
                    sample(f"drag-{index}", origin, p["at_ms"])
        finally:
            page.mouse.up()
    else:
        raise ValueError(f"Unsupported capture action: {action}")
    completed = active_now()
    log["input_duration_ms"] = completed - start
    if step.get("ready_selector"):
        page.locator(step["ready_selector"]).wait_for(state="visible", timeout=timeout())
    if not captured_within_input:
        for offset in step.get("capture_at_ms", [0]):
            wait_until(completed, offset)
            sample(f"after-{offset}", completed, offset)
    log["elapsed_ms"] = active_now() - start
    log["wall_elapsed_ms"] = now() - wall_start
    log["excluded_capture_ms"] = excluded_capture_ms
    return log
