CONFIDENT_THRESHOLD = 80
AMBIGUOUS_LOW = 50
MAX_CANDIDATES = 5

_DONE_VERBS = {"done", "finished", "complete", "completed", "did", "checked", "wrapped"}
_RESCHEDULE = {"reschedule", "move", "push", "defer", "delay", "postpone", "later"}
_DROP_VERBS = {"drop", "cancel", "remove", "skip", "delete", "abandon", "ditch"}


def _parse_intent(text: str) -> str:
    raise NotImplementedError  # implemented in 12-02


def resolve_update(text, blocks, tasks) -> dict:
    raise NotImplementedError  # implemented in 12-02
