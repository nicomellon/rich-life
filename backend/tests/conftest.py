import os

# The app reads settings from the environment only, so provide the required ones for tests.
os.environ.setdefault("JWT_SECRET", "test-secret")
