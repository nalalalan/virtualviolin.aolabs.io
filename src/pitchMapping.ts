export const stringNames = ['G', 'D', 'A', 'E'] as const

export type ViolinString = (typeof stringNames)[number]
export type FingerKey = '0' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2' | '1'

export const fingerKeys: FingerKey[] = ['0', '9', '8', '7', '6', '5', '4', '3', '2', '1']
export const keyStrip = ['open', ...fingerKeys] as const

const baseMidiByString: Record<ViolinString, number> = {
  G: 55,
  D: 62,
  A: 69,
  E: 76,
}

const offsetByKey: Record<FingerKey, number> = {
  '0': 1,
  '9': 2,
  '8': 3,
  '7': 4,
  '6': 5,
  '5': 6,
  '4': 7,
  '3': 8,
  '2': 9,
  '1': 10,
}

const noteNames = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'] as const

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
  return fingerKeys.includes(value as FingerKey)
}

export function getStringForRatio(yRatio: number): ViolinString {
  const clamped = Math.min(0.999999, Math.max(0, yRatio))
  return stringNames[Math.floor(clamped * stringNames.length)]
}

export function getOffsetForKey(key: FingerKey | null): number {
  return key === null ? 0 : offsetByKey[key]
}

export function getPitchInfo(stringName: ViolinString, key: FingerKey | null): PitchInfo {
  const offset = getOffsetForKey(key)
  const midi = baseMidiByString[stringName] + offset
  const noteName = noteNames[((midi % 12) + 12) % 12]
  const frequency = 440 * 2 ** ((midi - 69) / 12)

  return {
    stringName,
    key,
    offset,
    noteName,
    frequency,
    midi,
    mappingText: key === null ? `${stringName} string open = ${noteName}` : `${stringName} string + ${key} = ${noteName}`,
  }
}

export function getFingerLabel(key: FingerKey | null): string {
  return key === null ? 'open' : key
}
