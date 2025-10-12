# Contributing

Guidelines to contribute to Topogram.

1) Workflow

- Fork or branch from `main`.
- Create a short-lived feature branch: `feature/xyz` or `fix/issue-123`.
- Make small commits with clear messages and push your branch to origin.
- Open a Pull Request to `main` and request at least one reviewer.

2) PR checks

- Ensure unit tests pass and linters run cleanly.
- If your change touches data schemas or indexes, document migration steps in `MIGRATION.md`.

3) Branch protection (recommended)

- Use GitHub branch protection rules for `main` to require PR reviews and CI passing before merge. See `docs/README.md` for links and recommendations.

4) Local pre-push hook (optional)

To help prevent accidental pushes to `main`, you can install the provided pre-push hook locally.

Save the script `scripts/hooks/pre-push` into your `.git/hooks/pre-push` and make it executable (see the script below).

Script content (also available at `scripts/hooks/pre-push`):

```bash
#!/bin/sh
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo "Direct pushes to '$branch' are disabled. Please open a pull request instead."
  exit 1
fi
exit 0
```

Note: Git hooks are local convenience only. Enforce rules remotely with branch protection on GitHub.
