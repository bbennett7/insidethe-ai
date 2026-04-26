import asyncio
import re
from collections.abc import AsyncIterator
from typing import Any

import numpy as np
import torch
from nnsight import LanguageModel
from transformers.utils import cached_file

# GPT-2's fixed pre-tokenization pattern — splits raw text into "words" before
# BPE runs. Handles contractions ('s, 't, etc.), words, numbers, punctuation,
# and whitespace separately so spaces are attached to the following word.
_GPT2_PAT = re.compile(r"""'s|'t|'re|'ve|'m|'ll|'d| ?\w+| ?\d+| ?[^\s\w\d]+|\s+(?!\S)|\s+""")


def _make_byte_maps() -> "tuple[dict, dict]":
    """Build GPT-2's fixed byte↔unicode mapping.

    GPT-2's tokenizer works on unicode characters, not raw bytes — but not all
    bytes map to printable unicode. This mapping translates every possible byte
    (0–255) to a unique printable character so BPE can operate on them as plain
    strings. The reverse map (_BYTE_DEC) translates back for display.
    """
    bs = (
        list(range(ord("!"), ord("~") + 1))
        + list(range(ord("¡"), ord("¬") + 1))
        + list(range(ord("®"), ord("ÿ") + 1))
    )
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    enc = dict(zip(bs, [chr(c) for c in cs]))
    return enc, {v: k for k, v in enc.items()}


_BYTE_ENC, _BYTE_DEC = _make_byte_maps()


class GPT2Runner:
    NUM_LAYERS: int = 12
    NUM_HEADS: int = 12
    D_MODEL: int = 768

    def __init__(self) -> None:
        self._model = LanguageModel("gpt2", device_map="cpu", attn_implementation="eager")
        # Required so GPT2Attention.forward returns (attn_output, attn_weights)
        # — index [1] is used below
        self._model.config.output_attentions = True
        # Load BPE merge rules from the cached merges.txt (already on disk from model download)
        merges_path = cached_file("gpt2", "merges.txt")
        with open(merges_path) as fh:
            lines = [ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")]
        # _bpe_ranks maps each merge pair to its priority — lower rank = applied first
        self._bpe_ranks: dict[tuple[str, str], int] = {
            tuple(line.split()): i
            for i, line in enumerate(lines)  # type: ignore[misc]
        }
        # Prevents concurrent nnsight traces on the shared model instance
        self._lock = asyncio.Lock()

    def _compute_bpe_stages(self, text: str) -> list[list[dict]]:
        """Replay GPT-2's BPE merges step by step and return each intermediate state.

        GPT-2 pre-tokenizes text into "words" (via _GPT2_PAT), then runs BPE
        independently on each word. BPE greedily merges the highest-priority
        adjacent pair at each step until no more merges apply.

        Returns a list of stages. Each stage is a flat list of token items across
        all words, ready to send as a merge_stage frame to the frontend.
        """
        bpe_ranks = self._bpe_ranks

        def word_stages(pre_token: str) -> list[list[str]]:
            """Run BPE on a single pre-token and return every intermediate stage.

            Converts the pre-token to GPT-2's byte-encoded representation first,
            then repeatedly finds and applies the highest-priority merge until no
            more valid pairs exist. Each state after a merge is saved as a stage.
            """
            chars = [_BYTE_ENC[b] for b in pre_token.encode("utf-8")]
            stages = [chars.copy()]
            while len(chars) > 1:
                best_pair = None
                best_rank = float("inf")
                for i in range(len(chars) - 1):
                    r = bpe_ranks.get((chars[i], chars[i + 1]), float("inf"))
                    if r < best_rank:
                        best_rank = r
                        best_pair = (chars[i], chars[i + 1])
                if best_pair is None:
                    break
                new_chars: list[str] = []
                i = 0
                while i < len(chars):
                    if (
                        i < len(chars) - 1
                        and chars[i] == best_pair[0]
                        and chars[i + 1] == best_pair[1]
                    ):  # noqa: E501
                        new_chars.append(chars[i] + chars[i + 1])
                        i += 2
                    else:
                        new_chars.append(chars[i])
                        i += 1
                chars = new_chars
                stages.append(chars.copy())
            return stages

        def merged_indices(prev: list[str], curr: list[str]) -> set[int]:
            """Return the indices in curr that were newly created by a merge in this step.

            Walks both lists in parallel: when a single curr token equals two
            consecutive prev tokens concatenated, that curr index was just merged.
            Used to highlight newly merged tokens in the frontend animation.
            """
            result: set[int] = set()
            ci = pi = 0
            while ci < len(curr) and pi < len(prev):
                if prev[pi] == curr[ci]:
                    pi += 1
                    ci += 1
                elif pi + 1 < len(prev) and prev[pi] + prev[pi + 1] == curr[ci]:
                    result.add(ci)
                    pi += 2
                    ci += 1
                else:
                    pi += 1
                    ci += 1
            return result

        def tok_display(tok: str) -> tuple[str, bool]:
            """Convert a byte-encoded token back to a readable string.

            Returns (display_text, had_leading_space). The leading space is
            stripped from the text and returned separately so the frontend can
            render it as a visible · separator between words.
            """
            raw = bytes(_BYTE_DEC[c] for c in tok).decode("utf-8", errors="replace")
            return raw.lstrip(" "), raw.startswith(" ")

        pre_tokens = _GPT2_PAT.findall(text)
        if not pre_tokens:
            return []

        all_word_stages = [word_stages(pt) for pt in pre_tokens]
        max_stages = max(len(ws) for ws in all_word_stages)

        # Zip all words' stage lists together into a single timeline.
        # Words that finish merging early hold their final state for the remaining steps.
        result: list[list[dict]] = []
        for si in range(max_stages):
            items: list[dict] = []
            for ws in all_word_stages:
                curr = ws[min(si, len(ws) - 1)]
                prev = ws[min(si - 1, len(ws) - 1)] if si > 0 else None
                merged = (
                    merged_indices(prev, curr)
                    if prev is not None and len(curr) != len(prev)
                    else set()
                )
                for ti, tok in enumerate(curr):
                    display, has_space = tok_display(tok)
                    if ti == 0 and has_space and items:
                        items.append({"t": "·", "sp": True, "m": False})
                    if display:
                        items.append({"t": display, "sp": False, "m": ti in merged})
            if items:
                result.append(items)

        return result

    def _run_trace(self, text: str) -> tuple[Any, list[dict], Any]:
        """Run a single GPT-2 forward pass and capture internal activations via nnsight.

        nnsight's context manager intercepts the forward pass and attaches .save()
        probes to specific layers. The saved tensors are detached from the compute
        graph and held in memory until we process them in run().

        Must not be called concurrently — nnsight hooks are registered on the shared
        model instance and two simultaneous traces would corrupt each other.
        """
        layer_saves: list[dict] = []
        with self._model.trace(text):
            embed_saved = self._model.transformer.wte.output.save()
            for i in range(self.NUM_LAYERS):
                h = self._model.transformer.h[i]
                layer_saves.append(
                    {
                        "ln1": h.ln_1.output.save(),  # LayerNorm 1 output (before attention)
                        "attn": h.attn.output.save(),  # (attn_output, attn_weights) tuple
                        "ln2": h.ln_2.output.save(),  # LayerNorm 2 output (before MLP)
                        "act": h.mlp.act.output.save(),  # Post-GELU MLP hidden activations
                        "mlp": h.mlp.output.save(),  # MLP output written to residual stream
                    }
                )
            logits_saved = self._model.lm_head.output.save()
        return embed_saved, layer_saves, logits_saved

    async def run(self, text: str) -> AsyncIterator[dict]:
        """Async generator that streams typed frames for a single inference pass.

        Frame order matches what the frontend expects:
          merge_stage frames  — BPE animation (no model needed, runs first)
          tokens frame        — final tokenized input
          embed frames        — one per token, real embedding vectors
          layer frames ×12    — six components per layer in order
          output frame        — top-10 next-token candidates
          done frame          — signals end of pass

        The nnsight trace runs in a background thread (asyncio.to_thread) since
        PyTorch inference is synchronous and would block the event loop. The lock
        serializes concurrent requests; asyncio.shield prevents a client cancel
        from interrupting the thread mid-trace.
        """
        enc = self._model.tokenizer(text, return_tensors="pt", truncation=True, max_length=1024)
        input_ids = enc["input_ids"][0]
        token_count = input_ids.shape[0]

        if token_count == 0:
            yield {"type": "error", "message": "Input produced no tokens."}
            return

        for stage in self._compute_bpe_stages(text):
            yield {"type": "merge_stage", "items": stage}
            await asyncio.sleep(0)

        tokens = [
            {"text": self._model.tokenizer.decode([int(id_)]), "id": int(id_)}
            for id_ in input_ids.tolist()
        ]
        yield {"type": "tokens", "data": tokens}
        await asyncio.sleep(0)

        async with self._lock:
            trace_task = asyncio.create_task(asyncio.to_thread(self._run_trace, text))
            try:
                embed_saved, layer_saves, logits_saved = await asyncio.shield(trace_task)
            except asyncio.CancelledError:
                await asyncio.shield(trace_task)  # wait for thread; don't allow a second cancel
                raise

        # Emit one embed frame per token — each vector normalized to [-1, 1] by its own max
        embed_mat = embed_saved[0].detach().numpy()  # [seq_len, 768]
        for idx in range(token_count):
            vec = embed_mat[idx]
            max_abs = float(np.abs(vec).max()) + 1e-8
            yield {"type": "embed", "token_idx": idx, "data": (vec / max_abs).tolist()}
            await asyncio.sleep(0)

        for i, s in enumerate(layer_saves):
            # ln1: mean L2 norm across token positions, normalized to [0, 1]
            ln1_mat = s["ln1"][0].detach().numpy()
            ln1 = float(min(1.0, np.mean(np.linalg.norm(ln1_mat, axis=-1)) / np.sqrt(self.D_MODEL)))
            yield {"type": "layer", "layer": i, "component": "ln1", "data": ln1}
            await asyncio.sleep(0)

            # attn: full per-head weight matrices [num_heads, seq, seq], rounded to save bandwidth
            attn_weights = np.round(s["attn"][1][0].detach().numpy(), 4)
            yield {
                "type": "layer",
                "layer": i,
                "component": "attn",
                "data": {"weights": attn_weights, "heads": self.NUM_HEADS},
            }
            await asyncio.sleep(0)

            # attn_write: L2 norm of attention output per token, normalized to [0, 1] —
            # how much attention wrote to each position in the residual stream
            attn_h = s["attn"][0][0].detach().numpy()
            norms = np.linalg.norm(attn_h, axis=-1)
            attn_write = (norms / (norms.max() + 1e-8)).clip(0.05, 1)
            yield {"type": "layer", "layer": i, "component": "attn_write", "data": attn_write}
            await asyncio.sleep(0)

            # ln2: same as ln1 but after attention, before MLP
            ln2_mat = s["ln2"][0].detach().numpy()
            ln2 = float(min(1.0, np.mean(np.linalg.norm(ln2_mat, axis=-1)) / np.sqrt(self.D_MODEL)))
            yield {"type": "layer", "layer": i, "component": "ln2", "data": ln2}
            await asyncio.sleep(0)

            # mlp: post-GELU activations for the last token position only (3072-dim).
            # GELU is dense (unlike ReLU), so we use abs value to show activation magnitude.
            act_last = s["act"][0, -1].detach().numpy()
            mlp_norm = (np.abs(act_last) / (np.abs(act_last).max() + 1e-8)).clip(0, 1)
            yield {"type": "layer", "layer": i, "component": "mlp", "data": mlp_norm}
            await asyncio.sleep(0)

            # mlp_write: L2 norm of MLP output per token, normalized to [0, 1] —
            # how much MLP wrote to each position in the residual stream
            mlp_h = s["mlp"][0].detach().numpy()
            mlp_norms = np.linalg.norm(mlp_h, axis=-1)
            mlp_write = (mlp_norms / (mlp_norms.max() + 1e-8)).clip(0.05, 1)
            yield {"type": "layer", "layer": i, "component": "mlp_write", "data": mlp_write}
            await asyncio.sleep(0)

            # release activation tensors as we go to avoid holding all 12 layers in memory
            s.clear()

        # Top-10 next-token predictions with softmax probabilities
        logits = logits_saved[0, -1]
        topk = torch.topk(logits, 10)
        top_probs = torch.softmax(topk.values, dim=-1)
        output_data = [
            {"text": self._model.tokenizer.decode([int(id_)]), "id": int(id_), "prob": float(p)}
            for id_, p in zip(topk.indices.tolist(), top_probs.tolist())
        ]
        yield {"type": "output", "data": output_data}
        await asyncio.sleep(0)

        yield {"type": "done"}
