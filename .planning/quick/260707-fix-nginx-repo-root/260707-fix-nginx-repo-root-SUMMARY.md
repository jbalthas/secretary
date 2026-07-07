---
phase: quick-260707-fix-nginx-repo-root
status: complete
completed: 2026-07-07
---

# Fix nginx repository root

Replaced the hard-coded `/home/pi/my-secretary` nginx root with a `__REPO_DIR__` template value. `setup-services.sh` now substitutes the absolute path of the repository from which it is running, preventing nginx from serving an older clone under another user's home directory.

## Verification

- `git diff --check` passed.
- Configuration and setup-script substitutions were inspected together.
- Live diagnosis confirmed the current mismatch: build output under `/home/jb223/secretary` while nginx served `/home/pi/my-secretary`.
