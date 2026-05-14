---
name: project-reddit-monitor
description: "Hourly Reddit mention monitor — polls subreddits, dedupes, emails digest — for tuning subs/keywords or debugging missed mentions"
metadata: 
  node_type: memory
  type: project
  originSessionId: 24e865aa-84a0-4ad8-bc10-c303dfd9eff4
---

Hourly Reddit mention monitor shipped 2026-05-12. Not an auto-poster — surfaces threads to Miles's inbox for him to reply personally.

**Why:** Miles asked about a bot that auto-inserts Fabricate into 3D-printing threads. Pushed back hard (Reddit ToS, community backlash, deceptive). He accepted "monitor, not bot" framing. See [[feedback-no-automated-promotion]].

**How to apply:** When Miles wants to tune what gets flagged, debug missed mentions, or expand coverage:

- Config lives at `src/lib/reddit/config.ts` — `MONITORED_SUBREDDITS`, `INCLUDE_KEYWORDS`, `EXCLUDE_KEYWORDS`. Edit + push, no infra changes needed.
- Auth: defaults to **public JSON** (`reddit.com/r/<sub>/new.json`) — no Reddit app needed. OAuth env vars (`REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD`) are optional, only flip on if 429s appear in sweep response.
- Schedule: hourly on the hour, Cloud Scheduler `reddit-monitor-sweep` in europe-west2.
- Endpoint: `POST /api/reddit-monitor/sweep` with `Authorization: Bearer $REDDIT_MONITOR_SECRET`.
- Dedup: `RedditMention` table, unique on `redditId` (e.g. `t3_xxxxx`/`t1_xxxxx`). Re-runs are idempotent.
- Digest: emails to `REDDIT_MONITOR_ALERT_EMAIL` (set to `miles.broomfield123@gmail.com` in deploy.yml). Silent when no fresh matches.

User-Agent requirement: `REDDIT_USER_AGENT` in deploy.yml. Reddit rate-limits hard on generic UAs.

Related: [[project-affiliate-program]], [[reference-cloud-scheduler-jobs]].
