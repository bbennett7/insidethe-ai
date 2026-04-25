import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Candidate,
  LayerComponent,
  LayerData,
  MergeItem,
  RawCandidate,
  ServerMessage,
  Token,
} from '@/lib/processingTypes'

const LAYER_COMPONENTS: LayerComponent[] = [
  'ln1',
  'attn',
  'attn_write',
  'ln2',
  'mlp',
  'mlp_write',
]

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws'

export interface ProcessingSocketHandlers {
  onMergeStage: (items: MergeItem[]) => void
  onTokens: (tokens: Token[]) => void
  onEmbed: (tokenIdx: number, vector: number[]) => void
  onLayerStart: (layerIdx: number) => void
  onLayerComplete: (layerIdx: number, data: LayerData) => void
  onOutput: (candidates: Candidate[]) => void
  onDone: () => void
  onRawMessage?: (msg: ServerMessage) => void
  onError?: (err: Event) => void
}

export interface ProcessingSocketReturn {
  run: (text: string) => void
  cancel: () => void
  notifySpeedChange: () => void
  isConnected: boolean
}

function layerComponentDelay(speed: number): number {
  if (speed >= 1) return 0
  return Math.round((1 - speed) * (2440 / 6) + 10)
}

function mergeComponent(
  partial: Partial<LayerData>,
  msg: Extract<ServerMessage, { type: 'layer' }>
): Partial<LayerData> {
  switch (msg.component) {
    case 'ln1':
      return { ...partial, ln1: msg.data }
    case 'ln2':
      return { ...partial, ln2: msg.data }
    case 'attn':
      return { ...partial, attn: msg.data.weights }
    case 'attn_write':
      return { ...partial, attn_write: msg.data }
    case 'mlp':
      return { ...partial, mlp: msg.data }
    case 'mlp_write':
      return { ...partial, mlp_write: msg.data }
  }
}

function remapCandidates(raw: RawCandidate[]): Candidate[] {
  return raw.map((c) => ({ text: c.text, id: c.id, probability: c.prob }))
}

type QueueEntry = ServerMessage & { _gen: number }

export function useProcessingSocket(
  handlers: ProcessingSocketHandlers,
  speedRef: React.MutableRefObject<number>
): ProcessingSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const queueRef = useRef<QueueEntry[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partialLayersRef = useRef<Map<number, Partial<LayerData>>>(new Map())
  const receivedRef = useRef<Map<number, Set<LayerComponent>>>(new Map())
  const generationRef = useRef(0)
  const cancelledRef = useRef(false)
  // Stable ref to handlers so processNext never captures stale callbacks
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const [isConnected, setIsConnected] = useState(false)

  function dispatch(msg: ServerMessage) {
    handlersRef.current.onRawMessage?.(msg)

    if (msg.type === 'merge_stage') {
      handlersRef.current.onMergeStage(msg.items)
      return
    }

    if (msg.type === 'tokens') {
      handlersRef.current.onTokens(msg.data)
      return
    }

    if (msg.type === 'embed') {
      handlersRef.current.onEmbed(msg.token_idx, msg.data)
      return
    }

    if (msg.type === 'layer') {
      const idx = msg.layer
      const received = receivedRef.current.get(idx)
      // Guard: ignore messages for layers that already completed
      if (received && LAYER_COMPONENTS.every((c) => received.has(c))) return

      const partial = partialLayersRef.current.get(idx) ?? {}
      const rcv = received ?? new Set<LayerComponent>()

      if (rcv.size === 0) handlersRef.current.onLayerStart(idx)

      const next = mergeComponent(partial, msg)
      partialLayersRef.current.set(idx, next)
      rcv.add(msg.component)
      receivedRef.current.set(idx, rcv)

      if (LAYER_COMPONENTS.every((c) => rcv.has(c))) {
        handlersRef.current.onLayerComplete(idx, next as LayerData)
        partialLayersRef.current.delete(idx)
        receivedRef.current.delete(idx)
      }
      return
    }

    if (msg.type === 'output') {
      handlersRef.current.onOutput(remapCandidates(msg.data))
      return
    }

    if (msg.type === 'done') {
      handlersRef.current.onDone()
      return
    }

    // hello and error are handled at the transport level; nothing to dispatch
  }

  const processNext = useCallback(() => {
    if (cancelledRef.current || queueRef.current.length === 0) {
      timerRef.current = null
      return
    }

    const entry = queueRef.current.shift()!
    if (entry._gen !== generationRef.current) {
      // Stale message from a previous run — skip and keep draining
      timerRef.current = setTimeout(processNext, 0)
      return
    }

    dispatch(entry)

    const delay = entry.type === 'layer' ? layerComponentDelay(speedRef.current) : 0
    timerRef.current = setTimeout(processNext, delay)
  }, []) // empty deps — all mutable values accessed through refs

  const run = useCallback(
    (text: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      generationRef.current += 1
      cancelledRef.current = false
      queueRef.current = []
      partialLayersRef.current.clear()
      receivedRef.current.clear()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      wsRef.current.send(JSON.stringify({ type: 'run', text }))
    },
    []
  )

  const cancel = useCallback(() => {
    cancelledRef.current = true
    queueRef.current = []
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const notifySpeedChange = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(processNext, layerComponentDelay(speedRef.current))
    }
  }, [processNext])

  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => setIsConnected(true)

    ws.onmessage = (e: MessageEvent) => {
      let parsed: ServerMessage
      try {
        parsed = JSON.parse(e.data as string) as ServerMessage
      } catch {
        return
      }
      // hello is a one-time handshake; don't enqueue it for playback
      if (parsed.type === 'hello') return
      queueRef.current.push({ ...parsed, _gen: generationRef.current })
      if (timerRef.current === null && !cancelledRef.current) {
        timerRef.current = setTimeout(processNext, 0)
      }
    }

    ws.onclose = () => setIsConnected(false)

    ws.onerror = (e) => {
      setIsConnected(false)
      handlersRef.current.onError?.(e)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ws.close()
    }
  }, [processNext])

  return { run, cancel, notifySpeedChange, isConnected }
}
