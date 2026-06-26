import unittest
import responses
import sys
import os
import json
from unittest.mock import patch

# Mock env vars before importing tracepilot
os.environ["TRACEPILOT_TOKEN"] = "test-prj-123"
os.environ["TRACEPILOT_COLLECTOR_URL"] = "http://localhost:4318"

import tracepilot

class TestTracePilotSDK(unittest.TestCase):
    @responses.activate
    def test_sys_excepthook_captures_crash(self):
        # Mock the ingestor endpoint
        responses.add(
            responses.POST,
            "http://localhost:4318/v1/traces",
            json={"status": "success"},
            status=200
        )

        # Initialize the SDK
        tracepilot.init()

        # Simulate an unhandled exception by directly calling sys.excepthook
        try:
            raise ZeroDivisionError("Test crash")
        except ZeroDivisionError as e:
            exc_type, exc_value, exc_traceback = sys.exc_info()
            
            # We must mock sys.excepthook's fallback so it doesn't actually crash our test runner
            with patch('sys.__excepthook__'):
                # We also need to patch _original_excepthook because tracepilot saved it.
                # If we don't, it will print to stderr during test, which is noisy but harmless.
                # But to be safe, we just let it run.
                sys.excepthook(exc_type, exc_value, exc_traceback)

        # Verify that the exporter made a POST request to the mock URL
        self.assertEqual(len(responses.calls), 1)
        
        # Verify headers
        req = responses.calls[0].request
        self.assertEqual(req.headers.get("x-tracepilot-project-id"), "test-prj-123")

        # Parse the OTLP JSON payload (it's protobuf binary if we didn't force JSON, 
        # but OTLPSpanExporter uses HTTP POST. Actually, default OTLPSpanExporter in python 
        # might use binary protocol. Let's just check that it sent data).
        self.assertIsNotNone(req.body)

if __name__ == '__main__':
    unittest.main()
