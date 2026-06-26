import os
import tracepilot

def test_silent_noop_without_token(monkeypatch):
    monkeypatch.delenv('TRACEPILOT_TOKEN', raising=False)
    result = tracepilot.init()
    assert result is None  # must return silently, not raise
