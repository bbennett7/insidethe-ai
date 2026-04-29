import styles from './InfoTooltip.module.css'

export const tokenIdTooltip = () => (
  <div>
    <div className={styles.heading}>Token ID</div>
    GPT-2 converts text into <span className={styles.accent}>tokens</span> — sub-word chunks drawn
    from a vocabulary of <span className={styles.accent}>50,257</span> entries. The small number
    above each chip is the token&apos;s integer ID in that vocabulary (0 – 50,256).
    <hr className={styles.divider} />
    <div className={styles.note}>
      Common words are often a single token. Rare words split into multiple pieces, e.g.{' '}
      &quot;tokenization&quot; → [&quot;token&quot;, &quot;ization&quot;].
    </div>
  </div>
)

export const inputTokenCountTooltip = () => (
  <div>
    <div className={styles.heading}>Input Tokens</div>
    GPT-2 sees text as <span className={styles.accent}>tokens</span> — sub-word chunks from its{' '}
    <span className={styles.accent}>50,257</span>-entry vocabulary (BPE encoding). Each token has a
    unique integer ID.
    <hr className={styles.divider} />
    <div className={styles.note}>
      The model&apos;s maximum context window is <span className={styles.accent}>1,024 tokens</span>
      . Longer inputs are truncated.
    </div>
  </div>
)

export const outputTokenCountTooltip = () => (
  <div>
    <div className={styles.heading}>Output Tokens</div>
    Each entry is the <span className={styles.accent}>most likely next token</span> from one complete
    forward pass through all 12 layers. Hover any chip to see the{' '}
    <span className={styles.accent}>top-10 candidates</span> and their relative probabilities.
    <hr className={styles.divider} />
    <div className={styles.note}>
      This visualizer runs one pass at a time — next-token prediction, not open-ended generation.
      Probabilities are shown relative to the top-10 candidates, not the full 50,257-token
      vocabulary. GPT-2 rarely picks{' '}
      <span className={styles.accent}>&lt;|endoftext|&gt;</span> naturally; sequences continue until
      you cancel or reset.
    </div>
  </div>
)

export const embeddingStripTooltip = () => (
  <div>
    <div className={styles.heading}>Token Embedding</div>
    Each token is mapped to a <span className={styles.accent}>768-dimensional vector</span> — a
    point in high-dimensional space that encodes semantic meaning. Tokens with similar meanings
    cluster nearby.
    <hr className={styles.divider} />
    The colored bar shows all <span className={styles.accent}>768 values</span> as a scrolling
    heatmap. <span className={styles.accent}>Green</span> = positive,{' '}
    <span className={styles.accent}>red</span> = negative. Brightness encodes magnitude.
    <div className={styles.note}>
      GPT-2&apos;s embedding matrix is <span className={styles.accent}>50,257 × 768</span> — one row
      per vocabulary entry.
    </div>
  </div>
)

export const mechInterpTooltip = () => (
  <div>
    <div className={styles.heading}>Mechanistic Interpretability</div>
    The field of reverse-engineering neural networks to understand{' '}
    <span className={styles.accent}>how they compute</span> — tracing which circuits, attention
    heads, and neurons are responsible for specific model behaviors.
    <hr className={styles.divider} />
    Rather than treating models as black boxes, mech interp asks: what algorithm is the network
    implementing? This visualizer surfaces the activations, attention patterns, and MLP outputs for
    every layer of GPT-2 in real time.
    <div className={styles.note}>
      Pioneered by researchers at Anthropic, DeepMind, and EleutherAI. Key figures include Chris
      Olah, Neel Nanda, and the Alignment Forum community.
    </div>
  </div>
)

export const layerHeaderTooltip = (layerIndex: number) => (
  <div>
    <div className={styles.heading}>Transformer Layer {layerIndex}</div>
    GPT-2 has <span className={styles.accent}>12 identical layers</span> stacked in sequence. Each
    layer reads the current representation of every token and refines it via attention and a
    feed-forward network.
    <hr className={styles.divider} />
    <div className={styles.note}>
      Information flows through all 12 layers before the final output distribution is computed.
      Earlier layers tend to capture syntax; later layers capture higher-level semantics.
    </div>
  </div>
)

export const lnTooltip = (which: 1 | 2) => (
  <div>
    <div className={styles.heading}>Layer Normalization {which}</div>
    Before the {which === 1 ? 'attention' : 'MLP'} sub-layer, each token&apos;s 768-dim vector is
    normalized so its values have <span className={styles.accent}>mean ≈ 0</span> and{' '}
    <span className={styles.accent}>std ≈ 1</span>.
    <hr className={styles.divider} />
    The bar shows the mean <span className={styles.accent}>vector norm</span> across token positions
    after normalization — a proxy for how much the layer is &quot;working&quot;. Learned scale (γ)
    and shift (β) parameters let the model undo the normalization if needed.
    <div className={styles.note}>
      LayerNorm stabilizes training and prevents activations from exploding or vanishing across deep
      stacks.
    </div>
  </div>
)

export const attnTooltip = () => (
  <div>
    <div className={styles.heading}>Multi-Head Attention</div>
    GPT-2 uses <span className={styles.accent}>12 attention heads </span> per layer. Each head
    independently computes how much every token should &quot;attend to&quot; every earlier token
    (causal mask prevents looking ahead).
    <hr className={styles.divider} />
    Each mini-grid is one head.{' '}
    <span className={styles.accent}>Brighter = stronger attention weight</span>; rows are query
    positions, columns are key positions.
    <div className={styles.note}>
      <span className={styles.accent}>Attention Sinks:</span> A well-documented phenomenon where
      early tokens — especially the very first — accumulate disproportionately high attention weight
      even when semantically irrelevant. Most visible in early layers; thought to act as a{' '}
      &quot;garbage collection&quot; sink for attention mass that must sum to 1.
    </div>
  </div>
)

export const residualTooltip = (position: 'mid' | 'post') => (
  <div>
    <div className={styles.heading}>
      Residual Stream ({position === 'mid' ? 'post-attention' : 'post-MLP'})
    </div>
    The residual connection <span className={styles.accent}>adds</span> the sub-layer output back to
    its input: <span className={styles.accent}>x = x + sublayer(x)</span>. This means information
    from the original embedding is never destroyed — each layer only adds a delta.
    <hr className={styles.divider} />
    Each chip represents one token. Brightness shows how much{' '}
    {position === 'mid' ? 'attention' : 'the MLP'} wrote to that token&apos;s stream this layer (L2
    norm of the write vector, normalized).
    <div className={styles.note}>
      The residual stream is the central data bus of a transformer. Think of it as a scratchpad each
      sub-layer reads from and writes to.
    </div>
  </div>
)

export const mlpTooltip = () => (
  <div>
    <div className={styles.heading}>MLP / Feed-Forward Network</div>
    After attention, each token passes independently through a two-layer MLP:
    <br />
    <span className={styles.accent}>768 → 3,072 → 768</span>
    <hr className={styles.divider} />
    The first linear layer (<span className={styles.accent}>c_fc</span>, in 768 → out 3,072) expands
    the representation; GELU activation introduces non-linearity; the second layer (
    <span className={styles.accent}>c_proj</span>, in 3,072 → out 768) projects back. Each cell in
    the grid is one of the <span className={styles.accent}>3,072 hidden neurons</span>. Brightness =
    post-GELU activation magnitude.
    <div className={styles.note}>
      The MLP is often described as a &quot;key–value memory&quot; — different neurons fire for
      different input patterns learned during training.
    </div>
  </div>
)
