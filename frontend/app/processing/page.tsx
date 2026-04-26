'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import InputPanel from '@/components/processing/InputPanel'
import LayerCard from '@/components/processing/LayerCard'
import ResponseView from '@/components/processing/ResponseView'
import RightPanelHeader from '@/components/processing/RightPanelHeader'
import { useProcessingSocket } from '@/hooks/useProcessingSocket'
import { useZoom } from '@/hooks/useZoom'
import type {
  Candidate,
  LayerData,
  LayerState,
  MergeItem,
  OutputToken,
  ProcessState,
  Token,
} from '@/lib/processingTypes'
import styles from './page.module.css'

const NUM_LAYERS = 12

const EMPTY_LAYER_DATA: LayerData = {
  ln1: 0,
  ln2: 0,
  attn: [],
  attn_write: [],
  mlp: [],
  mlp_write: [],
}

function layerDelay(speed: number): number {
  if (speed >= 1) return 0
  return Math.round((1 - speed) * 2440 + 60)
}

function stageDelay(speed: number): number {
  if (speed >= 1) return 0
  return Math.round((1 - speed) * 700 + 25)
}

export default function ProcessPage() {
  const [processState, setProcessState] = useState<ProcessState>('idle')
  const [layerStates, setLayerStates] = useState<LayerState[]>(
    Array(NUM_LAYERS).fill('inactive')
  )
  const [layerData, setLayerData] = useState<LayerData[]>(
    Array.from({ length: NUM_LAYERS }, () => ({ ...EMPTY_LAYER_DATA }))
  )
  const [inputTokens, setInputTokens] = useState<Token[]>([])
  const [outputTokens, setOutputTokens] = useState<OutputToken[]>([])
  const [embedVectors, setEmbedVectors] = useState<Record<number, number[]>>({})
  const [mergeStageIndex, setMergeStageIndex] = useState<number>(0)
  const [mergeStages, setMergeStages] = useState<MergeItem[][]>([])
  const [isStepMode, setIsStepMode] = useState(false)
  const [speed, setSpeed] = useState(0.75)
  const [awaitingStep, setAwaitingStep] = useState(false)
  const [tokenGenCount, setTokenGenCount] = useState(0)
  const [view, setView] = useState<'layers' | 'stream'>('layers')
  const [streamLive, setStreamLive] = useState(false)
  const [lastPrompt, setLastPrompt] = useState('')

  const { zoom, zoomIn, zoomOut, containerRef } = useZoom()

  const speedRef = useRef(0.75)
  const mergeStagesRef = useRef<MergeItem[][]>([])
  // animTimeoutRef: BPE animation chain only — never shared with next-pass timer
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // animGenRef: incremented on clearAnim to invalidate orphaned nextStage closures
  const animGenRef = useRef(0)
  // nextPassTimeoutRef: onDone inter-pass delay — kept separate from animTimeoutRef
  const nextPassTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokenGenRef = useRef(0)
  const isStepModeRef = useRef(false)
  const awaitingStepRef = useRef(false)
  const seqLenRef = useRef(0)
  const pendingCandidatesRef = useRef<Candidate[]>([])
  const currentSequenceRef = useRef('')
  const socketRunRef = useRef<(text: string) => void>(() => {})
  // Populated after startMergeAnimation is defined; called from onTokens once all merge_stage frames have arrived.
  const startMergeAnimationRef = useRef<() => void>(() => {})
  // True once the merge animation has completed (or never started). Gates output token display.
  const mergeAnimCompleteRef = useRef(true)
  // Holds the onDone proceed callback if it arrives before the merge animation finishes.
  const pendingDoneCallbackRef = useRef<(() => void) | null>(null)
  const cancelledRef = useRef(false)

  const socket = useProcessingSocket(
    {
      onMergeStage: (items: MergeItem[]) => {
        if (tokenGenRef.current === 0) {
          mergeStagesRef.current = [...mergeStagesRef.current, items]
          setMergeStages((prev) => [...prev, items])
        }
      },
      onTokens: (tokens: Token[]) => {
        if (tokenGenRef.current === 0) {
          setInputTokens(tokens)
          mergeAnimCompleteRef.current = false
          startMergeAnimationRef.current()
        }
        seqLenRef.current = tokens.length
      },
      onEmbed: (tokenIdx: number, vector: number[]) => {
        if (tokenGenRef.current === 0) {
          setEmbedVectors((prev) => ({ ...prev, [tokenIdx]: vector }))
        }
      },
      onLayerStart: (idx: number) => {
        setLayerStates((prev) => {
          const next = [...prev]
          if (idx > 0) next[idx - 1] = 'done'
          next[idx] = 'processing'
          for (let i = idx + 1; i < NUM_LAYERS; i++) next[i] = 'inactive'
          return next
        })
      },
      onLayerComplete: (idx: number, data: LayerData) => {
        setLayerData((prev) => {
          const next = [...prev]
          next[idx] = data
          return next
        })
      },
      onOutput: (candidates: Candidate[]) => {
        pendingCandidatesRef.current = candidates
      },
      onDone: () => {
        const proceed = () => {
          setLayerStates(Array(NUM_LAYERS).fill('done'))
          setStreamLive(false)

          const candidates = pendingCandidatesRef.current
          if (candidates.length === 0) {
            setProcessState('done')
            return
          }

          const top = candidates[0]
          const newToken: OutputToken = {
            text: top.text,
            id: top.id,
            candidates,
          }
          setOutputTokens((prev) => [...prev, newToken])

          const count = tokenGenRef.current + 1
          tokenGenRef.current = count
          setTokenGenCount(count)

          currentSequenceRef.current += top.text
          seqLenRef.current += 1

          if (isStepModeRef.current) {
            setProcessState('done')
            setAwaitingStep(true)
            awaitingStepRef.current = true
          } else if (cancelledRef.current) {
            setProcessState('done')
          } else {
            const d = layerDelay(speedRef.current)
            nextPassTimeoutRef.current = setTimeout(() => {
              if (cancelledRef.current) {
                setProcessState('done')
                return
              }
              setProcessState('computing')
              setStreamLive(true)
              socketRunRef.current(currentSequenceRef.current)
            }, d)
          }
        }

        if (!mergeAnimCompleteRef.current) {
          pendingDoneCallbackRef.current = proceed
        } else {
          proceed()
        }
      },
      onError: () => setStreamLive(false),
    },
    speedRef
  )
  socketRunRef.current = socket.run

  const clearAnim = useCallback(() => {
    animGenRef.current += 1
    mergeAnimCompleteRef.current = true
    if (animTimeoutRef.current !== null) {
      clearTimeout(animTimeoutRef.current)
      animTimeoutRef.current = null
    }
  }, [])

  const resetAll = useCallback(() => {
    clearAnim()
    if (nextPassTimeoutRef.current !== null) {
      clearTimeout(nextPassTimeoutRef.current)
      nextPassTimeoutRef.current = null
    }
    setProcessState('idle')
    setLayerStates(Array(NUM_LAYERS).fill('inactive'))
    setLayerData(
      Array.from({ length: NUM_LAYERS }, () => ({ ...EMPTY_LAYER_DATA }))
    )
    setInputTokens([])
    setOutputTokens([])
    setEmbedVectors({})
    setMergeStages([])
    mergeStagesRef.current = []
    setMergeStageIndex(0)
    setAwaitingStep(false)
    setTokenGenCount(0)
    tokenGenRef.current = 0
    awaitingStepRef.current = false
    cancelledRef.current = false
    seqLenRef.current = 0
    pendingCandidatesRef.current = []
    pendingDoneCallbackRef.current = null
    currentSequenceRef.current = ''
    setStreamLive(false)
    setLastPrompt('')
  }, [clearAnim])

  // Called when the backend has sent all merge_stage frames (signalled by the tokens frame arriving).
  // Animates through the real BPE stages accumulated in mergeStagesRef, then transitions to computing.
  const startMergeAnimation = useCallback(() => {
    const myGen = animGenRef.current
    let stageIdx = 0

    function nextStage() {
      if (animGenRef.current !== myGen) return
      stageIdx++
      if (stageIdx >= mergeStagesRef.current.length) {
        setProcessState('embedding')
        const d = stageDelay(speedRef.current)
        animTimeoutRef.current = setTimeout(
          () => {
            if (animGenRef.current !== myGen) return
            setProcessState('computing')
            mergeAnimCompleteRef.current = true
            const cb = pendingDoneCallbackRef.current
            if (cb) {
              pendingDoneCallbackRef.current = null
              cb()
            }
          },
          speedRef.current >= 1 ? 0 : d + seqLenRef.current * 15 + 40
        )
        return
      }
      setMergeStageIndex(stageIdx)
      const d = stageDelay(speedRef.current)
      animTimeoutRef.current = setTimeout(nextStage, d)
    }

    const d = stageDelay(speedRef.current)
    animTimeoutRef.current = setTimeout(nextStage, d)
  }, [])

  startMergeAnimationRef.current = startMergeAnimation

  const startRun = useCallback(() => {
    clearAnim()
    setAwaitingStep(false)
    awaitingStepRef.current = false

    if (tokenGenRef.current > 0) {
      setProcessState('computing')
      return
    }

    // First pass: show tokenizing state. merge_stage frames will arrive from socket,
    // and startMergeAnimation is triggered by onTokens once all stages are buffered.
    setProcessState('tokenizing')
    setInputTokens([])
    setOutputTokens([])
    setMergeStageIndex(0)
  }, [clearAnim])

  const handleRun = useCallback(
    (text: string) => {
      resetAll()
      const promptText = text.trim()
      setLastPrompt(promptText)
      currentSequenceRef.current = promptText
      seqLenRef.current = promptText.split(/\s+/).filter(Boolean).length || 1
      requestAnimationFrame(() => {
        tokenGenRef.current = 0
        setStreamLive(true)
        startRun()
        socket.run(promptText)
      })
    },
    [resetAll, startRun, socket]
  )

  const handleCancel = useCallback(() => {
    cancelledRef.current = true
    clearAnim()
    if (nextPassTimeoutRef.current !== null) {
      clearTimeout(nextPassTimeoutRef.current)
      nextPassTimeoutRef.current = null
    }
    socket.cancel()
    setProcessState('done')
    setStreamLive(false)
  }, [clearAnim, socket])

  const handleStepNext = useCallback(() => {
    if (!awaitingStepRef.current) return
    setAwaitingStep(false)
    awaitingStepRef.current = false
    setProcessState('computing')
    setStreamLive(true)
    socketRunRef.current(currentSequenceRef.current)
  }, [])

  const handleToggleMode = useCallback((mode: 'stream' | 'step') => {
    setIsStepMode(mode === 'step')
    isStepModeRef.current = mode === 'step'
  }, [])

  const handleSpeedChange = useCallback(
    (v: number) => {
      setSpeed(v)
      speedRef.current = v
      socket.notifySpeedChange()
    },
    [socket]
  )

  const allTokenTexts = useMemo(
    () => [
      ...inputTokens.map((t) => t.text),
      ...outputTokens.map((t) => t.text),
    ],
    [inputTokens, outputTokens]
  )

  // Suppress layer highlight during tokenizing/embedding so layers don't
  // light up before the merge animation finishes (production timing issue:
  // backend flushes all frames before animation completes).
  const displayLayerStates: LayerState[] =
    processState === 'tokenizing' || processState === 'embedding'
      ? (Array(NUM_LAYERS).fill('inactive') as LayerState[])
      : layerStates

  return (
    <div className={styles.app}>
      <div className={styles.leftPanel}>
        <InputPanel
          onRun={handleRun}
          onCancel={handleCancel}
          onReset={resetAll}
          state={processState}
          inputTokens={inputTokens}
          outputTokens={outputTokens}
          embedVectors={embedVectors}
          mergeStageIndex={mergeStageIndex}
          mergeStages={mergeStages}
          isStepMode={isStepMode}
          onToggleMode={handleToggleMode}
          speed={speed}
          onSpeedChange={handleSpeedChange}
          onStepNext={handleStepNext}
          awaitingStep={awaitingStep}
          speedRef={speedRef}
        />
      </div>

      <div className={styles.rightPanel} ref={containerRef}>
        <RightPanelHeader
          tokenGenCount={tokenGenCount}
          view={view}
          zoom={zoom}
          streamLive={
            (processState === 'tokenizing' ||
              processState === 'embedding' ||
              processState === 'computing') &&
            socket.isConnected
          }
          isRunning={
            processState === 'tokenizing' ||
            processState === 'embedding' ||
            processState === 'computing'
          }
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onViewChange={setView}
        />

        {view === 'layers' && (
          <div className={styles.layersScroll}>
            <div className={styles.layersContent} style={{ zoom }}>
              {layerData.map((data, i) => (
                <LayerCard
                  key={`layer-${i}`}
                  layerIndex={i}
                  state={displayLayerStates[i]}
                  data={data}
                  tokens={allTokenTexts}
                  isDecoding={tokenGenCount > 0}
                />
              ))}
            </div>
          </div>
        )}

        {view === 'stream' && (
          <ResponseView
            inputTokens={inputTokens}
            outputTokens={outputTokens}
            processState={processState}
            streamLive={streamLive && socket.isConnected}
            promptText={lastPrompt}
          />
        )}
      </div>
    </div>
  )
}
