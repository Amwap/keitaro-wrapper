from fastapi import APIRouter, status

from app.api.deps import CurrentUser, Keitaro, KeitaroPanel
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


@router.delete("/groups/{group_id}")
def delete_group(
    group_id: int, user: CurrentUser, client: Keitaro, panel: KeitaroPanel
) -> GroupsInfo:
    """Deletes a group of the user's own, unless campaigns are in it (via the admin panel)."""
    return campaigns.delete_group(client, panel, user, group_id)
