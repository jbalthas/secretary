# Quick Task: Hierarchical umbrella lists

## Goal

Add a two-level list hierarchy so broad areas such as `Career` can contain
sub-lists such as `Optics` and `Robotics`, without breaking existing flat list
assignments.

## Plan

1. Add nullable `parent_list_name` fields to tasks and goals with a migration.
2. Expose hierarchy metadata and parent-aware filtering through the API.
3. Carry the hierarchy through ingest, task/goal schemas, and frontend types.
4. Update task and goal editors to select an umbrella and optional sub-list.
5. Render compact hierarchical filters on Tasks, grouped goals on Goals, and
   hierarchy-aware sorting/prioritization on Organize.
6. Add backend/frontend regression tests and run the focused suites and build.

## Compatibility

Existing `list_name` values remain valid standalone lists. No data rewrite is
required. A list becomes a sub-list only when `parent_list_name` is set.
