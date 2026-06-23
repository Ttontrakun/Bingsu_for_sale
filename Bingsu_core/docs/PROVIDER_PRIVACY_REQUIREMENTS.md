# Provider Privacy Requirements

Use this checklist when signing or renewing external AI provider contracts.

## Mandatory Contract Clauses

- No training on customer data
- No retention beyond request processing window
- Region lock (processing + storage in allowed region only)
- Data deletion SLA (for logs, backups, temporary files)
- Security incident notification SLA
- Right to audit / compliance evidence (ISO 27001, SOC2, etc.)

## Technical Requirements

- TLS in transit
- API key scoping and rotation support
- Per-request trace id support for incident investigation
- Access logs export for forensic needs

## Approved Provider List

Record each provider:

- provider name
- processing region
- signed date / expiry date
- owner team
- fallback policy

## Release Gate

Do not enable new external model/ocr provider in production until this checklist is completed and approved by security owner.
