'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScrollArea from '@/components/ScrollArea'
import type { OutputToken, ProcessState, Token } from '@/lib/processingTypes'
import styles from './ResponseView.module.css'

// ── Syntax highlighter ────────────────────────────────────────────────────

type SegCls = 'jKey' | 'jStr' | 'jNum' | 'jKw' | 'jPunct'

function tokenizeJson(json: string): Array<{ t: string; c: SegCls }> {
  const out: Array<{ t: string; c: SegCls }> = []
  const re =
    /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(true|false|null)|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  let pos = 0
  let m: RegExpExecArray | null = re.exec(json)
  while (m !== null) {
    if (m.index > pos) out.push({ t: json.slice(pos, m.index), c: 'jPunct' })
    if (m[1] !== undefined) {
      out.push({ t: m[1], c: 'jKey' })
      out.push({ t: m[2], c: 'jPunct' })
    } else if (m[3] !== undefined) {
      out.push({ t: m[3], c: 'jStr' })
    } else if (m[4] !== undefined) {
      out.push({ t: m[4], c: 'jKw' })
    } else if (m[5] !== undefined) {
      out.push({ t: m[5], c: 'jNum' })
    }
    pos = m.index + m[0].length
    m = re.exec(json)
  }
  if (pos < json.length) out.push({ t: json.slice(pos), c: 'jPunct' })
  return out
}

const S = styles as Record<string, string>

// Pretty-printed block (request pane)
function JsonBlock({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2)
  const segs = useMemo(() => tokenizeJson(json), [json])
  return (
    <pre className={styles.jsonPre}>
      {segs.map((s, i) => (
        <span key={i} className={S[s.c]}>
          {s.t}
        </span>
      ))}
    </pre>
  )
}

// Compact inline JSON (one SSE chunk)
function JsonInline({ value }: { value: unknown }) {
  const json = JSON.stringify(value)
  const segs = useMemo(() => tokenizeJson(json), [json])
  return (
    <>
      {segs.map((s, i) => (
        <span key={i} className={S[s.c]}>
          {s.t}
        </span>
      ))}
    </>
  )
}

// ── Data builders ─────────────────────────────────────────────────────────

function buildRequest(text: string) {
  return { type: 'run', text }
}

function buildChunk(
  id: string,
  tok: OutputToken,
  index: number,
  promptLen: number,
  isLast: boolean
) {
  const TOP = 3
  const chosen = tok.candidates.find((c) => c.text === tok.text) ?? tok.candidates[0]
  return {
    id,
    object: 'text_completion.chunk',
    model: 'gpt2',
    choices: [
      {
        delta: { content: tok.text },
        index: 0,
        finish_reason: isLast ? 'length' : null,
        logprobs: {
          tokens: [tok.text],
          token_logprobs: [chosen ? parseFloat(Math.log(chosen.probability).toFixed(4)) : null],
          top_logprobs: [
            Object.fromEntries(
              tok.candidates
                .slice(0, TOP)
                .map((c) => [c.text, parseFloat(Math.log(c.probability).toFixed(4))])
            ),
          ],
        },
      },
    ],
    usage: {
      prompt_tokens: promptLen,
      completion_tokens: index + 1,
      total_tokens: promptLen + index + 1,
    },
  }
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface ResponseViewProps {
  inputTokens: Token[]
  outputTokens: OutputToken[]
  processState: ProcessState
  streamLive: boolean
  promptText: string
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ResponseView({
  inputTokens,
  outputTokens,
  processState,
  streamLive,
  promptText,
}: ResponseViewProps) {
  const isIdle = processState === 'idle'
  const isDone = processState === 'done'
  const isRunning =
    streamLive ||
    processState === 'tokenizing' ||
    processState === 'embedding' ||
    processState === 'computing'

  const hasStarted = !isIdle || inputTokens.length > 0 || outputTokens.length > 0

  const completionId =
    inputTokens.length > 0 ? `cmpl-${inputTokens[0].id}-${inputTokens.length}` : 'cmpl-pending'

  const requestObj = useMemo(
    () => buildRequest(promptText || inputTokens.map((t) => t.text).join('')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [promptText, inputTokens.length]
  )

  const chunks = useMemo(
    () =>
      outputTokens.map((tok, i) =>
        buildChunk(
          completionId,
          tok,
          i,
          inputTokens.length,
          isDone && i === outputTokens.length - 1
        )
      ),
    [outputTokens, completionId, inputTokens.length, isDone]
  )

  // Auto-scroll only when the user is already near the bottom
  const responseBoxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = responseBoxRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 80) el.scrollTop = el.scrollHeight
  }, [outputTokens.length, isDone])

  const [format, setFormat] = useState<'inline' | 'pretty'>('inline')

  // Copy-to-clipboard for the response stream
  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleCopy = useCallback(() => {
    const lines = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`)
    if (isDone && outputTokens.length > 0) lines.push('data: [DONE]')
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
      copyTimeout.current = setTimeout(() => setCopied(false), 1800)
    })
  }, [chunks, isDone, outputTokens.length])

  return (
    <div className={styles.panel}>
      {/* Status row */}
      <div className={styles.statusRow}>
        {isRunning ? (
          <span className={styles.statusLive}>
            <span className={styles.statusDot} />
            generating
          </span>
        ) : isDone && outputTokens.length > 0 ? (
          <span className={styles.statusDone}>
            {outputTokens.length} token{outputTokens.length !== 1 ? 's' : ''} generated
          </span>
        ) : null}
      </div>

      {/* Content — columns always visible */}
      <div className={styles.columns}>
        {/* Left: request (static, pretty-printed) */}
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <div className={styles.blockLabel}>Request</div>
          </div>
          <ScrollArea className={styles.codeBox}>
            {hasStarted ? (
              <JsonBlock value={requestObj} />
            ) : (
              <span className={styles.placeholder}>run a prompt to see the API response</span>
            )}
          </ScrollArea>
        </div>

        {/* Right: response stream (SSE chunks accumulating) */}
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <div className={styles.blockLabel}>Response stream</div>
            <div className={styles.blockHeaderRight}>
              <div className={styles.formatToggle}>
                <button
                  type="button"
                  className={`${styles.formatBtn}${format === 'inline' ? ` ${styles.formatBtnActive}` : ''}`}
                  onClick={() => setFormat('inline')}
                >
                  inline
                </button>
                <button
                  type="button"
                  className={`${styles.formatBtn}${format === 'pretty' ? ` ${styles.formatBtnActive}` : ''}`}
                  onClick={() => setFormat('pretty')}
                >
                  pretty
                </button>
              </div>
              <button
                type="button"
                className={`${styles.copyBtn}${copied ? ` ${styles.copyBtnDone}` : ''}`}
                onClick={handleCopy}
                disabled={outputTokens.length === 0}
                aria-label="Copy stream"
              >
                {copied ? (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <rect
                      x="4"
                      y="1"
                      width="7"
                      height="8"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M8 1V1C8 1 8 3 6 3H1.5C1.22 3 1 3.22 1 3.5V10.5C1 10.78 1.22 11 1.5 11H8C8.28 11 8.5 10.78 8.5 10.5V3"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {copied ? 'copied' : 'copy'}
              </button>
            </div>
          </div>
          <ScrollArea className={styles.codeBox} ref={responseBoxRef}>
            {outputTokens.length === 0 && !isRunning ? (
              <span className={styles.waiting}>waiting…</span>
            ) : (
              <div className={styles.streamLog}>
                {outputTokens.map((tok, i) => {
                  const chunk = chunks[i]
                  return (
                    <div key={`chunk-${i}-${tok.id}`} className={styles.streamEntry}>
                      <div className={styles.streamComment}>
                        res no. {i + 1}{' '}
                        <span className={styles.streamCommentToken}>{tok.text}</span>
                      </div>
                      {format === 'inline' ? (
                        <>
                          <span className={styles.dataPrefix}>data: </span>
                          <JsonInline value={chunk} />
                        </>
                      ) : (
                        <>
                          <span className={styles.dataPrefix}>data:</span>
                          <JsonBlock value={chunk} />
                        </>
                      )}
                    </div>
                  )
                })}

                {isDone && outputTokens.length > 0 && (
                  <div className={styles.streamEntry}>
                    <span className={styles.dataPrefix}>data: </span>
                    <span className={S.jPunct}>[DONE]</span>
                  </div>
                )}

                {isRunning && <span className={styles.cursor} aria-hidden="true" />}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
