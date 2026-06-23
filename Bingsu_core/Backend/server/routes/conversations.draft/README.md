# Conversations Refactor Draft (No Runtime Impact)

This folder is a preparation area for splitting `routes/conversations.js` into smaller modules.

Important:

- Nothing in this folder is wired into runtime yet.
- Existing behavior still comes entirely from `routes/conversations.js`.
- Files here are safe staging copies for incremental migration later.

Suggested migration order:

1. Move pure helper functions first (no DB/network side effects).
2. Add imports in `conversations.js` one group at a time.
3. Verify behavior after each small move.
4. Only then remove duplicated code from `conversations.js`.
