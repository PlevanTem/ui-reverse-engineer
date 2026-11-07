"""Fail closed unless a Harbor agent declares the capabilities Restore requires."""
import argparse
import json

from harbor.agents.factory import AgentFactory
from harbor.models.trial.config import AgentConfig


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("agent")
    args = parser.parse_args()
    agent_class = AgentFactory.get_agent_class_from_config(AgentConfig(name=args.agent))
    capabilities = agent_class.capabilities.model_dump(mode="json")
    required = {"atif": True, "resume": True, "skills": True}
    missing = [name for name, expected in required.items() if capabilities.get(name) is not expected]
    result = {"status": "blocked" if missing else "passed", "agent": agent_class.name(), "required": required, "capabilities": capabilities, "missing": missing}
    print(json.dumps(result, ensure_ascii=False))
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
