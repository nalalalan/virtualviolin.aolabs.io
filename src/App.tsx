import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { BowedStringEngine } from './BowedStringEngine'
import {
  getPitchInfo,
  getStringForRatio,
  isFingerKey,
  keySignatures,
  positionLabelByName,
  positionNames,
  stringNames,
  type FingerKey,
  type KeySignature,
  type PositionName,
  type ViolinString,
} from './pitchMapping'

type BowDirection = -1 | 0 | 1
const STRING_BOUNDARY_GRACE = 0.055
const MOTION_MOVE_PIXELS = 0.75
const BOW_ON_SPEED = 0.42
const BOW_HOLD_MS = 260
const DIRECTION_ATTACK_MS = 95

const staffLineYs = [10, 17, 24, 31, 38] as const
const sharpStaffYs = [10, 20.5, 6.5, 17, 27.5, 13.5, 24] as const
const flatStaffYs = [24, 13.5, 27.5, 17, 31, 20.5, 34.5] as const

function makeKeySignatureMarks(accidental: 'sharp' | 'flat', count: number) {
  const staffYs = accidental === 'sharp' ? sharpStaffYs : flatStaffYs
  return staffYs.slice(0, count).map((y) => ({ accidental, y }))
}

const keySignatureMarks: Record<KeySignature, Array<{ accidental: 'sharp' | 'flat'; y: number }>> = {
  C: [],
  G: makeKeySignatureMarks('sharp', 1),
  D: makeKeySignatureMarks('sharp', 2),
  A: makeKeySignatureMarks('sharp', 3),
  E: makeKeySignatureMarks('sharp', 4),
  F: makeKeySignatureMarks('flat', 1),
  Bb: makeKeySignatureMarks('flat', 2),
  Eb: makeKeySignatureMarks('flat', 3),
}

interface InstrumentState {
  selectedString: ViolinString
  fingerKey: FingerKey | null
  pointerRatio: number
  contact: boolean
  bowSpeed: number
  rawSpeed: number
  acceleration: number
  direction: BowDirection
  vibrato: boolean
  position: PositionName
  keySignature: KeySignature
}

const initialState: InstrumentState = {
  selectedString: 'A',
  fingerKey: null,
  pointerRatio: 0.62,
  contact: false,
  bowSpeed: 0,
  rawSpeed: 0,
  acceleration: 0,
  direction: 0,
  vibrato: false,
  position: 'first',
  keySignature: 'D',
}

function App() {
  const [instrumentState, setInstrumentState] = useState<InstrumentState>(initialState)
  const stateRef = useRef(instrumentState)
  const engineRef = useRef<BowedStringEngine | null>(null)
  const playAreaRef = useRef<HTMLElement | null>(null)
  const heldKeysRef = useRef<FingerKey[]>([])
  const lastPointerRef = useRef<{ x: number; y: number; time: number; speed: number } | null>(null)
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

  function mergeInstrumentRef(update: Partial<InstrumentState>) {
    stateRef.current = { ...stateRef.current, ...update }
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

  function scheduleMotionStop(movementTime: number) {
    clearMotionStopTimer()
    motionStopTimerRef.current = window.setTimeout(() => {
      if (lastMovementTimeRef.current !== movementTime) {
        return
      }

      mergeInstrumentRef({ rawSpeed: 0, bowSpeed: 0, acceleration: 0 })
      engineRef.current?.stop()
      lastEngineStateRef.current = null
      motionStopTimerRef.current = null
    }, BOW_HOLD_MS)
  }

  function getPositionStep(currentPosition: PositionName, delta: -1 | 1) {
    const currentIndex = positionNames.indexOf(currentPosition)
    const nextIndex = Math.min(positionNames.length - 1, Math.max(0, currentIndex + delta))
    return positionNames[nextIndex]
  }

  function stepPosition(delta: -1 | 1) {
    const position = getPositionStep(stateRef.current.position, delta)
    renderInstrumentState({ position })
  }

  function getPointerRatio(clientX: number) {
    const rect = playAreaRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) {
      return stateRef.current.pointerRatio
    }

    return Math.min(0.999999, Math.max(0, (clientX - rect.left) / rect.width))
  }

  function getStableStringForRatio(pointerRatio: number) {
    const directString = getStringForRatio(pointerRatio)
    const currentString = stateRef.current.selectedString
    const directIndex = stringNames.indexOf(directString)
    const currentIndex = stringNames.indexOf(currentString)

    if (directIndex === currentIndex || directIndex === -1 || currentIndex === -1) {
      return directString
    }

    if (Math.abs(directIndex - currentIndex) > 1) {
      return directString
    }

    if (directIndex > currentIndex) {
      const lowerBoundary = (currentIndex + 1) / stringNames.length
      return pointerRatio > lowerBoundary + STRING_BOUNDARY_GRACE ? directString : currentString
    }

    const upperBoundary = currentIndex / stringNames.length
    return pointerRatio < upperBoundary - STRING_BOUNDARY_GRACE ? directString : currentString
  }

  function updateStringFromPointer(clientX: number) {
    const pointerRatio = getPointerRatio(clientX)
    const previousString = stateRef.current.selectedString
    const directString = getStringForRatio(pointerRatio)
    const selectedString = getStableStringForRatio(pointerRatio)
    mergeInstrumentRef({ pointerRatio, selectedString })
    if (selectedString !== previousString) {
      renderInstrumentState({ pointerRatio, selectedString })
    }

    return { directString, previousString, selectedString }
  }

  function startAudioFromGesture() {
    if (audioUnlockedRef.current) {
      return
    }

    engineRef.current ??= new BowedStringEngine()
    const engine = engineRef.current

    if (audioResumeInFlightRef.current) {
      return
    }

    audioResumeInFlightRef.current = true
    const timeoutId = window.setTimeout(() => {
      audioResumeInFlightRef.current = false
      const state = engine.getState()
      const isRunning = state === 'running'
      audioUnlockedRef.current = isRunning
    }, 700)

    void engine
      .resume()
      .then((state) => {
        window.clearTimeout(timeoutId)
        const isRunning = state === 'running'
        audioUnlockedRef.current = isRunning
      })
      .catch(() => {
        window.clearTimeout(timeoutId)
        audioUnlockedRef.current = false
      })
      .finally(() => {
        audioResumeInFlightRef.current = false
      })
  }

  function beginBowContact(clientX: number, clientY: number) {
    const now = performance.now()
    clearMotionStopTimer()
    updateStringFromPointer(clientX)
    lastPointerRef.current = { x: clientX, y: clientY, time: now, speed: 0 }
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
    updateStringFromPointer(event.clientX)

    if (!stateRef.current.contact || !lastPointerRef.current) {
      lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now, speed: 0 }
      lastMovementTimeRef.current = now
      mergeInstrumentRef({ contact: true, rawSpeed: 0, bowSpeed: 0, acceleration: 0, direction: 0 })
      return
    }

    const previous = lastPointerRef.current
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    const moved = Math.hypot(dx, dy) >= MOTION_MOVE_PIXELS

    if (!moved) {
      return
    }

    const direction: BowDirection = Math.abs(dx) < 0.5 ? lastBowDirectionRef.current : dx < 0 ? -1 : 1
    const previousDirection = lastBowDirectionRef.current
    const reversedDirection = previousDirection !== 0 && direction !== 0 && direction !== previousDirection

    lastMovementTimeRef.current = now
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now, speed: BOW_ON_SPEED }
    scheduleMotionStop(now)

    if (reversedDirection) {
      lastBowDirectionRef.current = direction
      lastDirectionChangeTimeRef.current = now
      mergeInstrumentRef({
        contact: true,
        rawSpeed: BOW_ON_SPEED,
        bowSpeed: BOW_ON_SPEED,
        acceleration: 1,
        direction,
      })
      return
    }

    if (direction !== 0) {
      lastBowDirectionRef.current = direction
    }

    mergeInstrumentRef({
      contact: true,
      rawSpeed: BOW_ON_SPEED,
      bowSpeed: BOW_ON_SPEED,
      acceleration: previousDirection === 0 && direction !== 0 ? 0.55 : 0,
      direction,
    })
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
    mergeInstrumentRef({ contact: false, rawSpeed: 0, bowSpeed: 0, acceleration: 0 })
  }

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent) {
      if (!stateRef.current.contact || event.pointerType !== 'mouse') {
        return
      }

      const rect = playAreaRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

      const insidePlayArea =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom

      if (!insidePlayArea) {
        engineRef.current?.stop()
        lastEngineStateRef.current = null
        clearMotionStopTimer()
        lastBowDirectionRef.current = 0
        lastPointerRef.current = null
        mergeInstrumentRef({ contact: false, rawSpeed: 0, bowSpeed: 0, acceleration: 0 })
      }
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    return () => window.removeEventListener('pointermove', handleWindowPointerMove)
  }, [])

  useEffect(() => {
    function setFingerFromHeldKeys() {
      const held = heldKeysRef.current
      mergeInstrumentRef({ fingerKey: held.length ? held[held.length - 1] : null })
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
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    let frameId = 0

    function animate(now: number) {
      const current = stateRef.current
      const age = now - lastMovementTimeRef.current
      const bowSpeed = current.contact && current.rawSpeed > 0 && age < BOW_HOLD_MS ? BOW_ON_SPEED : 0
      const attackAge = now - lastDirectionChangeTimeRef.current
      const acceleration = current.acceleration > 0 && attackAge < DIRECTION_ATTACK_MS ? current.acceleration : 0
      const pitchInfo = getPitchInfo(current.selectedString, current.fingerKey, current.position, current.keySignature)

      if (Math.abs(bowSpeed - current.bowSpeed) > 0.004 || (!current.contact && current.bowSpeed !== 0)) {
        mergeInstrumentRef({ bowSpeed, acceleration })
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

      frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [])

  const positionLabel = positionLabelByName[instrumentState.position]

  function renderKeySignature(signature: KeySignature) {
    return (
      <svg className="key-staff" viewBox="0 0 82 48" aria-hidden="true">
        {staffLineYs.map((y) => (
          <line className="staff-line" x1="6" x2="76" y1={y} y2={y} key={y} />
        ))}
        <text className="key-clef" x="16" y="27">
          {'\uD834\uDD1E'}
        </text>
        {keySignatureMarks[signature].map((mark, index) => (
          <text
            className="key-accidental"
            x={36 + index * 8.75}
            y={mark.y}
            key={`${mark.accidental}-${index}`}
          >
            {mark.accidental === 'sharp' ? '\u266F' : '\u266D'}
          </text>
        ))}
      </svg>
    )
  }

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
            aria-label="Mouse bowing surface. Left to right strings are G, D, A, and E."
            onPointerDown={handlePointerDown}
            onPointerEnter={handlePointerEnter}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={stopBowContact}
            onPointerLeave={stopBowContact}
            onClick={handlePlayAreaClick}
            onContextMenu={handlePlayAreaContextMenu}
          >
            {stringNames.map((stringName) => (
              <div
                className={stringName === instrumentState.selectedString ? 'string-lane selected' : 'string-lane'}
                key={stringName}
              >
                <span>{stringName}</span>
                <i aria-hidden="true" />
              </div>
            ))}
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

        <section className="key-signature-strip" aria-label="Key signature">
          {keySignatures.map((signature) => (
            <button
              className={signature === instrumentState.keySignature ? 'active' : ''}
              key={signature}
              type="button"
              aria-label={`${signature} key signature`}
              title={`${signature} key signature`}
              onClick={() => renderInstrumentState({ keySignature: signature })}
            >
              {renderKeySignature(signature)}
            </button>
          ))}
        </section>
      </section>
    </main>
  )
}

export default App
