## Intraday Market Data (first-time setup)

The intraday bar store (15min/30min/60min, MySQL `price_bars`) must be seeded once;
after that the `market.intraday_cycle` beat task keeps it fresh and retention pruning
runs nightly. Order matters: migration → backfill → restart worker+beat.

```bash
docker compose exec backend python migrations/13_create_price_bars.py
docker compose exec backend python scripts/market_backfill.py
docker compose restart celery_worker celery_beat
```

The backfill prints per-ticker/per-frequency coverage; Tiingo's intraday lookback is
limited, so coverage accumulates forward from the backfill date toward the retention
targets (15min 3mo, 30min 6mo, 60min 1y). Verify from inside the backend container:

```bash
docker compose exec backend python -c "from services.market.market_data_service import get_coverage; import json; print(json.dumps(get_coverage(), indent=2, default=str))"
```

GDELT news updates every 15 minutes into the MySQL hot tier (`news.gdelt_catchup`);
the 06:00 UTC task reconciles each finalized day and the 06:30 flush archives it as
per-day parquet to S3 (prod only, `GDELT_S3_FLUSH=1`). Dev machines pull history
from S3 instead of crawling tiles:

```bash
docker compose exec backend python scripts/gdelt_sync.py
```

Historical backfill (server-side, resumable, skips days already archived; keep
`--end` at or before yesterday — the live pipeline owns the current day):

```bash
docker compose exec backend python scripts/gdelt_backfill.py --start 2025-01-01 --end 2025-12-31 --publish
```
