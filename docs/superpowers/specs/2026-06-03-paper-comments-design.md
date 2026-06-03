# Paper Comments Design

## Goal

Add a lightweight per-paper comment field so the user can record why a paper was favorited, or why it was marked as unrelated to the research direction.

## Scope

- Each paper has one editable user comment, stored as `userNote`.
- The same comment appears on the paper list card and the paper detail page.
- There is no save button. Editing updates local UI immediately and auto-saves in the background after a short debounce.
- Status and favorite interactions should also feel optimistic: update visible state first, then reconcile with the server response.

## Data Model

Store the comment with `paper_states`, alongside reading status and favorite state. This matches the comment's role as user state rather than paper metadata.

## API

Add `PATCH /api/papers/[id]/note` with body `{ "userNote": string }`. The route trims neither content nor newlines; it only enforces a reasonable length limit and persists the exact text.

## UI

Add a small comment textarea to each homepage paper card and a larger comment block to the detail page. The component shows lightweight save state text such as `未保存`, `保存中`, `已保存`, or `保存失败，继续编辑后会重试`; it does not show a save button.

## Interaction

Use the pattern from `/data/prod/phd-workspace/components/notes/QuickNotesPanel.tsx`: local draft changes are applied immediately, saves are debounced, and sequence numbers prevent stale responses from overwriting newer local edits.

## Testing

- Repository test for persisting and retrieving `userNote`.
- Route test for `PATCH /api/papers/[id]/note`.
- Full test and production build verification before commit.
