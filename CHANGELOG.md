# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Intervention library ignoring patient's preferred language**: `list_all_interventions` now resolves the patient document from the URL's `patient_id` and uses their `Patient.preferred_language` as the variant-selection language. Previously the endpoint used only the `?lang` query param (the therapist's UI language), so patients with a non-default content language always received English variants.
- **Patient rehab plan using UI language instead of patient language**: `get_patient_plan` now overrides the UI `?lang` param with `Patient.preferred_language` after resolving the patient, so the best language variant is picked from the patient's profile rather than the therapist's browser language.

### Added
- **`preferred_language` editable via patient profile**: The `user_profile_view` PUT endpoint now accepts `preferred_language` in the patient field whitelist. Valid values are the 10 language codes supported by the model (`en`, `es`, `fr`, `de`, `it`, `nl`, `sv`, `zh`, `ja`, `ko`). Invalid codes return HTTP 400.
- **Intervention language selector in patient profile popup** (`PatientPopup.tsx`): Therapists can now set the patient's content language directly from the patient detail popup without needing a separate admin tool.

### Changed
- Open source governance baseline files at repository root:
  - `CODE_OF_CONDUCT.md`
  - `SECURITY.md`
  - `CONTRIBUTORS.md`
  - `CODEOWNERS`
- Canonical documentation entry points:
  - `docs/TESTING.md`
  - `docs/DEPLOYMENT.md`
  - `docs/CONTRIBUTING_QUICKSTART.md`

### Changed
- Updated contribution and documentation indexes to point to canonical testing and deployment entry points.
- Updated pull request template language for RehaAdvisor and current contribution checks.

## [0.0.0] - 2026-04-24

### Added
- Initial project changelog at repository root.
