# Participant Lists and Event Membership

## Data model

Migration `0002_participant_lists.sql` adds:

- `participant`: a person/profile, optionally and explicitly linked one-to-one
  to an authentication `user` through `user_id`.
- `participant_list`: an administrator-owned reusable named group.
- `participant_list_member`: the many-to-many relationship between reusable
  lists and participants.
- `event_participant`: an event-specific snapshot of name, phone, address,
  optional participant ID, and optional authentication user ID.

Authentication accounts and participant profiles remain distinct. Accounts
are offered only in Event Builder's **Registered Users** group; they do not
appear in Add Participant or reusable-list management. Deleting a reusable
list never deletes participants. Deleting or changing a participant does not
rewrite an existing event snapshot.

## Roles and routes

Anonymous and registered users are rejected from all participant, list, and
administrative event-participant APIs. Event create, edit, and archive
mutations require an administrator.

The Worker guards the Dashboard, participant manager, administrative milk
view, Event Builder, and event archive pages before static assets are served.
Registered users can open User View at `/adminuser.html`.

User View calls `GET /api/user/events`, which derives identity exclusively
from the signed-in session. It does not accept a browser-supplied user ID.

## List expansion and snapshots

Event Builder starts in the traditional self-registration mode. Administrators
must select **This event will use an administrator-managed external participant
list** to reveal assignment controls. In that mode, new self-registration is
disabled and attendance is managed through the saved event snapshot. Turning
the mode off while editing clears assigned participant snapshots and returns
the event to self-registration.

The Event Builder uses one wide Event Details surface containing the core
details, Description, and Event Image fields. Participation remains a separate
wide surface. Its external-participant control uses a high-visibility checkbox
on the right side of the description and expands the assignment fieldset below.

The Event Builder accepts reusable-list IDs, individual participant IDs, and
ad-hoc participant details. It also offers authentication accounts in a
separate Registered Users group. The server validates list and participant IDs
and deduplicates selected people by stable participant or account ID. A list is
a source of available participants; selecting it does not automatically assign
all of its members to the event.
Event Builder provides a standard reusable-list dropdown. Choosing a list adds
it to the event; the administrator can use the dropdown repeatedly to add
multiple lists and remove list sources individually. A compact scrollable
picker shows the unique combined members of the selected lists. Every member
has an individual checkbox, and a **Select all participants** checkbox selects
or clears all currently displayed unique members. New list selections start
with no automatic assignments. Only explicitly checked participant IDs are
copied into the event snapshot. Source-list selections are stored so they can
be restored while editing. Registered Users is a special dropdown choice; its
account picker is hidden unless that choice is added.

Event Builder presents two visible checkbox-controlled optional panels beneath
the reusable-list selection:

- **Add new reusable participants** expands an inline participant-directory
  form and the individual participant picker. A participant created there is
  saved for future reusable lists, refreshed into the picker, and selected for
  the current event.
- **Add ad-hoc participants** expands event-only name, phone, and address rows.
  These people are stored only in the event snapshot and are not added to the
  reusable participant directory.

Checkboxes for optional panels, individual participants, and Registered Users
are aligned to the right of their descriptions. Name and phone/email remain
grouped on the left for quick scanning.

The former participant-management link and the generic “participants outside
the selected lists” disclosure are not shown in Event Builder. Existing direct
or ad-hoc selections automatically reopen the appropriate panel while editing.

On event detail pages, administrators see the saved assigned-participant
snapshot when one exists. Events without assigned participants continue to
show only their existing self-registration behavior.

The administrator enrollment heading follows the selected language:
**Registered Users** in English and **Usuarios Registrados** in Spanish. Do not
label this section “Self-Registered Users” or “Usuarios Auto-Registrados.”

Ad-hoc entries are deduplicated by case-insensitive trimmed name plus phone
digits. A matching selected registered participant wins over an ad-hoc entry.
The final rows are copied into `event_participant`; later list edits cannot
change the event.

## Migration

Review the SQL and confirm development database recoverability first:

```bash
npx wrangler d1 migrations apply tumejorversion --local
```

Applying to remote D1 is a production data operation and requires explicit
authorization, verified recovery, and the production checklist.

## Validation performed

On July 24, 2026:

- Wrangler production build/configuration dry-run passed.
- Migrations `0001` and `0002` applied successfully to isolated local D1.
- Anonymous admin API access returned `401`; registered-user access returned
  `403`; administrator access returned `200`.
- Worker-level admin-page redirects passed.
- Name and formatted/unformatted partial phone search passed.
- Reusable-list overlap, direct-selection, and ad-hoc deduplication passed.
- List edits, list deletion, and participant deletion left old event snapshots
  unchanged.
- A linked user saw the associated event; another signed-in user did not.

`npx tsc --noEmit` remains blocked by pre-existing repository errors, including
conflicting Cloudflare/WebWorker declarations and legacy `worker.ts` errors.
The same failure occurs on the pre-feature canonical worktree.

## Remaining manual checks

- Exercise all controls on mobile.
- Verify touch scrolling and long-name wrapping with production-like content.
- Create and edit an event through the browser, including image upload.
- Verify existing event response/submission workflows end to end.
