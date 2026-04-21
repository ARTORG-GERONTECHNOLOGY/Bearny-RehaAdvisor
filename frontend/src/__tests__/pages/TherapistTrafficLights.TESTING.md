# Therapist Traffic Lights — Test Documentation

This note documents the traffic-light behavior covered in
[`Therapist.test.tsx`](./Therapist.test.tsx), especially the Feedback chip logic.

## Feedback chip source and rules

The therapist patient-list Feedback chip now prefers `intervention_feedback` from
`GET /api/therapists/<therapist_id>/patients/`.

Inputs used by the chip:

- `last_answered_at` / `days_since_last`
- `recent_avg_score` (last answered-day window)
- `trend_lower` / `trend_delta`

Current level mapping:

| Condition                                    | Level                                         |
| -------------------------------------------- | --------------------------------------------- |
| `days_since_last > 7`                        | `bad`                                         |
| `days_since_last > 3`                        | `warn`                                        |
| `recent_avg_score <= 2`                      | `bad`                                         |
| `recent_avg_score < 3` (and not already bad) | `warn`                                        |
| `trend_lower = true`                         | degrade one level (`good->warn`, `warn->bad`) |

When no scored intervention feedback is present, the chip falls back to
`last_feedback_at` recency behavior.

## Related tests in `Therapist.test.tsx`

| Test                                                                   | What is validated                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `uses intervention feedback recency + average score for feedback chip` | Good chip and tooltip content for recent, high average feedback |
| `marks feedback as bad when intervention trend is lower`               | Trend-down signal can push feedback level to bad                |
| `uses last_feedback_at when questionnaires list is empty`              | Fallback recency path remains functional                        |

## Other traffic-light updates covered

| Test                                                       | What is validated                                    |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `hides Health badge for ongoing studies (active patients)` | Health chip is not shown for active/ongoing patients |
