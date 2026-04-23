from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

import numpy as np


class GPT2Runner:
    """Wraps GPT-2 forward pass and streams layer activations via nnsight."""

    NUM_LAYERS: int = 12
    NUM_HEADS: int = 12
    D_MODEL: int = 768

    def __init__(self) -> None:
        # TODO: load the real model here
        # from nnsight import LanguageModel
        # self._model = LanguageModel("gpt2", device_map="auto")
        pass

    async def run(self, text: str) -> AsyncGenerator[str, None]:
        """Yield streamed JSON messages for the given input text."""

        # TODO: tokenize with real model tokenizer
        mock_tokens = [
            {"text": tok, "id": 1000 + i}
            for i, tok in enumerate(text.split())
        ]
        yield json.dumps({"type": "tokens", "data": mock_tokens})
        await asyncio.sleep(0.05)

        for layer_idx in range(self.NUM_LAYERS):
            seq_len = len(mock_tokens)

            # TODO: hook model.transformer.h[layer_idx].ln_1 output
            ln1_data = np.random.randn(seq_len, self.D_MODEL).tolist()
            yield json.dumps({
                "type": "layer",
                "layer": layer_idx,
                "component": "ln1",
                "data": ln1_data,
            })
            await asyncio.sleep(0.04)

            # TODO: hook model.transformer.h[layer_idx].attn weights + output
            attn_weights = np.random.rand(self.NUM_HEADS, seq_len, seq_len).tolist()
            yield json.dumps({
                "type": "layer",
                "layer": layer_idx,
                "component": "attn",
                "data": {"weights": attn_weights, "heads": self.NUM_HEADS},
            })
            await asyncio.sleep(0.04)

            # attn_write = ||attn_output[token]||₂ per token, normalized to [0,1]
            # hook: model.transformer.h[layer_idx].attn.output[0].norm(dim=-1)
            attn_write = np.random.rand(seq_len).clip(0.05, 1).tolist()
            yield json.dumps({
                "type": "layer",
                "layer": layer_idx,
                "component": "attn_write",
                "data": attn_write,
            })
            await asyncio.sleep(0.02)

            # TODO: hook model.transformer.h[layer_idx].ln_2 output
            ln2_data = np.random.randn(seq_len, self.D_MODEL).tolist()
            yield json.dumps({
                "type": "layer",
                "layer": layer_idx,
                "component": "ln2",
                "data": ln2_data,
            })
            await asyncio.sleep(0.04)

            # TODO: hook model.transformer.h[layer_idx].mlp.c_fc output (3072-dim pre-GELU hidden layer)
            mlp_hidden = np.abs(np.random.randn(3072)).clip(0, 1).tolist()
            yield json.dumps({
                "type": "layer",
                "layer": layer_idx,
                "component": "mlp",
                "data": mlp_hidden,
            })
            await asyncio.sleep(0.04)

            # mlp_write = ||mlp_output[token]||₂ per token, normalized to [0,1]
            # hook: model.transformer.h[layer_idx].mlp.output.norm(dim=-1)
            mlp_write = np.random.rand(seq_len).clip(0.05, 1).tolist()
            yield json.dumps({
                "type": "layer",
                "layer": layer_idx,
                "component": "mlp_write",
                "data": mlp_write,
            })
            await asyncio.sleep(0.02)

        # TODO: run real softmax over vocabulary logits for next-token probs; IDs from real tokenizer
        output_data = [
            {"text": "mat",   "id": 2603, "prob": 0.42},
            {"text": "floor", "id": 6816, "prob": 0.18},
            {"text": "chair", "id": 5118, "prob": 0.09},
            {"text": "bed",   "id": 3996, "prob": 0.07},
        ]
        yield json.dumps({"type": "output", "data": output_data})
        await asyncio.sleep(0.02)

        yield json.dumps({"type": "done"})
