from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

PNG_BYTES = b"\x89PNG\r\n\x1a\nfake-png-bytes"
PNG2_BYTES = b"\x89PNG\r\n\x1a\nreplaced-png-bytes"


def test_upload_group_photo_creates_row():
    r = client.post(
        "/api/v1/group-photos",
        data={"group_key": "goal:1"},
        files={"file": ("p.png", PNG_BYTES, "image/png")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["group_key"] == "goal:1"
    assert "updated_at" in data


def test_upload_group_photo_replaces_existing():
    client.post(
        "/api/v1/group-photos",
        data={"group_key": "parent-list:career"},
        files={"file": ("p.png", PNG_BYTES, "image/png")},
    )
    r = client.post(
        "/api/v1/group-photos",
        data={"group_key": "parent-list:career"},
        files={"file": ("p2.png", PNG2_BYTES, "image/png")},
    )
    assert r.status_code == 200

    list_r = client.get("/api/v1/group-photos")
    keys = [row["group_key"] for row in list_r.json()]
    assert keys.count("parent-list:career") == 1

    img_r = client.get("/api/v1/group-photos/image", params={"key": "parent-list:career"})
    assert img_r.status_code == 200
    assert img_r.content == PNG2_BYTES


def test_list_group_photos_excludes_image_bytes():
    client.post(
        "/api/v1/group-photos",
        data={"group_key": "goal:2"},
        files={"file": ("p.png", PNG_BYTES, "image/png")},
    )
    r = client.get("/api/v1/group-photos")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for row in data:
        assert "group_key" in row
        assert "updated_at" in row
        assert "data" not in row


def test_get_group_photo_image_returns_bytes_and_content_type():
    client.post(
        "/api/v1/group-photos",
        data={"group_key": "goal:3"},
        files={"file": ("p.png", PNG_BYTES, "image/png")},
    )
    r = client.get("/api/v1/group-photos/image", params={"key": "goal:3"})
    assert r.status_code == 200
    assert r.content == PNG_BYTES
    assert r.headers["content-type"] == "image/png"


def test_get_group_photo_image_missing_returns_404():
    r = client.get("/api/v1/group-photos/image", params={"key": "missing-key-does-not-exist"})
    assert r.status_code == 404
