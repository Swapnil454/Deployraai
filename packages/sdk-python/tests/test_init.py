import os
import tracepilot

def test_silent_noop_without_token(monkeypatch):
    monkeypatch.delenv('TRACEPILOT_TOKEN', raising=False)
    result = tracepilot.init()
    assert result is not None  # must return a proxy tracer silently, not raise
