import type { Candidate, LayerData, Token } from '@/lib/processTypes'
import { seededRng } from '@/mocks/rng'

export const INPUT_TOKENS: Token[] = [
  { text: 'The', id: 464 },
  { text: 'cat', id: 3797 },
  { text: 'sat', id: 3332 },
  { text: 'on', id: 319 },
  { text: 'the', id: 262 },
  { text: 'mat', id: 2603 },
]

export const MERGE_STAGES: Array<
  Array<{ t: string; sp?: boolean; m?: boolean }>
> = [
  // Stage 0 — raw characters
  [
    { t: 'T' },
    { t: 'h' },
    { t: 'e' },
    { t: '·', sp: true },
    { t: 'c' },
    { t: 'a' },
    { t: 't' },
    { t: '·', sp: true },
    { t: 's' },
    { t: 'a' },
    { t: 't' },
    { t: '·', sp: true },
    { t: 'o' },
    { t: 'n' },
    { t: '·', sp: true },
    { t: 't' },
    { t: 'h' },
    { t: 'e' },
    { t: '·', sp: true },
    { t: 'm' },
    { t: 'a' },
    { t: 't' },
  ],
  // Stage 1 — first merges (common bigrams)
  [
    { t: 'Th', m: true },
    { t: 'e' },
    { t: '·', sp: true },
    { t: 'c' },
    { t: 'at', m: true },
    { t: '·', sp: true },
    { t: 's' },
    { t: 'at', m: true },
    { t: '·', sp: true },
    { t: 'on', m: true },
    { t: '·', sp: true },
    { t: 'th', m: true },
    { t: 'e' },
    { t: '·', sp: true },
    { t: 'm' },
    { t: 'at', m: true },
  ],
  // Stage 2 — second merges → final tokens
  [
    { t: 'The', m: true },
    { t: '·', sp: true },
    { t: 'cat', m: true },
    { t: '·', sp: true },
    { t: 'sat', m: true },
    { t: '·', sp: true },
    { t: 'on', m: true },
    { t: '·', sp: true },
    { t: 'the', m: true },
    { t: '·', sp: true },
    { t: 'mat', m: true },
  ],
]

export const OUTPUT_SEQUENCES: Candidate[][] = [
  [
    { text: '.', id: 13, prob: 0.38 },
    { text: '"', id: 1, prob: 0.17 },
    { text: 'and', id: 290, prob: 0.11 },
    { text: ',', id: 11, prob: 0.08 },
    { text: 'with', id: 351, prob: 0.06 },
  ],
  [
    { text: 'while', id: 981, prob: 0.29 },
    { text: '.', id: 13, prob: 0.22 },
    { text: 'as', id: 355, prob: 0.14 },
    { text: ',', id: 11, prob: 0.09 },
    { text: 'and', id: 290, prob: 0.07 },
  ],
  [
    { text: ',', id: 11, prob: 0.41 },
    { text: '.', id: 13, prob: 0.19 },
    { text: 'and', id: 290, prob: 0.12 },
    { text: 'but', id: 475, prob: 0.08 },
    { text: 'when', id: 618, prob: 0.05 },
  ],
]

const NUM_HEADS = 12
const MLP_DIM = 3072

export function genLayerData(li: number, seqLen = 6): LayerData {
  const rng = seededRng(li * 997 + 41)

  const ln1 = 0.38 + rng() * 0.56
  const ln2 = 0.32 + rng() * 0.58

  const attn: number[][][] = Array.from({ length: NUM_HEADS }, (_, h) => {
    const r = seededRng(li * 131 + h * 17 + 3)
    return Array.from({ length: seqLen }, (__, i) => {
      const raw = Array.from({ length: seqLen }, (_, j) => {
        if (j > i) return 0
        if (j === i) return 2.0 + r() * 1.5
        if (j === i - 1) return 1.5 + r() * 1.5
        if (j === 2 && i > 2) return 1.0 + r() * 2.0
        return r() * 0.8
      })
      const sum = raw.reduce((a, b) => a + b, 0) || 1
      return raw.map((v) => v / sum)
    })
  })

  // Per-token attention write magnitudes (normalized to [0,1])
  // How much attention added to each token's residual at this layer
  const attn_write: number[] = Array.from({ length: seqLen }, () =>
    Math.min(1, Math.max(0.05, rng() * 0.9))
  )

  const mlp: number[] = Array.from({ length: MLP_DIM }, () => {
    const v = rng()
    return v < 0.55 ? 0 : ((v - 0.55) / 0.45) ** 1.6
  })

  // Per-token MLP write magnitudes — generally different pattern from attention
  const mlp_write: number[] = Array.from({ length: seqLen }, () =>
    Math.min(1, Math.max(0.05, rng() * 0.85))
  )

  return { ln1, ln2, attn, attn_write, mlp, mlp_write }
}
