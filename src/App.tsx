import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { BowedStringEngine } from './BowedStringEngine'
import {
  createBowStringSelectionState,
  getBowDirectionForString,
  getPitchInfo,
  isFingerKey,
  positionLabelByName,
  positionNames,
  resetBowStringSelectionState,
  stringAngleByName,
  stringNames,
  type FingerKey,
  type PositionName,
  type ViolinString,
  updateBowStringSelectionState,
} from './pitchMapping'

type BowDirection = -1 | 0 | 1
const MOTION_MOVE_PIXELS = 0.75
const BOW_ON_SPEED = 0.42
const BOW_HOLD_MS = 260
const DIRECTION_ATTACK_MS = 95

const bridgeStringMarks: Record<ViolinString, { x: number; y: number }> = {
  G: { x: 17, y: 63 },
  D: { x: 39, y: 50 },
  A: { x: 61, y: 50 },
  E: { x: 83, y: 63 },
}

const bridgeArcSegments: Array<[ViolinString, ViolinString, number]> = [
  ['G', 'D', 7.6],
  ['D', 'A', 8.5],
  ['A', 'E', 7.6],
]

function getBridgeTangent(stringName: ViolinString) {
  const radians = (stringAngleByName[stringName] * Math.PI) / 180
  return { x: Math.cos(radians), y: -Math.sin(radians) }
}

function makeBridgeArcPath() {
  const start = bridgeStringMarks.G
  const segments = bridgeArcSegments.map(([from, to, scale]) => {
    const fromPoint = bridgeStringMarks[from]
    const toPoint = bridgeStringMarks[to]
    const fromTangent = getBridgeTangent(from)
    const toTangent = getBridgeTangent(to)
    const controlFrom = {
      x: fromPoint.x + fromTangent.x * scale,
      y: fromPoint.y + fromTangent.y * scale,
    }
    const controlTo = {
      x: toPoint.x - toTangent.x * scale,
      y: toPoint.y - toTangent.y * scale,
    }

    return `C ${controlFrom.x.toFixed(1)} ${controlFrom.y.toFixed(1)} ${controlTo.x.toFixed(1)} ${controlTo.y.toFixed(1)} ${toPoint.x} ${toPoint.y}`
  })

  return `M ${start.x} ${start.y} ${segments.join(' ')}`
}

const bridgeArcPath = makeBridgeArcPath()

interface InstrumentState {
  selectedString: ViolinString
  fingerKey: FingerKey | null
  contact: boolean
  bowSpeed: number
  rawSpeed: number
  acceleration: number
  direction: BowDirection
  vibrato: boolean
  position: PositionName
}

const initialState: InstrumentState = {
  selectedString: 'A',
  fingerKey: null,
  contact: false,
  bowSpeed: 0,
  rawSpeed: 0,
  acceleration: 0,
  direction: 0,
  vibrato: false,
  position: 'first',
}

function App() {
  const [instrumentState, setInstrumentState] = useState<InstrumentState>(initialState)
  const stateRef = useRef(instrumentState)
  const engineRef = useRef<BowedStringEngine | null>(null)
  const playAreaRef = useRef<HTMLElement | null>(null)
  const heldKeysRef = useRef<FingerKey[]>([])
  const lastPointerRef = useRef<{ x: number; y: number; time: number; speed: number } | null>(null)
  const bowStringSelectionRef = useRef(createBowStringSelectionState(initialState.selectedString))
  const lastMovementTimeRef = useRef(0)
  const motionStopTimerRef = useRef<number | null>(null)
  const lastBowDirectionRef = useRef<BowDirection>(0)
  const lastDirectionChangeTimeRef = useRef(-100000)
  const audioResumeInFlightRef = useRef(false)
  const audioUnlockedRef = useRef(false)
  const lastEngineStateRef = useRef<{
    frequency: number
    stringName: ViolinString
    speed: number
    acceleration: number
    direction: BowDirection
    contact: boolean
    vibrato: boolean
  } | null>(null)

  const syncEngineNow = useCallback((now = performance.now()) => {
    const current = stateRef.current
    const age = now - lastMovementTimeRef.current
    const bowSpeed = current.contact && current.rawSpeed > 0 && age < BOW_HOLD_MS ? BOW_ON_SPEED : 0
    const attackAge = now - lastDirectionChangeTimeRef.current
    const acceleration = current.acceleration > 0 && attackAge < DIRECTION_ATTACK_MS ? current.acceleration : 0
    const pitchInfo = getPitchInfo(current.selectedString, current.fingerKey, current.position)

    if (Math.abs(bowSpeed - current.bowSpeed) > 0.004 || current.acceleration !== acceleration) {
      stateRef.current.bowSpeed = bowSpeed
      stateRef.current.acceleration = acceleration
    }

    const nextEngineState = {
      frequency: pitchInfo.frequency,
      stringName: pitchInfo.stringName,
      speed: bowSpeed,
      acceleration,
      direction: current.direction,
      contact: current.contact && age < 220,
      vibrato: current.vibrato,
    }
    const previousEngineState = lastEngineStateRef.current
    const engineStateChanged =
      !previousEngineState ||
      Math.abs(nextEngineState.frequency - previousEngineState.frequency) > 0.1 ||
      nextEngineState.stringName !== previousEngineState.stringName ||
      nextEngineState.speed !== previousEngineState.speed ||
      nextEngineState.acceleration !== previousEngineState.acceleration ||
      nextEngineState.direction !== previousEngineState.direction ||
      nextEngineState.contact !== previousEngineState.contact ||
      nextEngineState.vibrato !== previousEngineState.vibrato

    if (engineStateChanged) {
      engineRef.current?.setState(nextEngineState)
      lastEngineStateRef.current = nextEngineState
    }
  }, [])

  function mergeInstrumentRef(update: Partial<InstrumentState>) {
    const previousString = stateRef.current.selectedString
    Object.assign(stateRef.current, update)

    if (update.selectedString && update.selectedString !== previousString) {
      playAreaRef.current?.setAttribute('data-selected-string', update.selectedString)
    }
  }

  function renderInstrumentState(update: Partial<InstrumentState>) {
    const next = { ...stateRef.current, ...update }
    stateRef.current = next
    setInstrumentState(next)
  }

  function clearMotionStopTimer() {
    if (motionStopTimerRef.current !== null) {
      window.clearTimeout(motionStopTimerRef.current)
      motionStopTimerRef.current = null
    }
  }

  function scheduleMotionStop() {
    if (motionStopTimerRef.current !== null) {
      return
    }

    const checkMotion = () => {
      const elapsed = performance.now() - lastMovementTimeRef.current
      if (elapsed < BOW_HOLD_MS) {
        motionStopTimerRef.current = window.setTimeout(checkMotion, BOW_HOLD_MS - elapsed + 4)
        return
      }

      mergeInstrumentRef({ rawSpeed: 0, bowSpeed: 0, acceleration: 0 })
      engineRef.current?.stop()
      lastEngineStateRef.current = null
      motionStopTimerRef.current = null
    }

    motionStopTimerRef.current = window.setTimeout(checkMotion, BOW_HOLD_MS)
  }

  function getPositionStep(currentPosition: PositionName, delta: -1 | 1) {
    const currentIndex = positionNames.indexOf(currentPosition)
    const nextIndex = Math.min(positionNames.length - 1, Math.max(0, currentIndex + delta))
    return positionNames[nextIndex]
  }

  function stepPosition(delta: -1 | 1) {
    const position = getPositionStep(stateRef.current.position, delta)
    renderInstrumentState({ position })
    syncEngineNow()
  }

  function startAudioFromGesture() {
    engineRef.current ??= new BowedStringEngine()
    const engine = engineRef.current
    engine.prime()

    if (engine.getState() === 'running') {
      audioUnlockedRef.current = true
    }

    if (audioUnlockedRef.current) {
      return
    }

    if (audioResumeInFlightRef.current) {
      return
    }

    audioResumeInFlightRef.current = true
    void engine
      .resume()
      .then((state) => {
        const isRunning = state === 'running'
        audioUnlockedRef.current = isRunning
      })
      .catch(() => {
        audioUnlockedRef.current = false
      })
      .finally(() => {
        audioResumeInFlightRef.current = false
      })
  }

  function beginBowContact(clientX: number, clientY: number) {
    const now = performance.now()
    clearMotionStopTimer()
    lastPointerRef.current = { x: clientX, y: clientY, time: now, speed: 0 }
    resetBowStringSelectionState(bowStringSelectionRef.current, stateRef.current.selectedString)
    lastMovementTimeRef.current = now
    lastBowDirectionRef.current = 0
    mergeInstrumentRef({ contact: true, rawSpeed: 0, bowSpeed: 0, acceleration: 0, direction: 0 })
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    startAudioFromGesture()

    if (event.pointerType !== 'mouse') {
      event.preventDefault()
    }

    if (event.pointerType !== 'mouse') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    beginBowContact(event.clientX, event.clientY)
  }

  function handlePlayAreaClick() {
    startAudioFromGesture()
    stepPosition(1)
  }

  function handlePlayAreaContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault()
    startAudioFromGesture()
    stepPosition(-1)
  }

  function handlePointerEnter(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') {
      return
    }

    beginBowContact(event.clientX, event.clientY)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault()

    const now = performance.now()

    if (!stateRef.current.contact || !lastPointerRef.current) {
      lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now, speed: 0 }
      lastMovementTimeRef.current = now
      const initialDx = event.movementX || 0
      const initialDy = event.movementY || 0
      const initialMoved = Math.hypot(initialDx, initialDy) >= MOTION_MOVE_PIXELS
      const selectedString = initialMoved
        ? updateBowStringSelectionState(bowStringSelectionRef.current, initialDx, initialDy)
        : stateRef.current.selectedString
      const direction: BowDirection = initialMoved ? getBowDirectionForString(initialDx, initialDy, selectedString) : 0
      mergeInstrumentRef({
        selectedString,
        contact: true,
        rawSpeed: initialMoved ? BOW_ON_SPEED : 0,
        bowSpeed: initialMoved ? BOW_ON_SPEED : 0,
        acceleration: initialMoved ? 0.55 : 0,
        direction: initialMoved ? direction : 0,
      })
      if (initialMoved) {
        lastBowDirectionRef.current = direction
        scheduleMotionStop()
        syncEngineNow(now)
      }
      return
    }

    const previous = lastPointerRef.current
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    const moved = Math.hypot(dx, dy) >= MOTION_MOVE_PIXELS

    if (!moved) {
      return
    }

    const selectedString = updateBowStringSelectionState(bowStringSelectionRef.current, dx, dy)
    const stringChanged = selectedString !== stateRef.current.selectedString
    const direction: BowDirection = getBowDirectionForString(dx, dy, selectedString)
    const previousDirection = lastBowDirectionRef.current
    const reversedDirection = previousDirection !== 0 && direction !== previousDirection

    lastMovementTimeRef.current = now
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now, speed: BOW_ON_SPEED }
    scheduleMotionStop()

    if (reversedDirection || stringChanged) {
      lastBowDirectionRef.current = direction
      lastDirectionChangeTimeRef.current = now
      mergeInstrumentRef({
        selectedString,
        contact: true,
        rawSpeed: BOW_ON_SPEED,
        bowSpeed: BOW_ON_SPEED,
        acceleration: 1,
        direction,
      })
      syncEngineNow(now)
      return
    }

    lastBowDirectionRef.current = direction

    mergeInstrumentRef({
      selectedString,
      contact: true,
      rawSpeed: BOW_ON_SPEED,
      bowSpeed: BOW_ON_SPEED,
      acceleration: previousDirection === 0 ? 0.55 : 0,
      direction,
    })
    syncEngineNow(now)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (event.pointerType === 'mouse') {
      startAudioFromGesture()
      return
    }

    event.preventDefault()
    stopBowContact()
  }

  function stopBowContact(event?: ReactPointerEvent<HTMLElement>) {
    if (event) {
      event.preventDefault()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }

    engineRef.current?.stop()
    lastEngineStateRef.current = null
    clearMotionStopTimer()
    lastBowDirectionRef.current = 0
    lastPointerRef.current = null
    resetBowStringSelectionState(bowStringSelectionRef.current, stateRef.current.selectedString)
    mergeInstrumentRef({ contact: false, rawSpeed: 0, bowSpeed: 0, acceleration: 0 })
  }

  useEffect(() => {
    engineRef.current ??= new BowedStringEngine()
    engineRef.current.prime()
  }, [])


  useEffect(() => {
    function setFingerFromHeldKeys() {
      const held = heldKeysRef.current
      mergeInstrumentRef({ fingerKey: held.length ? held[held.length - 1] : null })
      syncEngineNow()
    }

    function handleKeyDown(event: KeyboardEvent) {
      const fingerKey = event.key.toLowerCase()

      if (isFingerKey(fingerKey)) {
        event.preventDefault()
        startAudioFromGesture()
        heldKeysRef.current = [...heldKeysRef.current.filter((key) => key !== fingerKey), fingerKey]
        setFingerFromHeldKeys()
        return
      }

      if (event.key === 'Shift') {
        startAudioFromGesture()
        mergeInstrumentRef({ vibrato: true })
        syncEngineNow()
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      const fingerKey = event.key.toLowerCase()

      if (isFingerKey(fingerKey)) {
        event.preventDefault()
        heldKeysRef.current = heldKeysRef.current.filter((key) => key !== fingerKey)
        setFingerFromHeldKeys()
        return
      }

      if (event.key === 'Shift') {
        mergeInstrumentRef({ vibrato: false })
        syncEngineNow()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [syncEngineNow])

  const positionLabel = positionLabelByName[instrumentState.position]

  return (
    <main className="app-shell">
      <header className="suite-topbar" aria-label="Virtual Violin navigation">
        <a className="suite-home" href="https://aolabs.io/" aria-label="aolabs.io">
          <img src="./ao-ink.svg" alt="" />
        </a>
        <a className="suite-app-brand" href="./" aria-label="Virtual Violin home">
          <img className="suite-app-mark" src="./favicon.svg" alt="" />
          <span className="suite-app-name">virtual violin</span>
        </a>
      </header>

      <section className="instrument-shell" aria-label="Virtual Violin instrument">
        <div className="player-region">
          <section
            className="play-area"
            ref={playAreaRef}
            role="application"
            aria-label="Bridge-angle bowing surface."
            onPointerDown={handlePointerDown}
            onPointerEnter={handlePointerEnter}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={stopBowContact}
            onPointerLeave={stopBowContact}
            onClick={handlePlayAreaClick}
            onContextMenu={handlePlayAreaContextMenu}
            data-selected-string={instrumentState.selectedString}
          >
            <svg className="bridge-view" viewBox="0 0 100 100" aria-hidden="true">
              <path className="bridge-curve" d={bridgeArcPath} />
              {stringNames.map((stringName) => {
                const mark = bridgeStringMarks[stringName]
                return (
                  <circle className="bridge-string-point" cx={mark.x} cy={mark.y} r="3.2" key={stringName} />
                )
              })}
            </svg>
          </section>

          <aside
            className="position-readout"
            aria-live="polite"
            onClick={handlePlayAreaClick}
            onContextMenu={handlePlayAreaContextMenu}
          >
            <strong>{positionLabel}</strong>
          </aside>
        </div>

      </section>
    </main>
  )
}

export default App
