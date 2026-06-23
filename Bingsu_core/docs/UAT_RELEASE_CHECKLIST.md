# UAT Release Checklist

Run this checklist before each production release.

## Test Environment

- [ ] `docker compose ps` shows all services up and healthy
- [ ] Backend ping is OK: `GET /api/ping`
- [ ] Supportadmin and User UI are reachable

## Signup and Email Verification

- [ ] Register a new user account
- [ ] Verification email is received in inbox/spam within expected time
- [ ] Verification link opens `verifying` page correctly
- [ ] Verify email succeeds and user is redirected to set password
- [ ] Initial password setup succeeds

## Pending Approval Flow

- [ ] Verified user appears in Supportadmin pending list
- [ ] Support can approve user successfully
- [ ] Approved user can login
- [ ] Support can reject pending user successfully

## Auth Safety Controls

- [ ] Signup rate limit works (429 after threshold)
- [ ] Resend verification rate limit works
- [ ] Forgot password rate limit works
- [ ] Reset password with invalid token is rejected

## Member Management (Support)

- [ ] Support can delete member (role=user) from Support panel
- [ ] Deleting own account is blocked
- [ ] Deleted member can no longer login

## Audit Logs

- [ ] Signup event logged with actor/time/ip
- [ ] Email verify event logged with actor/time/ip
- [ ] Approval update event logged with actor/time/ip
- [ ] Delete member event logged with actor/time/ip

## Backup and Restore

- [ ] Run `ops/backup.ps1` and verify backup folder output
- [ ] Run `ops/restore-drill.ps1` against latest backup
- [ ] Record drill result in release note

## Sign-off

- [ ] Product owner sign-off
- [ ] Support lead sign-off
- [ ] Release manager sign-off
