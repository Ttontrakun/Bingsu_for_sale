# API (FastAPI) — build context = bb/Backend
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLAGS_use_mkldnn=0

RUN apt-get update && apt-get install -y --no-install-recommends \
  libgl1 libglib2.0-0 libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY Service/Website/requirements.txt /app/requirements.txt
COPY Service/Website/constraints.txt /app/constraints.txt
RUN pip install --no-cache-dir -r /app/requirements.txt -c /app/constraints.txt

COPY Service/Website/app /app/app

EXPOSE 8000
CMD ["sh", "-c", "export FLAGS_use_mkldnn=0 && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
