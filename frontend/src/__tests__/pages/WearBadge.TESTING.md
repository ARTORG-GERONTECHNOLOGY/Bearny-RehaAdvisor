# Wear Time Badge — Test Documentation

The wear-time chip appears in the therapist patient list
(`src/pages/Therapist.tsx`) and is tested inside
[`Therapist.test.tsx`](Therapist.test.tsx) under the `describe('Wear time badge')` block.

---

## Feature description

When a patient's Fitbit device has recorded wear data (via `biomarker.wear_time_avg_min`
and `biomarker.wear_time_days_since` from the patient-list API), the Therapist
page renders a colour-coded **Wear** chip alongside the Login / Adherence /
Health / Feedback chips.

### Badge logic

| Condition                                                     | Colour             | `aria-label` |
| ------------------------------------------------------------- | ------------------ | ------------ |
| `wear_time_days_since >= 2`                                   | 🔴 Red (`bad`)     | `Wear bad`   |
| `wear_time_avg_min < 720` (< 12 h/day)                        | 🟡 Yellow (`warn`) | `Wear warn`  |
| Otherwise                                                     | 🟢 Green (`good`)  | `Wear good`  |
| `wear_time_days_since === null && wear_time_avg_min === null` | Hidden             | —            |

The badge tooltip shows the human-readable summary, e.g. `Last worn: today • Avg wear: 12.5h (7d)`.

---

## Tests

| Test                                                       | Biomarker input             | Expected badge                   |
| ---------------------------------------------------------- | --------------------------- | -------------------------------- |
| `shows green Wear badge when worn recently and avg >= 12h` | `days_since=0, avg=750 min` | `aria-label="Wear good"` present |
| `shows yellow Wear badge when avg wear < 12h per day`      | `days_since=0, avg=480 min` | `aria-label="Wear warn"` present |
| `shows red Wear badge when not worn for 2+ days`           | `days_since=3, avg=700 min` | `aria-label="Wear bad"` present  |
| `hides Wear badge when no Fitbit data`                     | `days_since=null, avg=null` | No element matching `/Wear/i`    |

---

## Running

```bash
docker exec react sh -c "cd /app && npx jest src/__tests__/pages/Therapist.test.tsx --coverage=false"
```
