# Form Experiments — A/B testing infrastructure

This file documents the experiment infrastructure baked into `src/components/ContactForm.astro` so future changes can run real A/B tests cheaply.

## Current state

**Active experiment:** none.
- All visitors see the inline form on service pages.
- All visitors report `experiment_arm: "inline-only"` in analytics.
- The bucketing function still runs and assigns A/B buckets to localStorage, but the bucket value is overridden to "inline-only" until `EXPERIMENT_ACTIVE = true`.

## What's tracked

Every form interaction emits these GA4 events with the same metadata:

| Event | When | Properties |
|---|---|---|
| `form_start` | First focus into any form field (once per page load) | `form_variant`, `experiment_arm`, `event_label` |
| `form_complete` | Successful form submission | `form_variant`, `experiment_arm`, `event_label` |
| `Contact_Us_Form_Entry` | Successful form submission (legacy event, kept for continuity) | `form_variant`, `experiment_arm`, `event_label` |
| `generate_lead` | Successful form submission (GA4 enhanced ecommerce) | `form_variant`, `experiment_arm`, `value: 0` |

`form_variant` values:
- `inline` — compact form rendered inside service-page hero
- `standard` — full form on `/contact` standalone page
- (future) `inline-short` — reduced-field variant when we ship one

`experiment_arm` values:
- `inline-only` — current default while no experiment is active
- `A` / `B` — assigned 50/50 once `EXPERIMENT_ACTIVE` is flipped to true

## How to run a real A/B test

1. Build the new variant (e.g. `<ContactFormShort>` with reduced fields).
2. In `src/components/ContactForm.astro`, flip `EXPERIMENT_ACTIVE = true` and bump `EXPERIMENT_NAME` (so existing visitors get re-bucketed and fresh data is collected).
3. In `src/layouts/ServiceLayout.astro` (or wherever the form is rendered), use a snippet like:
   ```astro
   <script is:inline>
     const arm = localStorage.getItem('gb_exp_<NEW_NAME>');
     // arm is 'A' or 'B' — render appropriate variant
   </script>
   ```
   Or, simpler: render both variants in the DOM, hide one based on the bucket value via CSS.
4. Wait for traffic to accumulate. At ~22 leads/month, expect 4-8 weeks for a directional read.
5. In GA4, build a comparison report keyed on `experiment_arm` to compare conversion rates.

## How to read results

In GA4 Explore:
- Dimension: `experiment_arm`
- Metrics: `form_start` count, `form_complete` count, abandonment rate (`1 - complete/start`)
- Segment by source (Google Ads vs organic) so paid lifts aren't masked by organic noise

Decision threshold (informal, given low traffic):
- ≥30% relative lift on `form_complete`/session → ship the winner
- 10-30% lift → keep running for another 2 weeks
- <10% or no clear winner → flip `EXPERIMENT_ACTIVE = false`, design a different test

## Bucket persistence

- Stored in `localStorage` under `gb_exp_<EXPERIMENT_NAME>`
- Stable per visitor for the duration of the experiment
- Bumping `EXPERIMENT_NAME` reshuffles everyone (use when starting a new test)
- Cleared if user clears site data (we don't try to track across that — fine for our purposes)

## Notes

- Server-side form storage already includes `form_variant` and `experiment_arm` columns thanks to the Cloudflare Worker accepting these fields. Leads in Mission Control can be filtered by them for downstream conversion analysis (lead → quote → won).
- Don't run two simultaneous experiments — bucket assignment is single-dimension. If you need to test two things, sequence them.
