export const stringNames = ['G', 'D', 'A', 'E'] as const
export const keySignatures = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'] as const
export const positionNames = ['first', 'third', 'fifth', 'seventh'] as const

export type ViolinString = (typeof stringNames)[number]
export type FingerKey = 'j' | 'h' | 'g' | 'f' | 'd' | 's' | 'a'
export type PositionName = (typeof positionNames)[number]
export type KeySignature = (typeof keySignatures)[number]

export const fingerKeys: FingerKey[] = ['j', 'h', 'g', 'f', 'd', 's', 'a']
export const keyStrip = ['open', ...fingerKeys] as const

export const stringAngleByName: Record<ViolinString, number> = {
  G: -34,
  D: -11,
  A: 11,
  E: 34,
}

export const positionLabelByName: Record<PositionName, string> = {
  first: '1st',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
}

const baseMidiByString: Record<ViolinString, number> = {
  G: 55,
  D: 62,
  A: 69,
  E: 76,
}

const tonicPitchClassByKey: Record<KeySignature, number> = {
  C: 0,
  G: 7,
  D: 2,
  A: 9,
  E: 4,
  F: 5,
  Bb: 10,
  Eb: 3,
}

const sharpNoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const flatNoteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const
const flatKeys = new Set<KeySignature>(['F', 'Bb', 'Eb'])
const positionLowFingerOffset: Record<PositionName, number> = {
  first: 1,
  third: 4,
  fifth: 8,
  seventh: 11,
}

const fingerIndexByKey: Record<FingerKey, number> = {
  j: 0,
  h: 1,
  g: 2,
  f: 3,
  d: 4,
  s: 5,
  a: 6,
}

export interface PitchInfo {
  stringName: ViolinString
  key: FingerKey | null
  offset: number
  noteName: string
  frequency: number
  midi: number
  mappingText: string
}

export function isFingerKey(value: string): value is FingerKey {
  return fingerKeys.includes(value.toLowerCase() as FingerKey)
}

export function getStringForRatio(yRatio: number): ViolinString {
  const clamped = Math.min(0.999999, Math.max(0, yRatio))
  return stringNames[Math.floor(clamped * stringNames.length)]
}

export function normalizeBowAngle(angle: number): number {
  let normalized = ((angle + 90) % 180) - 90
  if (normalized < -90) {
    normalized += 180
  }
  return normalized
}

export function getBowAngleForVector(dx: number, dy: number): number {
  return normalizeBowAngle((Math.atan2(dx, dy) * 180) / Math.PI)
}

export function getStringForBowVector(dx: number, dy: number, fallback: ViolinString = 'A'): ViolinString {
  if (Math.hypot(dx, dy) < 0.001) {
    return fallback
  }

  const angle = getBowAngleForVector(dx, dy)
  let bestString = fallback
  let bestDistance = Infinity

  for (const stringName of stringNames) {
    const distance = Math.abs(normalizeBowAngle(angle - stringAngleByName[stringName]))
    if (distance + 0.001 < bestDistance || (Math.abs(distance - bestDistance) <= 0.001 && stringName === fallback)) {
      bestDistance = distance
      bestString = stringName
    }
  }

  return bestString
}

export function getBowDirectionForString(dx: number, dy: number, stringName: ViolinString): -1 | 1 {
  const angle = (stringAngleByName[stringName] * Math.PI) / 180
  const projection = dx * Math.sin(angle) + dy * Math.cos(angle)
  return projection < 0 ? -1 : 1
}

export function getScaleOffsets(openMidi: number, keySignature: KeySignature): number[] {
  const tonic = tonicPitchClassByKey[keySignature]
  const majorScaleSteps = [0, 2, 4, 5, 7, 9, 11]
  const scalePitchClasses = new Set(majorScaleSteps.map((step) => (tonic + step) % 12))
  const offsets: number[] = []

  for (let offset = 1; offsets.length < 12 && offset <= 36; offset += 1) {
    if (scalePitchClasses.has((openMidi + offset) % 12)) {
      offsets.push(offset)
    }
  }

  return offsets
}

export function getOffsetForKey(
  stringName: ViolinString,
  key: FingerKey | null,
  position: PositionName = 'first',
  keySignature: KeySignature = 'D',
): number {
  void stringName
  void keySignature

  if (key === null) {
    return 0
  }

  return positionLowFingerOffset[position] + fingerIndexByKey[key]
}

export function getNoteName(midi: number, keySignature: KeySignature): string {
  const pitchClass = ((midi % 12) + 12) % 12
  return (flatKeys.has(keySignature) ? flatNoteNames : sharpNoteNames)[pitchClass]
}

export function getPitchInfo(
  stringName: ViolinString,
  key: FingerKey | null,
  position: PositionName = 'first',
  keySignature: KeySignature = 'D',
): PitchInfo {
  const offset = getOffsetForKey(stringName, key, position, keySignature)
  const midi = baseMidiByString[stringName] + offset
  const noteName = getNoteName(midi, keySignature)
  const frequency = 440 * 2 ** ((midi - 69) / 12)

  return {
    stringName,
    key,
    offset,
    noteName,
    frequency,
    midi,
    mappingText:
      key === null
        ? `${stringName} string open = ${noteName}`
        : `${stringName} ${positionLabelByName[position]} position + ${key.toUpperCase()} = ${noteName} (${keySignature})`,
  }
}

export function getFingerLabel(key: FingerKey | null): string {
  return key === null ? 'open' : key
}
