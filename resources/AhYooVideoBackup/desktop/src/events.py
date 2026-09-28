"""簡單的事件匯流排：Desktop App → Native Host → Extension（由 host 以輪詢取得）。"""
import itertools
import threading

_lock = threading.Lock()
_counter = itertools.count(1)
_events = []
MAX_EVENTS = 500


def emit(payload: dict):
    with _lock:
        event = {"id": next(_counter), "payload": payload}
        _events.append(event)
        if len(_events) > MAX_EVENTS:
            del _events[: len(_events) - MAX_EVENTS]
        return event["id"]


def since(after: int = 0):
    with _lock:
        return [e for e in _events if e["id"] > after]
