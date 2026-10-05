"""Error type used across the API, rendered as consistent JSON responses."""

from __future__ import annotations


class APIError(Exception):
    """An error with an HTTP status and a message that is safe to show to users."""

    def __init__(self, message: str, status: int = 400, code: str = "bad_request"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code

    def to_dict(self) -> dict:
        return {"error": {"code": self.code, "message": self.message}}


def not_found(message: str = "Not found.") -> APIError:
    return APIError(message, status=404, code="not_found")


def unprocessable(message: str) -> APIError:
    return APIError(message, status=422, code="unreadable_file")
