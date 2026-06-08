import assert from 'node:assert/strict'
import {
  fingerKeys,
  getBowDirectionForString,
  getPitchInfo,
  getStringForBowVector,
  getStringForRatio,
} from './pitchMapping'

function vectorForAngle(angle: number) {
  const radians = (angle * Math.PI) / 180
  return { dx: Math.cos(radians) * 100, dy: -Math.sin(radians) * 100 }
}

function stringForAngle(angle: number, fallback: Parameters<typeof getStringForBowVector>[2]) {
  const vector = vectorForAngle(angle)
  return getStringForBowVector(vector.dx, vector.dy, fallback)
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
assert.equal(getStringForBowVector(86.6, 50, 'A'), 'E')
assert.equal(getStringForBowVector(-86.6, 50, 'A'), 'G')
assert.equal(getStringForBowVector(-98.5, 17.4, 'A'), 'D')
assert.equal(stringForAngle(18, 'D'), 'D', 'D stays stable near the G/D boundary')
assert.equal(stringForAngle(28, 'D'), 'G', 'D switches to G only after a deliberate angle crossing')
assert.equal(stringForAngle(-4, 'D'), 'D', 'D stays stable near the D/A boundary')
assert.equal(stringForAngle(-10, 'D'), 'A', 'D switches to A only after a deliberate angle crossing')
assert.equal(stringForAngle(4, 'A'), 'A', 'A stays stable near the D/A boundary')
assert.equal(stringForAngle(10, 'A'), 'D', 'A switches to D only after a deliberate angle crossing')
assert.equal(stringForAngle(-18, 'A'), 'A', 'A stays stable near the A/E boundary')
assert.equal(stringForAngle(-30, 'A'), 'E', 'A switches to E only after a deliberate angle crossing')
assert.equal(stringForAngle(16, 'G'), 'G', 'G keeps the string through small jitter toward D')
assert.equal(stringForAngle(12, 'G'), 'D', 'G switches to D after crossing the lower guard band')
assert.equal(stringForAngle(-16, 'E'), 'E', 'E keeps the string through small jitter toward A')
assert.equal(stringForAngle(-12, 'E'), 'A', 'E switches to A after crossing the upper guard band')
assert.equal(getBowDirectionForString(86.6, 50, 'E'), 1)
assert.equal(getBowDirectionForString(-86.6, -50, 'E'), -1)
