"""Harbor-native Codex adapter with writable logs after multi-step staging.

Harbor 0.25.0 restores agent logs as root. Codex still runs as pwuser; before
each step, restore ownership of its dedicated log tree so tee/session copying
cannot silently reuse the preceding step's ATIF. Native conversion is unchanged.
"""
from harbor.agents.installed.codex import Codex


class RestoreCodex(Codex):
    async def run(self, instruction, environment, context):
        if self.environment_logs_dir.as_posix() != "/logs/agent":
            raise RuntimeError("Unexpected Codex log directory; refusing recursive ownership change")
        await self._ensure_agent_owned_dir(environment, self.environment_logs_dir)
        return await super().run(instruction, environment, context)
