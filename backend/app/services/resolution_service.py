from rapidfuzz import process, fuzz

CONFIDENT_THRESHOLD = 80
AMBIGUOUS_LOW = 50
MAX_CANDIDATES = 5

_DONE_VERBS = {"done", "finished", "complete", "completed", "did", "checked", "wrapped"}
_RESCHEDULE = {"reschedule", "move", "push", "defer", "delay", "postpone", "later"}
_DROP_VERBS = {"drop", "cancel", "remove", "skip", "delete", "abandon", "ditch"}

_INTENT_WORDS = _DONE_VERBS | _RESCHEDULE | _DROP_VERBS
_STOP_WORDS = _INTENT_WORDS | {"i", "a", "the", "my", "with", "on", "for", "at", "to", "an"}


def _parse_intent(text: str) -> str:
    tokens = set(text.lower().split())
    if tokens & _DROP_VERBS:
        return "drop"
    if tokens & _RESCHEDULE:
        return "reschedule"
    return "done"


def _entity_query(text: str) -> str:
    """Strip intent/stop words so the remainder targets the entity name."""
    tokens = text.lower().split()
    stripped = [t for t in tokens if t not in _STOP_WORDS]
    return " ".join(stripped) if stripped else text.lower()


def resolve_update(text, blocks, tasks) -> dict:
    candidates = []
    for b in blocks:
        candidates.append((b.title, "block", b.id))
    for t in tasks:
        candidates.append((t.title, "task", t.id))
    if not candidates:
        return {"status": "no_match", "candidates": []}

    titles = [c[0] for c in candidates]
    query = _entity_query(text)
    matches = process.extract(
        query,
        titles,
        scorer=fuzz.WRatio,
        limit=MAX_CANDIDATES,
        processor=lambda s: s.lower(),
    )  # list of (title, score, index)
    best_score = matches[0][1] if matches else 0

    # Confident single match — only resolve when one candidate stands out
    confident_count = sum(1 for m in matches if m[1] >= CONFIDENT_THRESHOLD)
    if best_score >= CONFIDENT_THRESHOLD and confident_count == 1:
        _, etype, eid = candidates[matches[0][2]]
        return {
            "status": "resolved",
            "action": _parse_intent(text),
            "entity_type": etype,
            "entity_id": eid,
            "entity_title": candidates[matches[0][2]][0],
            "score": best_score,
        }
    if best_score >= AMBIGUOUS_LOW:
        return {
            "status": "ambiguous",
            "candidates": [
                {
                    "title": candidates[m[2]][0],
                    "entity_type": candidates[m[2]][1],
                    "entity_id": candidates[m[2]][2],
                    "score": m[1],
                }
                for m in matches
            ],
        }
    return {"status": "no_match", "candidates": []}
