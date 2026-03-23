---
id: 01JBQG0A1B
title: Tech stack decision
type: thought
project: municipality-platform
twin_synced: true
linked_delivery: 01JBQF9M3P
created: 2026-03-17
updated: 2026-03-17
---

We're choosing between Polars + DuckDB vs Spark for the pipeline layer.
The client has on-prem H100s so inference cost isn't the concern.

Main tension: team familiarity (Spark) vs performance + simplicity (Polars).
Leaning toward Polars — fast, clean API, junior devs up to speed in a sprint.

Blocker: Thomas hasn't sent the infra cost estimate. Architecture diagram on hold.
Decision needed by Friday EOD.
