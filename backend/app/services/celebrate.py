from app.services.pushover import PushoverClient
from app.services.tts import TTSClient
import app.services.tts_settings as _tts_settings


def fire_milestone_celebration(milestone_title: str, goal_title: str) -> None:
    msg = f'Nice work — you completed "{milestone_title}" on your {goal_title} goal.'
    PushoverClient().send(title="Milestone complete", message=msg)
    if _tts_settings.get_tts_enabled():
        TTSClient().speak(msg)


def fire_goal_celebration(goal_title: str) -> None:
    msg = f"Congratulations! You reached your goal: {goal_title}."
    PushoverClient().send(title="Goal achieved", message=msg)
    if _tts_settings.get_tts_enabled():
        TTSClient().speak(msg)
