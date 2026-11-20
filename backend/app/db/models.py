from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    """Application user. Created via `python -m scripts.users`, there is no sign-up.

    `token_version` is embedded in every JWT; bumping it revokes all issued tokens.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)
    token_version: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Campaign(Base):
    """Keitaro campaign created through the wrapper.

    The tracker is shared with other teams, so the editor only works with campaigns listed here.
    """

    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    keitaro_id: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(255))
    alias: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(512))
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class FlowOffer(Base):
    """Offer of a flow as edited in the wrapper; Keitaro gets the changes only on push.

    `share` is exact (3 offers: 100/3 each); Keitaro gets it rounded down to whole percents.
    `keitaro_share` is the share the offer had in Keitaro at the last sync (None: not in the flow
    there), so a row is out of sync when it differs from `share` or the offer is not active.
    `state`: `active`, `removed` (by the user, kept to restore later) or `deleted` (removed from
    the flow in Keitaro directly).
    """

    __tablename__ = "flow_offers"
    __table_args__ = (UniqueConstraint("stream_id", "offer_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"))
    stream_id: Mapped[int] = mapped_column(Integer, index=True)
    offer_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    position: Mapped[int] = mapped_column(Integer)
    share: Mapped[float] = mapped_column(Float, default=0)
    pinned: Mapped[bool] = mapped_column(default=False)
    state: Mapped[str] = mapped_column(String(16), default="active")
    keitaro_share: Mapped[int | None] = mapped_column(Integer, nullable=True)
    offer_deleted: Mapped[bool] = mapped_column(default=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
