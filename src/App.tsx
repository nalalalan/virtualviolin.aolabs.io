import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { BowedStringEngine } from './BowedStringEngine'
import {
  getFingerLabel,
  getPitchInfo,
  getStringForRatio,
  isFingerKey,
  keyStrip,
  stringNames,
  type FingerKey,
  type ViolinString,
} from './pitchMapping'

type BowDirection = -1 | 0 | 1
type AudioStatus = 'locked' | 'starting' | 'on' | 'blocked'
const STRING_BOUNDARY_GRACE = 0.055
const VERTICAL_MOVE_PIXELS = 4
const VERTICAL_MOVE_RATIO = 1.15

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
  const audioResumeInFlightRef = useRef(false)
  const audioUnlockedRef = useRef(false)

  const pitch = useMemo(
    () => getPitchInfo(instrumentState.selectedString, instrumentState.fingerKey),
    [instrumentState.fingerKey, instrumentState.selectedString],
  )

  function updateInstrumentState(update: Partial<InstrumentState>) {
    const next = { ...stateRef.current, ...update }
    stateRef.current = next
    setInstrumentState(next)
  }

  function getPointerRatio(clientY: number) {
    const rect = playAreaRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) {
      return stateRef.current.pointerRatio
    }

    return Math.min(0.999999, Math.max(0, (clientY - rect.top) / rect.height))
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

  function updateStringFromPointer(clientY: number) {
    const pointerRatio = getPointerRatio(clientY)
    const selectedString = getStableStringForRatio(pointerRatio)
    updateInstrumentState({
      pointerRatio,
      selectedString,
    })

    return selectedString
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
    updateStringFromPointer(clientY)
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
    updateStringFromPointer(event.clientY)

    if (!stateRef.current.contact || !lastPointerRef.current) {
      lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now, speed: 0 }
      lastMovementTimeRef.current = now
      updateInstrumentState({ contact: true, rawSpeed: 0, bowSpeed: 0, acceleration: 0, direction: 0 })
      return
    }

    const previous = lastPointerRef.current
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    const dt = Math.max(8, now - previous.time)
    const mostlyVertical =
      Math.abs(dy) >= VERTICAL_MOVE_PIXELS && Math.abs(dy) > Math.abs(dx) * VERTICAL_MOVE_RATIO

    if (mostlyVertical) {
      lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now, speed: 0 }
      updateInstrumentState({
        contact: true,
        rawSpeed: 0,
        bowSpeed: 0,
        acceleration: 0,
      })
      engineRef.current?.stop()
      return
    }

    const pixelsPerSecond = (Math.abs(dx) / dt) * 1000
    const rawSpeed = Math.min(1, pixelsPerSecond / 980)
    const acceleration = Math.min(1, Math.abs(rawSpeed - previous.speed) / Math.max(dt / 1000, 0.016) / 8)
    const direction: BowDirection = Math.abs(dx) < 0.5 ? stateRef.current.direction : dx < 0 ? -1 : 1

    if (Math.abs(dx) >= 0.5) {
      lastMovementTimeRef.current = now
    }

    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now, speed: rawSpeed }
    updateInstrumentState({ contact: true, rawSpeed, bowSpeed: rawSpeed, acceleration, direction })
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
      if (isFingerKey(event.key)) {
        event.preventDefault()
        startAudioFromGesture()
        heldKeysRef.current = [...heldKeysRef.current.filter((key) => key !== event.key), event.key]
        setFingerFromHeldKeys()
        return
      }

      if (event.key === 'Shift') {
        startAudioFromGesture()
        updateInstrumentState({ vibrato: true })
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (isFingerKey(event.key)) {
        event.preventDefault()
        heldKeysRef.current = heldKeysRef.current.filter((key) => key !== event.key)
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
      const fade = current.contact ? Math.exp(-Math.max(0, age) / 150) : 0
      const bowSpeed = age < 520 ? current.rawSpeed * fade : 0
      const acceleration = current.acceleration * fade
      const pitchInfo = getPitchInfo(current.selectedString, current.fingerKey)

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
  const volumePercent = Math.round(instrumentState.bowSpeed * 100)
  const playheadTop = `${instrumentState.pointerRatio * 100}%`
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
            Click once for sound. Move mouse up/down to choose string. Move left/right to bow. Hold 0-1 for chromatic
            notes.
          </p>
        </div>

        <section
          className="play-area"
          ref={playAreaRef}
          role="application"
          aria-label="Mouse bowing surface. Top to bottom strings are G, D, A, and E."
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
              <button type="button" onClick={startAudioFromGesture}>
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
          <div className="bow-line" style={{ top: playheadTop }} aria-hidden="true">
            <span />
          </div>
          <div className="note-readout" aria-live="polite">
            <span className="note-name">{pitch.noteName}</span>
            <span className="note-detail">{pitch.mappingText}</span>
          </div>
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
            <span>speed / volume</span>
            <strong>{volumePercent}%</strong>
            <div className="volume-track" aria-hidden="true">
              <i style={{ width: `${volumePercent}%` }} />
            </div>
          </div>
        </section>

        <section className="key-map" aria-label="Chromatic number row mapping">
          {keyStrip.map((keyLabel) => {
            const key = keyLabel === 'open' ? null : (keyLabel as FingerKey)
            const keyPitch = getPitchInfo(instrumentState.selectedString, key)
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
            <span>up</span>
            <strong>G string</strong>
          </div>
          <div>
            <span>down</span>
            <strong>E string</strong>
          </div>
          <div>
            <span>left number row</span>
            <strong>higher pitch</strong>
          </div>
          <div>
            <span>Shift</span>
            <strong>{instrumentState.vibrato ? 'vibrato on' : 'vibrato off'}</strong>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
