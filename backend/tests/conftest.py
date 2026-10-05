import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rdp import create_app  # noqa: E402
from rdp.config import Settings  # noqa: E402


@pytest.fixture()
def settings(tmp_path):
    s = Settings()
    s.data_dir = tmp_path / "data"
    s.static_dir = tmp_path / "no-frontend"
    s.max_upload_mb = 5
    return s


@pytest.fixture()
def app(settings):
    app = create_app(settings)
    app.config.update(TESTING=True)
    return app


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def upload(client):
    def _upload(content, filename="data.csv", **form):
        if isinstance(content, str):
            content = content.encode("utf-8")
        data = {"file": (io.BytesIO(content), filename), **form}
        return client.post("/api/datasets", data=data, content_type="multipart/form-data")

    return _upload


@pytest.fixture()
def sample_csv(client):
    res = client.post("/api/samples/wellbeing-survey")
    assert res.status_code == 201, res.get_json()
    return res.get_json()
