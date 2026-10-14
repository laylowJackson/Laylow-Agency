FROM node:22-bookworm-slim AS node-runtime
FROM python:3.12-slim-bookworm
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./
RUN useradd --uid 10001 --create-home laylow && mkdir -p /app/runtime && chown laylow:laylow /app/runtime && ln -s /app/runtime/.env.local /app/.env.local
ENV PYTHONUNBUFFERED=1 LAYLOW_DATA_DIR=/app/runtime LAYLOW_DASHBOARD_HOST=127.0.0.1 LAYLOW_DASHBOARD_PORT=5000
USER laylow
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/healthz',timeout=3)"
CMD ["python", "hosted_start.py"]
