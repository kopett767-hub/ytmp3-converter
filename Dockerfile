FROM python:3.11-slim

WORKDIR /app

# Install ffmpeg + dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip + install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application
COPY api/ ./api/
COPY index.html ./index.html
COPY styles.css ./styles.css
COPY script.js ./script.js

# Hugging Face uses PORT env
ENV PORT=7860

# Expose port
EXPOSE 7860

# Run
CMD ["gunicorn", "api.index:app", "--bind", "0.0.0.0:7860", "--workers", "1", "--timeout", "300"]
