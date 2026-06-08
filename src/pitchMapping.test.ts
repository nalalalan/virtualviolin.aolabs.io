import assert from 'node:assert/strict'
import {
  fingerKeys,
  getBowDirectionForString,
  getPitchInfo,
  getStringForBowVector,
  getStringForRatio,
} from './pitchMapping'

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
assert.equal(getBowDirectionForString(86.6, 50, 'E'), 1)
assert.equal(getBowDirectionForString(-86.6, -50, 'E'), -1)
