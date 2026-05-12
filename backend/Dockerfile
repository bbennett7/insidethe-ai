FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download GPT-2 weights at build time so the runtime image needs no network access.
# We must (1) pull weights via transformers directly — newer nnsight versions don't download
# them in LanguageModel.__init__ — and (2) run an actual trace so nnsight's execution backend
# fully warms its cache path. Without the trace, from_pretrained inside the backend fails at
# runtime with "no pytorch_model.bin or model.safetensors" even though the model started OK.
RUN python -c "\
from transformers import GPT2LMHeadModel, GPT2Tokenizer; \
GPT2Tokenizer.from_pretrained('gpt2'); \
GPT2LMHeadModel.from_pretrained('gpt2'); \
from nnsight import LanguageModel; \
m = LanguageModel('gpt2', device_map='cpu', attn_implementation='eager'); \
with m.trace('hello'): pass; \
"

# Block all runtime HuggingFace downloads — if something is missing the container
# fails fast at startup rather than silently downloading during inference.
ENV HF_HUB_OFFLINE=1
ENV TRANSFORMERS_OFFLINE=1

COPY . .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
