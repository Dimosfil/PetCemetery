# Pet Cemetery MVP Contract

## Product boundary

The current product is a responsive memorial social network. A possible Unity
application is a separate backlog product and does not share a required runtime,
API, database, or release boundary with this repository.

## Memorial workflow

1. An authenticated owner creates a memorial.
2. The owner selects memorial visibility and an independent location mode.
3. The server derives the public coordinate projection.
4. Public discovery exposes only public memorials and their public projection.
5. Visitors may add a candle, flower, or moderated text tribute.
6. Only the owner may edit or delete the memorial and its ceremony.

## Authentication contract

- Email/password registration and login remain available.
- Google OAuth uses Authorization Code with state and PKCE, then creates the
  same signed application session used by email/password authentication.
- Only a Google ID token with the configured audience, a supported Google
  issuer, and a verified email may authenticate a user.
- A verified Google email links to an existing account with the same email or
  creates an account with an unusable random password; OAuth secrets remain
  server-only and the database schema does not store provider tokens.
- The callback is always `${APP_URL}/api/auth/google/callback`; `APP_URL` is a
  deployment configuration value and must match the public application origin.

## Location invariants

- The owner's optional city is profile data and may be displayed beside the
  owner's name on their memorials. It is not a coordinate, does not position a
  memorial, and never constrains the memorial location selected by the owner.
- Owners can add, change, or clear their city from the dashboard. The profile
  form explicitly states that a saved city is public on their memorial pages
  and searchable by other authenticated users.
- After selecting a non-hidden location mode, the owner can choose coordinates
  either by clicking the map or by panning the map and confirming its center
  with an explicit button; changing from hidden mode must activate selection
  without requiring a page reload.
- `exact`: the selected coordinate is intentionally public.
- `approximate`: the exact coordinate remains private; the public coordinate is
  displaced and stable until the owner edits the location.
- `symbolic`: the selected coordinate is explicitly not claimed as a real grave.
- `hidden`: no coordinate is returned in public data.
- Private and unlisted memorials never appear in public map discovery.

## Friendship workflow

1. Only an authenticated user may search people by a non-empty profile city.
2. Search matches a case-insensitive city fragment, excludes the current user,
   returns at most 50 profiles, and exposes only display name, avatar, city, and
   the relationship state needed by the interface.
3. A user may send one pending request to another user. A database constraint
   makes the unordered user pair unique and forbids self-friendship.
4. Only the addressee may accept or decline a pending request. Only the
   requester may cancel it. Declining or cancelling removes the pending record.
5. Either participant may remove an accepted friendship. A new request may be
   sent after a pending or accepted relationship is removed.
6. Friendship mutations are authenticated and authorized on the server; client
   state never grants permission.

## Ceremony contract

A ceremony is a scheduled or timeless memorial section with a title, farewell
message, and visitor tributes. Live video, payments, chat, and streaming are out
of scope for MVP.

## Acceptance guarantees

- Authorization is enforced server-side for every owner mutation.
- Public serializers use an allowlist and never expose private coordinates.
- Image uploads are limited to 5 MB and accepted only when the declared MIME
  type matches a JPEG, PNG, or WebP file signature detected from its bytes.
- External services and secrets are configured outside source code.
- Docker startup applies the idempotent database schema before serving traffic.
