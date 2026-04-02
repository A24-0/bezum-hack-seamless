"""Проверка дат/времени для встреч: только в пределах окна от сегодня (UTC) до +N лет."""

from datetime import date, datetime, time, timezone

MEETING_SCHEDULE_WINDOW_YEARS = 5


def normalize_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # 29 февраля → 28 февраля
        return d.replace(year=d.year + years, month=2, day=28)


def assert_reasonable_meeting_datetime(dt: datetime) -> datetime:
    """Дата встречи в UTC: не раньше начала сегодняшнего дня UTC и не позже конца дня через N лет."""
    utc = normalize_utc(dt)
    now = datetime.now(timezone.utc)
    min_allowed = now.replace(hour=0, minute=0, second=0, microsecond=0)

    last_calendar_day = _add_years(min_allowed.date(), MEETING_SCHEDULE_WINDOW_YEARS)
    max_allowed = datetime.combine(
        last_calendar_day,
        time(23, 59, 59, 999999),
        tzinfo=timezone.utc,
    )

    if utc < min_allowed or utc > max_allowed:
        raise ValueError(
            f"Дата встречи должна быть в пределах {MEETING_SCHEDULE_WINDOW_YEARS} лет "
            f"от сегодняшнего дня (UTC), не раньше {min_allowed.date()} и не позже {last_calendar_day}"
        )
    return utc
