# First Contribution Quickstart

This guide is for first-time contributors who want a safe and fast path to a useful pull request.

## 1) Pick A First Issue

Look for issues with one of these labels:

- `good first issue`: low-risk, well-scoped starter tasks
- `documentation`: wording, links, examples, onboarding improvements
- `tests`: missing tests, flaky tests, or test-only improvements

If labels are missing, comment on an issue and ask if it is suitable for a first contribution.

## 2) Make A Small, Reviewable Change

Keep your first PR focused:

- one bug, one documentation improvement, or one test gap
- avoid large refactors in your first contribution
- include a short "How I tested" section in the PR

## 3) Run Only Relevant Tests

For backend-only changes:

```bash
cd backend
pytest path/to/relevant_test.py -vv
```

For frontend-only changes:

```bash
cd frontend
npm test -- path/to/relevant.test.tsx
```

For cross-cutting changes:

```bash
make dev_test
```

## 4) Open A Pull Request

Use `.github/pull_request_template.md` and include:

- what changed
- why it changed
- how it was tested
- linked issue (if available)

## 5) What To Expect During Review

- Maintainers aim to provide an initial response within 5 business days.
- Small and focused PRs are reviewed faster.
- If requested changes are unclear, ask directly in the PR thread.

## Community And Help

- Primary support: GitHub Issues and PR comments
- If repository Discussions are enabled, use them for open-ended questions
- Security issues: follow `SECURITY.md` (private disclosure)

## Next Step After First PR

After your first merged contribution, consider helping with:

- triaging issues
- improving docs and tests
- reviewing other beginner-friendly PRs
