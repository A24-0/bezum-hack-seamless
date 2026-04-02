from datetime import date, datetime

from pydantic import BaseModel, model_validator

from app.models.epoch import EpochStatus


class EpochBase(BaseModel):
    name: str
    goals: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: EpochStatus = EpochStatus.planning
    order_index: int = 0


class EpochCreate(EpochBase):
    @model_validator(mode="after")
    def dates_order(self) -> "EpochCreate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Дата окончания не может быть раньше даты начала")
        return self


class EpochUpdate(BaseModel):
    name: str | None = None
    goals: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: EpochStatus | None = None
    order_index: int | None = None


class EpochRead(EpochBase):
    id: int
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class EpochProgress(BaseModel):
    epoch_id: int
    total_tasks: int
    done_tasks: int
    progress_percent: float
    status_breakdown: dict[str, int]
