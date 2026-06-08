export const stringNames = ['G', 'D', 'A', 'E'] as const
export const positionNames = ['first', 'third', 'fifth', 'seventh'] as const

export type ViolinString = (typeof stringNames)[number]
export type FingerKey = 'j' | 'h' | 'g' | 'f' | 'd' | 's' | 'a'
export type PositionName = (typeof positionNames)[number]

export const fingerKeys: FingerKey[] = ['j', 'h', 'g', 'f', 'd', 's', 'a']
export const keyStrip = ['open', ...fingerKeys] as const

export const stringAngleByName: Record<ViolinString, number> = {
  G: 30,
  D: 10,
  A: -10,
  E: -30,
}

const stringSwitchHysteresisDegrees = 7
const adjacentStringBoundaryAngles = [25, 0, -25] as const
const bowStringSwitchConfirmPixels = 10
const bowStringSwitchConfirmMoves = 2

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

const sharpNoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
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

export interface BowStringSelectionState {
  selectedString: ViolinString
  pendingString: ViolinString | null
  pendingTravel: number
  pendingMoves: number
}

export function createBowStringSelectionState(selectedString: ViolinString = 'A'): BowStringSelectionState {
  return {
    selectedString,
    pendingString: null,
    pendingTravel: 0,
    pendingMoves: 0,
  }
}

export function resetBowStringSelectionState(
  state: BowStringSelectionState,
  selectedString: ViolinString = state.selectedString,
): void {
  state.selectedString = selectedString
  state.pendingString = null
  state.pendingTravel = 0
  state.pendingMoves = 0
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
  return normalizeBowAngle((-Math.atan2(dy, dx) * 180) / Math.PI)
}

function getClosestStringForBowAngle(angle: number, fallback: ViolinString): ViolinString {
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

export function getStringForBowVector(dx: number, dy: number, fallback: ViolinString = 'A'): ViolinString {
  if (Math.hypot(dx, dy) < 0.001) {
    return fallback
  }

  const angle = getBowAngleForVector(dx, dy)
  const closestString = getClosestStringForBowAngle(angle, fallback)

  if (closestString === fallback) {
    return fallback
  }

  const currentIndex = stringNames.indexOf(fallback)
  const targetIndex = stringNames.indexOf(closestString)

  if (currentIndex < 0 || targetIndex < 0 || Math.abs(currentIndex - targetIndex) > 1) {
    return closestString
  }

  const boundaryAngle = adjacentStringBoundaryAngles[Math.min(currentIndex, targetIndex)]
  if (targetIndex < currentIndex) {
    return angle > boundaryAngle + stringSwitchHysteresisDegrees ? closestString : fallback
  }

  return angle < boundaryAngle - stringSwitchHysteresisDegrees ? closestString : fallback
}

function getAdjacentStepToward(current: ViolinString, target: ViolinString): ViolinString {
  const currentIndex = stringNames.indexOf(current)
  const targetIndex = stringNames.indexOf(target)

  if (currentIndex < 0 || targetIndex < 0 || Math.abs(currentIndex - targetIndex) <= 1) {
    return target
  }

  return stringNames[currentIndex + Math.sign(targetIndex - currentIndex)]
}

export function updateBowStringSelectionState(state: BowStringSelectionState, dx: number, dy: number): ViolinString {
  const travel = Math.hypot(dx, dy)
  if (travel < 0.001) {
    return state.selectedString
  }

  const rawTarget = getStringForBowVector(dx, dy, state.selectedString)
  const target = getAdjacentStepToward(state.selectedString, rawTarget)

  if (target === state.selectedString) {
    state.pendingString = null
    state.pendingTravel = 0
    state.pendingMoves = 0
    return state.selectedString
  }

  if (state.pendingString !== target) {
    state.pendingString = target
    state.pendingTravel = 0
    state.pendingMoves = 0
  }

  state.pendingTravel += travel
  state.pendingMoves += 1

  if (state.pendingMoves >= bowStringSwitchConfirmMoves && state.pendingTravel >= bowStringSwitchConfirmPixels) {
    resetBowStringSelectionState(state, target)
  }

  return state.selectedString
}

export function getBowDirectionForString(dx: number, dy: number, stringName: ViolinString): -1 | 1 {
  const angle = (stringAngleByName[stringName] * Math.PI) / 180
  const projection = dx * Math.cos(angle) - dy * Math.sin(angle)
  return projection < 0 ? -1 : 1
}

export function getOffsetForKey(
  _stringName: ViolinString,
  key: FingerKey | null,
  position: PositionName = 'first',
): number {
  if (key === null) {
    return 0
  }

  return positionLowFingerOffset[position] + fingerIndexByKey[key]
}

export function getNoteName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12
  return sharpNoteNames[pitchClass]
}

export function getPitchInfo(
  stringName: ViolinString,
  key: FingerKey | null,
  position: PositionName = 'first',
): PitchInfo {
  const offset = getOffsetForKey(stringName, key, position)
  const midi = baseMidiByString[stringName] + offset
  const noteName = getNoteName(midi)
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
        : `${stringName} ${positionLabelByName[position]} position + ${key.toUpperCase()} = ${noteName}`,
  }
}

export function getFingerLabel(key: FingerKey | null): string {
  return key === null ? 'open' : key
}
