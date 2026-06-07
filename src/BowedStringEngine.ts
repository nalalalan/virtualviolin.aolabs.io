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

  async resume(): Promise<void> {
    this.ensureNodes()
    if (this.context?.state === 'suspended') {
      await this.context.resume()
    }
  }

  setState(state: BowState): void {
    this.ensureNodes()

    if (!this.context || !this.oscillator || !this.bodyOscillator || !this.gain || !this.bodyGain || !this.filter) {
      return
    }

    const now = this.context.currentTime
    const bowing = state.contact && state.speed > 0.012
    const speed = Math.min(1, Math.max(0, state.speed))
    const attackEdge = Math.min(1, Math.max(0, state.acceleration))
    const targetGain = bowing ? 0.018 + speed * 0.18 + attackEdge * 0.045 : 0
    const bodyBlend = bowing ? 0.012 + speed * 0.08 : 0
    const brightness = this.getStringBrightness(state.stringName)
    const directionColor = state.direction === 0 ? 0 : state.direction * 0.04

    this.oscillator.frequency.setTargetAtTime(state.frequency, now, 0.012)
    this.bodyOscillator.frequency.setTargetAtTime(state.frequency / 2, now, 0.018)
    this.gain.gain.setTargetAtTime(targetGain, now, bowing ? 0.018 : 0.05)
    this.bodyGain.gain.setTargetAtTime(bodyBlend, now, bowing ? 0.03 : 0.06)
    this.filter.frequency.setTargetAtTime(850 + brightness + speed * 1300 + attackEdge * 700, now, 0.045)
    this.filter.Q.setTargetAtTime(1.1 + speed * 2.6, now, 0.06)

    if (this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-0.22, Math.min(0.22, state.direction * (0.08 + speed * 0.14))), now, 0.035)
    }

    if (this.vibratoGain) {
      this.vibratoGain.gain.setTargetAtTime(state.vibrato && bowing ? 11 + speed * 5 + directionColor : 0, now, 0.04)
    }

    this.lastString = state.stringName
  }

  stop(): void {
    if (!this.context || !this.gain || !this.bodyGain) {
      return
    }

    const now = this.context.currentTime
    this.gain.gain.setTargetAtTime(0, now, 0.045)
    this.bodyGain.gain.setTargetAtTime(0, now, 0.055)
  }

  private ensureNodes(): void {
    if (this.context) {
      return
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const context = new AudioContextClass({ latencyHint: 'interactive' })
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
    compressor.release.value = 0.14
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
