import os
import sys
from tracepilot import init

def main():
    """
    Zero-config entry point.
    Usage: tracepilot python app.py
    """
    if len(sys.argv) < 2:
        print("Usage: tracepilot python app.py")
        print("Or:    tracepilot uvicorn main:app")
        sys.exit(1)

    # Initialize TracePilot instrumentation globally
    init()

    # Execute the target application
    # sys.argv[1] is the command (e.g., 'python', 'uvicorn', 'gunicorn')
    # os.execvp replaces the current process with the target process
    os.execvp(sys.argv[1], sys.argv[1:])

if __name__ == "__main__":
    main()
