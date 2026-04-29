FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Download and cache GPT-2 weights at build time — params must match runner.py exactly.
# This makes the image ~1.5 GB but eliminates all runtime HuggingFace network calls.
RUN python -c "from nnsight import LanguageModel; LanguageModel('gpt2', device_map='cpu', attn_implementation='eager')"

# Block all runtime HuggingFace downloads — if something is missing the container
# fails fast at startup rather than silently downloading during inference.
ENV HF_HUB_OFFLINE=1
ENV TRANSFORMERS_OFFLINE=1

COPY . .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
