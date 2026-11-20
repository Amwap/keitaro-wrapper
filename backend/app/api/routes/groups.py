from fastapi import APIRouter, status

from app.api.deps import CurrentUser, Keitaro
from app.schemas.campaigns import GroupCreate, GroupsInfo
from app.services import campaigns

router = APIRouter(tags=["groups"])


@router.get("/groups")
def list_groups(user: CurrentUser, client: Keitaro) -> GroupsInfo:
    """Campaign groups open to the user: the default group and the user's own ones."""
    return campaigns.groups_info(client, user)


@router.post("/groups", status_code=status.HTTP_201_CREATED)
def create_group(data: GroupCreate, user: CurrentUser, client: Keitaro) -> GroupsInfo:
    """Creates a campaign group; Keitaro gets the name with the `test_{username}_` prefix."""
    return campaigns.create_group(client, user, data)
