export type ProcessState =
  | 'idle'
  | 'tokenizing'
  | 'embedding'
  | 'computing'
  | 'done'

export type LayerState = 'inactive' | 'processing' | 'done'

export interface MergeItem {
  /** The token text (raw string from the BPE merge step) */
  t: string
  /** Whether a space should be prepended when rendering (GPT-2 Ġ prefix convention) */
  sp?: boolean
  /** Whether this item is a merged pair (true) vs an original byte token (false/absent) */
  m?: boolean
}

export interface Token {
  text: string
  id: number
}

export interface Candidate {
  text: string
  id: number
  probability: number
}

export interface OutputToken {
  text: string
  id: number
  candidates: Candidate[]
}

export interface LayerData {
  /** Mean activation magnitude from LayerNorm 1 (before attention), scalar summary used for visualization */
  ln1: number
  /** Mean activation magnitude from LayerNorm 2 (before MLP), scalar summary used for visualization */
  ln2: number
  /** Attention weights per head — shape [numHeads][seqLen][seqLen], causal (upper triangle = 0), rows sum to 1 */
  attn: number[][][]
  /** L2 norm of attention output per token position, normalized to [0, 1] — how much attention wrote to each residual */
  attn_write: number[]
  /** Post-GELU MLP hidden activations — shape [mlpDim] (4 × d_model = 3072 for GPT-2), sparse due to GELU zeroing negatives */
  mlp: number[]
  /** L2 norm of MLP output per token position, normalized to [0, 1] — how much MLP wrote to each residual */
  mlp_write: number[]
}
