from sqlalchemy.orm import Session

import models


def get_config_labels(db: Session, category: str) -> dict[int, str]:
    """Returns {key: value} for every config row in this category, e.g.
    get_config_labels(db, "invoice") -> {0: 'pending', 1: 'receiving', ...}
    get_config_labels(db, "issue")   -> {1: 'transfer', 55: 'adjust', 99: 'wasted'}

    Fetch this once per request (not per row) and pass the dict around --
    it's a handful of rows, no need to hit the DB per item.
    """
    rows = db.query(models.Config.key, models.Config.value).filter(models.Config.category == category).all()
    return {key: value for key, value in rows}