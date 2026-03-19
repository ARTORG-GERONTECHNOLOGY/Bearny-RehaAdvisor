# Health Components — Test Documentation

Tests for Fitbit health visualisation components in
`src/components/Health/`.

---

## SleepChart  ([`SleepChart.test.tsx`](SleepChart.test.tsx))

Tests `src/components/Health/charts/SleepChart.tsx`.

### Why two sleep values?

The Fitbit API distinguishes between **time in bed** (`sleep_duration` in
milliseconds) and **actual sleep** (`minutes_asleep` in minutes).  The Fitbit
mobile app shows `minutes_asleep`; the platform previously showed
`sleep_duration / 3600000` which was always higher.  `SleepChart` now renders
both:

| Line | Colour | Source field | Meaning |
|---|---|---|---|
| Orange solid | `#ff7f0e` | `sleep.sleep_duration / 3600000` | Total time in bed (h) |
| Green dashed | `#2ca02c` | `sleep.minutes_asleep / 60` | Actual sleep (h) — matches Fitbit app |

The purple bars still show the sleep window (`sleep_start` → `sleep_end`).

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `renders without crashing with empty data` | `data = []` | SVG element rendered, no error |
| `renders when data has both duration and minutes_asleep` | Two entries with `sleep_duration` + `minutes_asleep` | SVG renders; both fields consumed |
| `renders when only sleep_duration is available` | No `minutes_asleep` | Renders without crashing |
| `renders when only minutes_asleep is present` | No `sleep_duration` | Renders without crashing |
| `renders with start/end date range filter` | `start`/`end` props filter to one entry | SVG rendered without error |

### Mocking strategy

`d3` is an ESM-only package that Jest cannot parse. The test file provides a
complete `jest.mock('d3', ...)` stub that replaces every used d3 function with a
no-op chain that still returns the expected shape (scales, axes, line
generators).

---

## Running

```bash
# From repo root
docker exec react sh -c "cd /app && npx jest src/__tests__/components/Health/ --coverage=false"
```
