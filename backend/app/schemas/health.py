from typing import Literal

from pydantic import BaseModel


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    # The deployed build, from APP_VERSION.
    version: str
