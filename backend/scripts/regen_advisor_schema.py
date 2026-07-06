"""Prints AdvisoryPayload.model_json_schema() as pretty JSON for embedding into
frontend/src/lib/advisorPrompt.ts. Run this and re-embed the output whenever
AdvisoryPayload changes (see PROMPT-01).

Usage: cd backend && python scripts/regen_advisor_schema.py
"""

import json

from app.schemas.advisory import AdvisoryPayload

if __name__ == "__main__":
    print(json.dumps(AdvisoryPayload.model_json_schema(), indent=2))
