"""Boat provider (optional). Thin wrapper mirroring open-dots
box_operations.ASCIIBoxService so dots.sandboxes.provider() can use it
when boat_sdk + BOAT_API_KEY are present. Never imported by default.
"""
from .config import settings


class BoatBoxes:
    def __init__(self):
        from boat_sdk import ApiClient, Configuration, wait_until_ready  # optional dep
        from boat_sdk.api.boat_api import BoatApi
        self._client = ApiClient
        self._conf = Configuration(host=settings.BOAT_BASE_URL, access_token=settings.BOAT_API_KEY)
        self._api = BoatApi
        self._wait = wait_until_ready

    def _api_client(self):
        return self._api(self._client(self._conf))

    def create_box(self, ttl_seconds: int = 1800):
        from boat_sdk.models.create_sandbox_request import CreateSandboxRequest
        api = self._api_client()
        created = api.create(create_sandbox_request=CreateSandboxRequest(
            ttl_seconds=ttl_seconds, no_env=True, org=settings.BOAT_ORG_ID or None))
        box = self._wait(api, created.sandbox.id)
        return {"id": box.id, "state": box.state, "type": box.type, "ttl_seconds": ttl_seconds}

    def get_box(self, box_id: str):
        box = self._api_client().get(box_id).sandbox
        return {"id": box.id, "state": box.state, "type": box.type}

    def stop_box(self, box_id: str) -> None:
        from boat_sdk.models.stop_request import StopRequest
        self._api_client().stop(box_id, StopRequest())

    def resume_box(self, box_id: str):
        from boat_sdk.models.resume_request import ResumeRequest
        self._api_client().resume(box_id, ResumeRequest(no_env=True))
        return self.get_box(box_id)

    def delete_box(self, box_id: str) -> None:
        self._api_client().delete(box_id)

    def run_command(self, box_id: str, command: str, timeout: int = 600) -> dict:
        from boat_sdk.models.command_request import CommandRequest
        out = self._api_client().run_command(box_id, CommandRequest(command=command))
        return {"stdout": getattr(out, "stdout", ""), "stderr": getattr(out, "stderr", ""), "returncode": 0}

    def write_file(self, box_id: str, path: str, content: str) -> None:
        from boat_sdk.models.file_write_request import FileWriteRequest
        self._api_client().write_file(box_id, FileWriteRequest(path=path, content=content))

    def read_file(self, box_id: str, path: str) -> str | None:
        try:
            return self._api_client().read_file(box_id, path).content
        except Exception:
            return None
