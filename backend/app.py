"""Entry point: `python app.py` starts the API on http://127.0.0.1:5000.

Configuration comes from environment variables (see .env.example).
For production, run behind a WSGI server instead, e.g.:

    gunicorn "app:app" --bind 0.0.0.0:5000 --workers 1 --threads 8

Use a single worker: parsed datasets are cached in process memory.
"""

import logging
import os

from rdp import create_app
from rdp.config import Settings

logging.basicConfig(
    level=os.environ.get("RDP_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

settings = Settings()
app = create_app(settings)

if __name__ == "__main__":
    app.run(host=settings.host, port=settings.port, debug=settings.debug)
