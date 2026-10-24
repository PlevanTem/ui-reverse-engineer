"""Exclude screenshot serialization time from the captured page timeline."""
import time


CAPTURE_CLOCK_MODE = "playwright_clock+chromium_lifecycle"
ATOMIC_PAUSE_SCRIPT = """async () => {
  const controller = globalThis.__pwClock?.controller;
  if (!controller) throw new Error('Playwright clock controller unavailable');
  const current = Date.now();
  await controller.pauseAt(current);
  return current;
}"""


class CaptureClockIsolation:
    """Freeze Chromium and Playwright's page clock around one screenshot."""

    def __init__(self, page, context, now=lambda: time.monotonic() * 1000):
        self.page = page
        self.context = context
        self.now = now
        self.cdp = None

    def install(self):
        clock = getattr(self.page, "clock", None)
        if not clock or not all(hasattr(clock, name) for name in ("install", "resume")):
            raise RuntimeError("Capture requires Playwright clock support")
        if not hasattr(self.context, "new_cdp_session"):
            raise RuntimeError("Capture requires Chromium CDP lifecycle support")
        clock.install()
        self.cdp = self.context.new_cdp_session(self.page)

    def run(self, operation):
        if not self.cdp:
            raise RuntimeError("Capture clock isolation is not installed")
        host_started = self.now()
        pause_attempted = False
        page_time_ms = None
        excluded_wall_ms = 0
        self.cdp.send("Page.setWebLifecycleState", {"state": "frozen"})
        try:
            pause_attempted = True
            # A separate Date.now() read followed by public pause_at() races
            # Playwright's real-time synchronizer after long navigations. The
            # injected controller makes read + pause one atomic page task.
            page_time_ms = self.page.evaluate(ATOMIC_PAUSE_SCRIPT)
            value = operation()
        finally:
            try:
                self.cdp.send("Page.setWebLifecycleState", {"state": "active"})
            finally:
                excluded_wall_ms = max(0, self.now() - host_started)
                if pause_attempted:
                    self.page.clock.resume()
        return value, {"mode": CAPTURE_CLOCK_MODE, "page_time_ms": page_time_ms,
                       "excluded_wall_ms": excluded_wall_ms}
