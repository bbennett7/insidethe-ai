export type ProcessState = 'idle' | 'tokenizing' | 'embedding' | 'computing' | 'done';

export type LayerState = 'inactive' | 'processing' | 'done';

export interface MergeItem {
  /** The token text (raw string from the BPE merge step) */
  t: string;
  /** Whether a space should be prepended when rendering (GPT-2 Ġ prefix convention) */
  sp?: boolean;
  /** Whether this item is a merged pair (true) vs an original byte token (false/absent) */
  m?: boolean;
}

export interface Token {
  text: string;
  id: number;
}

export interface Candidate {
  text: string;
  id: number;
  probability: number;
}

export interface OutputToken {
  text: string;
  id: number;
  candidates: Candidate[];
}

export type LayerComponent = 'ln1' | 'attn' | 'attn_write' | 'ln2' | 'mlp' | 'mlp_write';

type RawAttnData = { weights: number[][][]; heads: number };
type RawLNData = number;
type RawMlpData = number[];
type RawWriteData = number[];

type RawLayerData =
  | { component: 'ln1'; data: RawLNData }
  | { component: 'ln2'; data: RawLNData }
  | { component: 'attn'; data: RawAttnData }
  | { component: 'attn_write'; data: RawWriteData }
  | { component: 'mlp'; data: RawMlpData }
  | { component: 'mlp_write'; data: RawWriteData };

/** Raw output candidate shape from the wire — note 'prob' not 'probability' */
export interface RawCandidate {
  text: string;
  id: number;
  prob: number;
}

export type ServerMessage =
  | {
      type: 'hello';
      protocol_version: number;
      model: string;
      num_layers: number;
      components_per_layer: string[];
    }
  | { type: 'merge_stage'; items: MergeItem[] }
  | { type: 'tokens'; data: Token[] }
  | { type: 'embed'; token_idx: number; data: number[] }
  | ({ type: 'layer'; layer: number } & RawLayerData)
  | { type: 'output'; data: RawCandidate[] }
  | { type: 'done' }
  | { type: 'error'; message?: string; detail?: string };

export interface StreamFrame {
  /** Sequential frame counter — monotonically increasing from 0, used as React key */
  num: number;
  /** Milliseconds since the run started — used to show relative timing between frames */
  ms: number;
  /** Raw WebSocket message payload — keys and value types vary by message type */
  payload: Record<string, unknown>;
}

export interface LayerData {
  /** Mean activation magnitude from LayerNorm 1 (before attention), scalar summary used for visualization */
  ln1: number;
  /** Mean activation magnitude from LayerNorm 2 (before MLP), scalar summary used for visualization */
  ln2: number;
  /** Attention weights per head — shape [numHeads][seqLen][seqLen], causal (upper triangle = 0), rows sum to 1 */
  attn: number[][][];
  /** L2 norm of attention output per token position, normalized to [0, 1] — how much attention wrote to each residual */
  attn_write: number[];
  /** Post-GELU MLP hidden activations — shape [mlpDim] (4 × d_model = 3072 for GPT-2), magnitude normalized to [0, 1] */
  mlp: number[];
  /** L2 norm of MLP output per token position, normalized to [0, 1] — how much MLP wrote to each residual */
  mlp_write: number[];
}
