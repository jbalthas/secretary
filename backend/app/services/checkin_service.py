import app.services.pushover as _pushover

CHECKIN_DEEP_LINK = "/today?update=1"


def send_checkin_notification() -> None:
    _pushover.PushoverClient().send(
        title="Mid-day check-in",
        message="How's your day going? Log your progress.",
        url=CHECKIN_DEEP_LINK,
        url_title="Open Today",
    )
