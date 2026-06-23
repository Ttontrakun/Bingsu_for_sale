# API Key Rotation Runbook

## Scope

- `OPENAI_API_KEY`
- `OPENAI_FALLBACK_API_KEY`
- `TYPHOON_OCR_API_KEY`
- `EMAIL_ALERT_WEBHOOK_TOKEN`
- `SMTP_PASSWORD`

## Rotation Frequency

- Recommended: every 90 days
- Immediate rotation on leakage suspicion

## Steps

1. Create new key at provider portal
2. Update `Backend/.env` with new key
3. Restart backend container:

```powershell
cd "C:\Users\Administrator\Enterprise AI Chatbot_for_sale\Enterprise AI Chatbot_core"
docker compose up -d --build legacy
```

4. Run smoke test:
   - `/api/ping`
   - chat call
   - OCR test (if enabled)
5. Revoke old key at provider
6. Record rotation date and operator

## Emergency Procedure

- Disable affected integration temporarily
- Rotate key immediately
- Review logs for suspicious usage window
