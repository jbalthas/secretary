---
phase: quick-260707-fix-nginx-repo-root
plan: 01
type: execute
files_modified:
  - deploy/nginx-secretary.conf
  - deploy/setup-services.sh
autonomous: true
---

<objective>
Make nginx serve the frontend build from the repository that ran setup instead of a hard-coded `/home/pi/my-secretary` clone.
</objective>

<task type="auto">
  <name>Template the repository root</name>
  <action>Replace the hard-coded nginx root with `__REPO_DIR__` and substitute it alongside the Tailscale hostname in setup-services.sh.</action>
  <verify>Confirm the generated configuration resolves to the invoking repository's frontend/dist directory.</verify>
</task>

<success_criteria>
- setup-services.sh installs an nginx root matching its own repository directory.
- Deployments work for non-`pi` usernames such as `jb223`.
</success_criteria>
