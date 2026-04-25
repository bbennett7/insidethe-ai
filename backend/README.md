# insidethe.ai — Backend

FastAPI + WebSocket server that runs GPT-2 inference and streams internal activations to the frontend in real time.

## Stack

- **FastAPI** — async web framework, WebSocket support
- **nnsight** — hooks into model internals during a forward pass without modifying the model
- **transformers** — loads GPT-2 weights and tokenizer via HuggingFace
- **orjson** — fast JSON serialization (handles NumPy arrays directly)

## Running locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Or from the repo root:

```bash
pnpm backend
```

## HuggingFace model cache

On first run, `LanguageModel("gpt2")` downloads the GPT-2 model from HuggingFace and caches it to disk (usually `~/.cache/huggingface/hub/models--gpt2/`). Subsequent starts load from cache with no network request.

The downloaded files are:

| File                   | Size     | What it is                                                                                     |
|------------------------|----------|------------------------------------------------------------------------------------------------|
| `pytorch_model.bin`    | ~548 MB  | The actual model weights — all 117M parameters stored as floating point tensors                |
| `config.json`          | ~1 KB    | Model architecture config (num layers, heads, d_model, vocab size, etc.)                       |
| `vocab.json`           | ~1 MB    | Maps each of the 50,257 BPE tokens to an integer ID                                            |
| `merges.txt`           | ~456 KB  | GPT-2's BPE merge table — ~50,000 lines, each defining one pair to merge and in what priority  |
| `tokenizer_config.json`| ~1 KB    | Tokenizer settings (model type, special tokens, etc.)                                          |
| `tokenizer.json`       | ~2 MB    | Full fast-tokenizer definition (vocab + merges in a single file, used by HuggingFace)          |

`merges.txt` is what `_compute_bpe_stages` reads. It's OpenAI's data — we never write it, just load it from the cache to replay the merge steps in order.

## How it works

### 1. BPE tokenization visualization

GPT-2 tokenizes text using Byte-Pair Encoding (BPE). BPE starts with individual characters and repeatedly merges the most frequently co-occurring adjacent pair into a single token, until no more merges apply.

`GPT2Runner._compute_bpe_stages` re-runs this process step by step using GPT-2's actual merge rules (loaded from `merges.txt` on disk). Each intermediate state is recorded as a `merge_stage` frame, so the frontend can animate the characters collapsing into final tokens.

### 2. Model tracing

`GPT2Runner._run_trace` uses nnsight to hook into GPT-2's internals during a single forward pass.

nnsight works by wrapping a HuggingFace model in a tracing context (`with model.trace(input)`). Inside that context, you can attach `.save()` to any layer's output — nnsight intercepts the forward pass, records the tensor at that point, and makes it available after the context exits. The model weights are never modified; nnsight injects hooks at the PyTorch module level and removes them when the trace is done. This is different from manually rewriting the model's `forward()` method — you get access to any internal value without touching the model code at all.

The following are captured per run:

| Hook point                | What it captures                                            |
|---------------------------|-------------------------------------------------------------|
| `transformer.wte.output`  | Token embedding matrix — one 768-dim vector per input token |
| `h[i].ln_1.output`        | LayerNorm 1 output (before attention)                       |
| `h[i].attn.output`        | Attention output + per-head weight matrices                 |
| `h[i].ln_2.output`        | LayerNorm 2 output (before MLP)                             |
| `h[i].mlp.act.output`     | Post-GELU MLP hidden activations                            |
| `h[i].mlp.output`         | MLP output (written back to residual stream)                |
| `lm_head.output`          | Final logits over the 50,257-token vocabulary               |

**What we don't capture:** the residual stream itself — the running sum that each layer reads from and writes to — is not saved directly. Instead we capture the *outputs* of attention and MLP before they're added to the residual (`attn_write`, `mlp_write`), and take their L2 norms as a proxy for how much each component contributed at each token position. This is factually accurate — those norms reflect real write magnitudes from the real forward pass — but it means the frontend shows contribution magnitude, not the full residual state. You couldn't reconstruct the exact residual vector from what's displayed, but everything shown is a genuine signal from inside the model.

The trace runs in a background thread via `asyncio.to_thread` since PyTorch inference is synchronous. An `asyncio.Lock` serializes concurrent requests — nnsight hooks are attached to the shared model instance and would corrupt each other if two traces ran simultaneously. `asyncio.shield` prevents a client cancellation from interrupting the trace mid-flight, which would leave the model in a broken state.

### 3. Frame emission

`GPT2Runner.run` is an async generator that yields typed frames in the order the frontend expects:

```
handshake      ← sent once on WS connect (from main.py)
merge_stage    ← one frame per BPE merge step
tokens         ← final tokenized input with text + IDs
embed          ← one frame per input token (768-dim embedding vector, normalized)
layer ×12      ← six component frames per layer (ln1, attn, attn_write, ln2, mlp, mlp_write)
output         ← top-10 next-token candidates with probabilities
done           ← signals end of this pass
```

Activation values are normalized before sending:
- Embeddings: divided by their own max absolute value → range `[-1, 1]`
- LayerNorm scalars: mean L2 norm across positions, normalized by `√d_model` → `[0, 1]`
- Attention write / MLP write: L2 norm per token position, normalized by max → `[0, 1]`
- MLP activations: absolute value normalized by max → `[0, 1]`

### 4. WebSocket protocol

`main.py` manages the WebSocket connection. On connect it sends a handshake frame (`HANDSHAKE_FRAME`) with model metadata, then listens for `{ "type": "run", "text": "..." }` messages. Each `run` message cancels any in-progress inference task and starts a new one via `stream_to_websocket` (in `streamer.py`), which encodes each frame as JSON and sends it over the socket.

Origin validation is handled manually on the WebSocket scope since FastAPI's CORS middleware does not apply to WebSocket connections.

## Files

| File | Role |
|---|---|
| `main.py` | FastAPI app, lifespan, CORS, `/health`, `/model-info`, `/run`, `/ws` |
| `model.py` | `GPT2Runner` — BPE stages, nnsight trace, frame emission |
| `streamer.py` | Frame encoding and WebSocket streaming helper |
| `requirements.txt` | Pinned Python dependencies |
