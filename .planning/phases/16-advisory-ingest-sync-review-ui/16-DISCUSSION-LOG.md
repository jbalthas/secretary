# Phase 16: Advisory Ingest + Sync Review UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 16-advisory-ingest-sync-review-ui
**Areas discussed:** Diff review layout, Accept/reject interaction, Page structure & paste flow, Notes + staleness surfacing

> Backend correctness model was presented as **locked** (roadmap Critical
> correctness gates + ADVISE-01..08) and not discussed. All gray areas were
> UI/UX for the Sync Review page.

---

## Gray-area selection

| Option | Selected |
|--------|----------|
| Diff review layout | ✓ |
| Accept/reject interaction | ✓ |
| Page structure & paste flow | ✓ |
| Notes + staleness surfacing | ✓ |

**User's choice:** All four areas.

---

## Diff review layout

### Rationale display
| Option | Description | Selected |
|--------|-------------|----------|
| Always visible under each row | Rationale as sub-text beneath each row, nothing to click | ✓ |
| Expandable per row | Chevron reveals rationale on tap | |
| Tooltip / info icon | Info icon shows rationale on hover/tap | |

**User's choice:** Always visible under each row.

### Grouping
| Option | Description | Selected |
|--------|-------------|----------|
| By entity type | Sections Goals / Milestones / New tasks — mirrors existing DiffGroup | ✓ |
| By goal | All adjustments + new tasks under their parent goal | |
| Flat list | One chronological list, rows labelled by type | |

**User's choice:** By entity type.

---

## Accept/reject interaction

### Default row state
| Option | Description | Selected |
|--------|-------------|----------|
| All accepted (reject to exclude) | Rows start accepted; user unchecks disagreements | ✓ |
| All rejected (opt-in each) | Rows start unchecked; user accepts each | |

**User's choice:** All accepted (reject to exclude).

### Subset wire format
| Option | Description | Selected |
|--------|-------------|----------|
| Client filters payload to accepted rows | Frontend rebuilds AdvisoryPayload with accepted items only; backend stays simple | ✓ |
| Send full payload + per-row accept flags | Backend applies only accepted; adds backend filtering | |

**User's choice:** Client filters payload to accepted rows.
**Notes:** Consequence flagged and accepted — accept/reject is one-shot; re-pasting to apply rejected rows later is a no-op replay (idempotent on advisory_id).

---

## Page structure & paste flow

### Layout
| Option | Description | Selected |
|--------|-------------|----------|
| Linear sections, ingest below export | Single scrolling page; paste section below Phase 15 export sections | ✓ |
| Export / Import tabs | Two tabs | |
| Stepper (1 Export → 2 Paste → 3 Review) | Guided wizard | |

**User's choice:** Linear sections, ingest below export.

### Input mode
| Option | Description | Selected |
|--------|-------------|----------|
| Paste-only | Textarea + Run preview | ✓ |
| Paste + file upload | Mirror Ingest.tsx with Choose file | |

**User's choice:** Paste-only.

### Post-confirm landing
| Option | Description | Selected |
|--------|-------------|----------|
| Stay on Sync with success summary | In-page summary + link to Goals | ✓ |
| Navigate to /goals | Jump to Goals view like Ingest.tsx | |

**User's choice:** Stay on Sync with success summary.

---

## Notes + staleness surfacing

### Notes placement
| Option | Description | Selected |
|--------|-------------|----------|
| Callout card above the diff | Distinct styled card atop the preview | ✓ |
| Card below the diff, above Confirm | Notes as last word before applying | |
| Collapsible notes banner | Banner that can be collapsed | |

**User's choice:** Callout card above the diff.

### Last-sync + staleness warning
| Option | Description | Selected |
|--------|-------------|----------|
| Last-sync in page header; warning inline on preview | Header line always; non-blocking banner on diff after preview | ✓ |
| Both only after paste/preview | Surface both together once previewed | |

**User's choice:** Last-sync in page header; warning inline on preview.

---

## Claude's Discretion

- New diff component visual styling, hook shape (`useAdvisory`), success-summary copy, component extraction — all left to the planner within existing conventions.

## Deferred Ideas

- File-upload for the advisory paste box (paste-only chosen).
- Partial-then-resume advisory apply (idempotency is one-shot per advisory_id).
- Export/Import tabs or guided stepper (single linear page chosen).
- Per-row accept flags / server-side subset filtering (client filtering chosen).
