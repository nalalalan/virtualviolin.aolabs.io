import assert from 'node:assert/strict'
import {
  createBowStringSelectionState,
  fingerKeys,
  getBowDirectionForString,
  getPitchInfo,
  getStringForBowVector,
  getStringForRatio,
  resetBowStringSelectionState,
  updateBowStringSelectionState,
} from './pitchMapping'

function vectorForAngle(angle: number) {
  const radians = (angle * Math.PI) / 180
  return { dx: Math.cos(radians) * 100, dy: -Math.sin(radians) * 100 }
}

function stringForAngle(angle: number, fallback: Parameters<typeof getStringForBowVector>[2]) {
  const vector = vectorForAngle(angle)
  return getStringForBowVector(vector.dx, vector.dy, fallback)
}

function updateSelectionForAngle(
  state: ReturnType<typeof createBowStringSelectionState>,
  angle: number,
  distance = 100,
) {
  const vector = vectorForAngle(angle)
  return updateBowStringSelectionState(state, (vector.dx / 100) * distance, (vector.dy / 100) * distance)
}

assert.deepEqual(fingerKeys, ['j', 'h', 'g', 'f', 'd', 's', 'a'])

assert.equal(getPitchInfo('A', null, 'first').noteName, 'A', 'A open')
assert.equal(getPitchInfo('D', 'j', 'first').noteName, 'D#', 'D first j')
assert.equal(getPitchInfo('D', 'h', 'first').noteName, 'E', 'D first h')
assert.equal(getPitchInfo('D', 'g', 'first').noteName, 'F', 'D first g')
assert.equal(getPitchInfo('D', 'f', 'first').noteName, 'F#', 'D first f')
assert.equal(getPitchInfo('D', 'd', 'first').noteName, 'G', 'D first d')
assert.equal(getPitchInfo('D', 's', 'first').noteName, 'G#', 'D first s')
assert.equal(getPitchInfo('D', 'a', 'first').noteName, 'A', 'D first a')
assert.equal(getPitchInfo('D', 'h', 'third').noteName, 'G', 'D third h')
assert.equal(getPitchInfo('D', 'a', 'third').noteName, 'C', 'D third a')
assert.equal(getPitchInfo('D', 'h', 'fifth').noteName, 'B', 'D fifth h')
assert.equal(getPitchInfo('D', 'h', 'seventh').noteName, 'D', 'D seventh h')
assert.equal(getPitchInfo('A', 'a', 'first').noteName, 'E', 'A first a')

assert.equal(getStringForRatio(0), 'G')
assert.equal(getStringForRatio(0.249), 'G')
assert.equal(getStringForRatio(0.25), 'D')
assert.equal(getStringForRatio(0.5), 'A')
assert.equal(getStringForRatio(0.75), 'E')
assert.equal(getStringForRatio(1), 'E')

assert.equal(getStringForBowVector(86.6, -50, 'A'), 'G')
assert.equal(getStringForBowVector(98.5, -17.4, 'A'), 'D')
assert.equal(getStringForBowVector(98.5, 17.4, 'D'), 'A')
assert.equal(getStringForBowVector(86.6, 50, 'A'), 'A')
assert.equal(stringForAngle(-36, 'A'), 'E')
assert.equal(getStringForBowVector(-86.6, 50, 'A'), 'G')
assert.equal(getStringForBowVector(-98.5, 17.4, 'A'), 'D')
assert.equal(stringForAngle(28, 'D'), 'D', 'D keeps more room before crossing to G')
assert.equal(stringForAngle(35, 'D'), 'D', 'D holds through the steeper G/D threshold')
assert.equal(stringForAngle(36, 'D'), 'G', 'D switches to G only after the steeper deliberate angle crossing')
assert.equal(stringForAngle(-4, 'D'), 'D', 'D stays stable near the D/A boundary')
assert.equal(stringForAngle(-10, 'D'), 'A', 'D switches to A only after a deliberate angle crossing')
assert.equal(stringForAngle(4, 'A'), 'A', 'A stays stable near the D/A boundary')
assert.equal(stringForAngle(10, 'A'), 'D', 'A switches to D only after a deliberate angle crossing')
assert.equal(stringForAngle(-28, 'A'), 'A', 'A keeps more room before crossing to E')
assert.equal(stringForAngle(-35, 'A'), 'A', 'A holds through the steeper A/E threshold')
assert.equal(stringForAngle(-36, 'A'), 'E', 'A switches to E only after the steeper deliberate angle crossing')
assert.equal(stringForAngle(23, 'G'), 'G', 'G keeps the string through small jitter toward D')
assert.equal(stringForAngle(19, 'G'), 'D', 'G switches to D after crossing the lower guard band')
assert.equal(stringForAngle(-23, 'E'), 'E', 'E keeps the string through small jitter toward A')
assert.equal(stringForAngle(-19, 'E'), 'A', 'E switches to A after crossing the upper guard band')
const dSelection = createBowStringSelectionState('D')
assert.equal(updateSelectionForAngle(dSelection, 36), 'D', 'one noisy frame above G/D does not switch')
assert.equal(updateSelectionForAngle(dSelection, 28), 'D', 'returning to the D-side band clears the pending switch')
assert.equal(updateSelectionForAngle(dSelection, 36), 'D', 'first deliberate G frame still latches D')
assert.equal(updateSelectionForAngle(dSelection, 36), 'G', 'sustained crossing switches to G')
resetBowStringSelectionState(dSelection, 'D')
assert.equal(updateSelectionForAngle(dSelection, -10), 'D', 'one noisy frame below D/A does not switch')
assert.equal(updateSelectionForAngle(dSelection, -10), 'A', 'sustained crossing switches to A')
const aSelection = createBowStringSelectionState('A')
assert.equal(updateSelectionForAngle(aSelection, 36), 'A', 'single far-angle frame does not jump across adjacent strings')
assert.equal(updateSelectionForAngle(aSelection, 36), 'D', 'far-angle crossing steps from A to D first')
assert.equal(updateSelectionForAngle(aSelection, 36), 'D', 'first continued frame toward G latches D')
assert.equal(updateSelectionForAngle(aSelection, 36), 'G', 'continued far-angle crossing reaches G deliberately')
assert.equal(getBowDirectionForString(86.6, 50, 'E'), 1)
assert.equal(getBowDirectionForString(-86.6, -50, 'E'), -1)
