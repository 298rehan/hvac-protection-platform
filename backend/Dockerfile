FROM python:3.12-slim

WORKDIR /app

# Pulls 'uv', a memory-safe, ultra-fast installer written in Rust
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY requirements.txt .

# Installs packages instantly using native binaries without memory bloat
RUN uv pip install --system --no-cache -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
