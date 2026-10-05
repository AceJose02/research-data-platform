"""Research Data Platform backend."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

from .api import bp as api_bp
from .config import Settings
from .errors import APIError
from .store import DatasetStore

log = logging.getLogger(__name__)


def create_app(settings: Optional[Settings] = None) -> Flask:
    settings = settings or Settings()
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = settings.max_upload_bytes
    app.config["RDP_SETTINGS"] = settings
    app.json.sort_keys = False

    app.extensions["rdp_store"] = DatasetStore(
        settings.data_dir,
        cache_size=settings.cache_size,
        ttl_seconds=settings.dataset_ttl_hours * 3600,
    )

    CORS(app, resources={r"/api/*": {"origins": settings.cors_origins}})
    app.register_blueprint(api_bp)
    _register_errors(app, settings)
    _register_frontend(app, settings.static_dir)
    return app


def _register_errors(app: Flask, settings: Settings) -> None:
    @app.errorhandler(APIError)
    def handle_api_error(err: APIError):
        return jsonify(err.to_dict()), err.status

    @app.errorhandler(RequestEntityTooLarge)
    def handle_too_large(_err):
        message = f"The file is larger than the {settings.max_upload_mb} MB upload limit."
        return jsonify(APIError(message, 413, "file_too_large").to_dict()), 413

    @app.errorhandler(HTTPException)
    def handle_http(err: HTTPException):
        if not request.path.startswith("/api/"):
            return err
        code = (err.name or "error").lower().replace(" ", "_")
        return jsonify({"error": {"code": code, "message": err.description}}), err.code

    @app.errorhandler(Exception)
    def handle_unexpected(err: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.path)
        message = "Something went wrong on the server. Check the backend logs for details."
        return jsonify(APIError(message, 500, "server_error").to_dict()), 500


def _register_frontend(app: Flask, static_dir: Path) -> None:
    index = static_dir / "index.html"
    if not index.exists():
        @app.get("/")
        def root():
            return jsonify(
                {
                    "message": "Research Data Platform API is running.",
                    "health": "/api/health",
                }
            )
        return

    log.info("Serving built frontend from %s", static_dir)

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def frontend(path: str):
        if path.startswith("api/"):
            abort(404)
        if path and (static_dir / path).is_file():
            return send_from_directory(static_dir, path)
        return send_from_directory(static_dir, "index.html")
