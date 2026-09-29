FROM python:3.12-alpine

WORKDIR /app

COPY requirements.txt .

# Optimize pip to prevent high memory/CPU usage on small instances
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Fix: Match the port in EXPOSE with the port in CMD
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
