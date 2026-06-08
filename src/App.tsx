import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { BowedStringEngine } from './BowedStringEngine'
import {
  getFingerLabel,
  getPitchInfo,
  getStringForRatio,
  isFingerKey,
  keySignatures,
  keyStrip,
  stringNames,
  type FingerKey,
  type KeySignature,
  type PositionName,
  type ViolinString,
} from './pitchMapping'

type BowDirection = -1 | 0 | 1
type AudioStatus = 'locked' | 'starting' | 'on' | 'blocked'
const STRING_BOUNDARY_GRACE = 0.055
const MOTION_MOVE_PIXELS = 0.75
const BOW_ON_SPEED = 0.42
const BOW_HOLD_MS = 260

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
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('locked')
  const stateRef = useRef(instrumentState)
  const engineRef = useRef<BowedStringEngine | null>(null)
  const playAreaRef = useRef<HTMLElement | null>(null)
  const heldKeysRef = useRef<FingerKey[]>([])
  const lastPointerRef = useRef<{ x: number; y: number; time: number; speed: number } | null>(null)
  const lastMovementTimeRef = useRef(0)
  const motionStopTimerRef = useRef<number | null>(null)
  const audioResumeInFlightRef = useRef(false)
  const audioUnlockedRef = useRef(false)

  const pitch = useMemo(
    () =>
      getPitchInfo(
        instrumentState.selectedString,
        instrumentState.fingerKey,
        instrumentState.position,
        instrumentState.keySignature,
      ),
    [
      instrumentState.fingerKey,
      instrumentState.keySignature,
      instrumentState.position,
      instrumentState.selectedString,
    ],
  )

  function updateInstrumentState(update: Partial<InstrumentState>) {
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

      updateInstrumentState({ rawSpeed: 0, bowSpeed: 0, acceleration: 0 })
      engineRef.current?.stop()
      motionStopTimerRef.current = null
    }, BOW_HOLD_MS)
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
    updateInstrumentState({
      pointerRatio,
      selectedString,
    })

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
    setAudioStatus('starting')
    const timeoutId = window.setTimeout(() => {
      audioResumeInFlightRef.current = false
      const state = engine.getState()
      const isRunning = state === 'running'
      audioUnlockedRef.current = isRunning
      setAudioStatus(isRunning ? 'on' : 'locked')
    }, 700)

    void engine
      .resume()
      .then((state) => {
        window.clearTimeout(timeoutId)
        const isRunning = state === 'running'
        audioUnlockedRef.current = isRunning
        setAudioStatus(isRunning ? 'on' : 'locked')
      })
      .catch(() => {
        window.clearTimeout(timeoutId)
        audioUnlockedRef.current = false
        setAudioStatus('blocked')
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
    updateInstrumentState({ contact: true, rawSpeed: 0, bowSpeed: 0, acceleration: 0, direction: 0 })
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') {
      event.preventDefault()
      startAudioFromGesture()
    }

    if (event.pointerType !== 'mouse') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    beginBowContact(event.clientX, event.clientY)
  }

  function handlePlayAreaClick() {
    startAudioFromGesture()
    updateInstrumentState({ position: stateRef.current.position === 'first' ? 'third' : 'first' })
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
      updateInstrumentState({ contact: true, rawSpeed: 0, bowSpeed: 0, acceleration: 0, direction: 0 })
      return
    }

    const previous = lastPointerRef.current
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    const moved = Math.hypot(dx, dy) >= MOTION_MOVE_PIXELS

    if (!moved) {
      return
    }

    const direction: BowDirection = Math.abs(dx) < 0.5 ? stateRef.current.direction : dx < 0 ? -1 : 1

    lastMovementTimeRef.current = now
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now, speed: BOW_ON_SPEED }
    scheduleMotionStop(now)
    updateInstrumentState({
      contact: true,
      rawSpeed: BOW_ON_SPEED,
      bowSpeed: BOW_ON_SPEED,
      acceleration: 0,
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
    clearMotionStopTimer()
    lastPointerRef.current = null
    updateInstrumentState({ contact: false, rawSpeed: 0, bowSpeed: 0, acceleration: 0 })
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
        clearMotionStopTimer()
        lastPointerRef.current = null
        setInstrumentState((current) => {
          const next = { ...current, contact: false, rawSpeed: 0, bowSpeed: 0, acceleration: 0 }
          stateRef.current = next
          return next
        })
      }
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    return () => window.removeEventListener('pointermove', handleWindowPointerMove)
  }, [])

  useEffect(() => {
    function setFingerFromHeldKeys() {
      const held = heldKeysRef.current
      updateInstrumentState({ fingerKey: held.length ? held[held.length - 1] : null })
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
        updateInstrumentState({ vibrato: true })
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
        updateInstrumentState({ vibrato: false })
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
      const acceleration = 0
      const pitchInfo = getPitchInfo(current.selectedString, current.fingerKey, current.position, current.keySignature)

      if (Math.abs(bowSpeed - current.bowSpeed) > 0.004 || (!current.contact && current.bowSpeed !== 0)) {
        updateInstrumentState({ bowSpeed, acceleration })
      }

      engineRef.current?.setState({
        frequency: pitchInfo.frequency,
        stringName: pitchInfo.stringName,
        speed: bowSpeed,
        acceleration,
        direction: current.direction,
        contact: current.contact && age < 220,
        vibrato: current.vibrato,
      })

      frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [])

  const bowDirectionText =
    instrumentState.direction === -1 ? 'left / up-bow' : instrumentState.direction === 1 ? 'right / down-bow' : 'still'
  const contactText = instrumentState.contact ? 'Contact' : 'Off string'
  const activeKeyLabel = getFingerLabel(instrumentState.fingerKey)
  const bowing = instrumentState.bowSpeed > 0
  const bowPercent = bowing ? 100 : 0
  const playheadLeft = `${instrumentState.pointerRatio * 100}%`
  const audioText =
    audioStatus === 'on' ? 'sound on' : audioStatus === 'starting' ? 'starting' : audioStatus === 'blocked' ? 'blocked' : 'sound locked'

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
        <div className="instrument-head">
          <div>
            <p className="app-kicker">AO Labs browser instrument</p>
            <h1>Virtual Violin</h1>
          </div>
          <p className="instructions">
            Strings run left to right: G D A E. Move inside one lane to sound it. Use F D S A for fingers. Left click
            toggles first and third position.
          </p>
        </div>

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
        >
          {audioStatus !== 'on' && (
            <div className="sound-unlock" aria-live="polite">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  startAudioFromGesture()
                }}
              >
                {audioStatus === 'blocked' ? 'Retry sound' : 'Start sound'}
              </button>
              <span>{audioStatus === 'blocked' ? 'browser blocked audio' : 'one click, no hold'}</span>
            </div>
          )}
          {stringNames.map((stringName) => (
            <div
              className={stringName === instrumentState.selectedString ? 'string-lane selected' : 'string-lane'}
              key={stringName}
            >
              <span>{stringName}</span>
              <i aria-hidden="true" />
            </div>
          ))}
          <div className="bow-line" style={{ left: playheadLeft }} aria-hidden="true">
            <span />
          </div>
          <div className="note-readout" aria-live="polite">
            <span className="note-name">{pitch.noteName}</span>
            <span className="note-detail">{pitch.mappingText}</span>
          </div>
        </section>

        <section className="key-signature-strip" aria-label="Key signature">
          {keySignatures.map((signature) => (
            <button
              className={signature === instrumentState.keySignature ? 'active' : ''}
              key={signature}
              type="button"
              onClick={() => updateInstrumentState({ keySignature: signature })}
            >
              {signature}
            </button>
          ))}
        </section>

        <section className="state-grid" aria-label="Current instrument state">
          <div className="state-item primary">
            <span>string</span>
            <strong>{pitch.stringName}</strong>
          </div>
          <div className="state-item primary">
            <span>note</span>
            <strong>{pitch.noteName}</strong>
          </div>
          <div className="state-item">
            <span>finger</span>
            <strong>{activeKeyLabel}</strong>
          </div>
          <div className="state-item">
            <span>position</span>
            <strong>{instrumentState.position}</strong>
          </div>
          <div className="state-item">
            <span>bow</span>
            <strong>{contactText}</strong>
          </div>
          <div className="state-item">
            <span>sound</span>
            <strong>{audioText}</strong>
          </div>
          <div className="state-item">
            <span>direction</span>
            <strong>{bowDirectionText}</strong>
          </div>
          <div className="state-item meter-item">
            <span>motion</span>
            <strong>{bowing ? 'on' : 'off'}</strong>
            <div className="volume-track" aria-hidden="true">
              <i style={{ width: `${bowPercent}%` }} />
            </div>
          </div>
        </section>

        <section className="key-map" aria-label="Finger key mapping">
          {keyStrip.map((keyLabel) => {
            const key = keyLabel === 'open' ? null : (keyLabel as FingerKey)
            const keyPitch = getPitchInfo(
              instrumentState.selectedString,
              key,
              instrumentState.position,
              instrumentState.keySignature,
            )
            const active = key === instrumentState.fingerKey

            return (
              <div className={active ? 'key-cell active' : 'key-cell'} key={keyLabel}>
                <span>{keyLabel}</span>
                <strong>{keyPitch.noteName}</strong>
              </div>
            )
          })}
        </section>

        <section className="physical-map" aria-label="Physical mapping">
          <div>
            <span>left</span>
            <strong>G string</strong>
          </div>
          <div>
            <span>right</span>
            <strong>E string</strong>
          </div>
          <div>
            <span>F D S A</span>
            <strong>fingers</strong>
          </div>
          <div>
            <span>click</span>
            <strong>{instrumentState.position} position</strong>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
