import type { ViolinString } from './pitchMapping'

interface BowState {
  frequency: number
  stringName: ViolinString
  speed: number
  acceleration: number
  direction: -1 | 0 | 1
  contact: boolean
  vibrato: boolean
}

export class BowedStringEngine {
  private context: AudioContext | null = null
  private oscillator: OscillatorNode | null = null
  private bodyOscillator: OscillatorNode | null = null
  private gain: GainNode | null = null
  private bodyGain: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private panner: StereoPannerNode | null = null
  private vibratoGain: GainNode | null = null
  private lastString: ViolinString = 'A'
  private lastDirection: -1 | 0 | 1 = 0

  async resume(): Promise<AudioContextState> {
    this.ensureNodes()
    if (this.context?.state === 'suspended') {
      await this.context.resume()
    }

    return this.context?.state ?? 'closed'
  }

  getState(): AudioContextState | 'missing' {
    return this.context?.state ?? 'missing'
  }

  setState(state: BowState): void {
    this.ensureNodes()

    if (!this.context || !this.oscillator || !this.bodyOscillator || !this.gain || !this.bodyGain || !this.filter) {
      return
    }

    const now = this.context.currentTime
    const bowing = state.contact && state.speed > 0.004
    const speed = Math.min(1, Math.max(0, state.speed))
    const directionChanged =
      bowing && state.direction !== 0 && this.lastDirection !== 0 && state.direction !== this.lastDirection
    const attackEdge = directionChanged ? 1 : Math.min(1, Math.max(0, state.acceleration))
    const targetGain = bowing ? 0.045 + speed * 0.28 + attackEdge * 0.065 : 0
    const bodyBlend = bowing ? 0.026 + speed * 0.13 : 0
    const brightness = this.getStringBrightness(state.stringName)
    const directionColor = state.direction === 0 ? 0 : state.direction * 0.04

    this.oscillator.frequency.cancelScheduledValues(now)
    this.bodyOscillator.frequency.cancelScheduledValues(now)
    this.oscillator.frequency.setValueAtTime(state.frequency, now)
    this.bodyOscillator.frequency.setValueAtTime(state.frequency / 2, now)
    if (directionChanged) {
      const restartAt = now + 0.006
      this.gain.gain.cancelScheduledValues(now)
      this.bodyGain.gain.cancelScheduledValues(now)
      this.gain.gain.setTargetAtTime(0, now, 0.002)
      this.bodyGain.gain.setTargetAtTime(0, now, 0.003)
      this.gain.gain.setTargetAtTime(targetGain + 0.02, restartAt, 0.004)
      this.bodyGain.gain.setTargetAtTime(bodyBlend + 0.01, restartAt, 0.006)
    } else {
      this.gain.gain.setTargetAtTime(targetGain, now, bowing ? 0.004 : 0.018)
      this.bodyGain.gain.setTargetAtTime(bodyBlend, now, bowing ? 0.008 : 0.024)
    }
    this.filter.frequency.setTargetAtTime(850 + brightness + speed * 1300 + attackEdge * 700, now, 0.01)
    this.filter.Q.setTargetAtTime(1.1 + speed * 2.6, now, 0.012)

    if (this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-0.22, Math.min(0.22, state.direction * (0.08 + speed * 0.14))), now, 0.008)
    }

    if (this.vibratoGain) {
      this.vibratoGain.gain.setTargetAtTime(state.vibrato && bowing ? 11 + speed * 5 + directionColor : 0, now, 0.01)
    }

    this.lastString = state.stringName
    if (bowing && state.direction !== 0) {
      this.lastDirection = state.direction
    }
  }

  stop(): void {
    if (!this.context || !this.gain || !this.bodyGain) {
      return
    }

    const now = this.context.currentTime
    this.gain.gain.setTargetAtTime(0, now, 0.012)
    this.bodyGain.gain.setTargetAtTime(0, now, 0.016)
    this.lastDirection = 0
  }

  private ensureNodes(): void {
    if (this.context) {
      return
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const context = new AudioContextClass({ latencyHint: 0.003 })
    const oscillator = context.createOscillator()
    const bodyOscillator = context.createOscillator()
    const gain = context.createGain()
    const bodyGain = context.createGain()
    const filter = context.createBiquadFilter()
    const compressor = context.createDynamicsCompressor()
    const vibrato = context.createOscillator()
    const vibratoGain = context.createGain()

    const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null

    oscillator.type = 'sawtooth'
    bodyOscillator.type = 'triangle'
    oscillator.frequency.value = 440
    bodyOscillator.frequency.value = 220
    gain.gain.value = 0
    bodyGain.gain.value = 0
    filter.type = 'bandpass'
    filter.frequency.value = 1300
    filter.Q.value = 1.5
    compressor.threshold.value = -18
    compressor.knee.value = 18
    compressor.ratio.value = 5
    compressor.attack.value = 0.004
    compressor.release.value = 0.06
    vibrato.frequency.value = 5.4
    vibratoGain.gain.value = 0

    vibrato.connect(vibratoGain)
    vibratoGain.connect(oscillator.detune)
    oscillator.connect(gain)
    bodyOscillator.connect(bodyGain)
    gain.connect(filter)
    bodyGain.connect(filter)
    filter.connect(compressor)

    if (panner) {
      compressor.connect(panner)
      panner.connect(context.destination)
    } else {
      compressor.connect(context.destination)
    }

    oscillator.start()
    bodyOscillator.start()
    vibrato.start()

    this.context = context
    this.oscillator = oscillator
    this.bodyOscillator = bodyOscillator
    this.gain = gain
    this.bodyGain = bodyGain
    this.filter = filter
    this.panner = panner
    this.vibratoGain = vibratoGain
  }

  private getStringBrightness(stringName: ViolinString): number {
    if (this.lastString !== stringName) {
      return 840
    }

    switch (stringName) {
      case 'G':
        return 120
      case 'D':
        return 360
      case 'A':
        return 680
      case 'E':
        return 980
    }
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
