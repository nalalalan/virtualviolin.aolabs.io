import assert from 'node:assert/strict'
import {
  fingerKeys,
  getBowDirectionForString,
  getPitchInfo,
  getStringForBowVector,
  getStringForRatio,
} from './pitchMapping'

assert.deepEqual(fingerKeys, ['j', 'h', 'g', 'f', 'd', 's', 'a'])

assert.equal(getPitchInfo('A', null, 'first', 'D').noteName, 'A', 'A open')
assert.equal(getPitchInfo('D', 'j', 'first', 'D').noteName, 'D#', 'D first j')
assert.equal(getPitchInfo('D', 'j', 'first', 'Eb').noteName, 'Eb', 'D first j in flat key')
assert.equal(getPitchInfo('D', 'h', 'first', 'D').noteName, 'E', 'D first h')
assert.equal(getPitchInfo('D', 'g', 'first', 'D').noteName, 'F', 'D first g')
assert.equal(getPitchInfo('D', 'f', 'first', 'D').noteName, 'F#', 'D first f')
assert.equal(getPitchInfo('D', 'd', 'first', 'D').noteName, 'G', 'D first d')
assert.equal(getPitchInfo('D', 's', 'first', 'D').noteName, 'G#', 'D first s')
assert.equal(getPitchInfo('D', 'a', 'first', 'D').noteName, 'A', 'D first a')
assert.equal(getPitchInfo('D', 'h', 'third', 'D').noteName, 'G', 'D third h')
assert.equal(getPitchInfo('D', 'a', 'third', 'D').noteName, 'C', 'D third a')
assert.equal(getPitchInfo('D', 'h', 'fifth', 'D').noteName, 'B', 'D fifth h')
assert.equal(getPitchInfo('D', 'h', 'seventh', 'D').noteName, 'D', 'D seventh h')
assert.equal(getPitchInfo('A', 'a', 'first', 'D').noteName, 'E', 'A first a')

assert.equal(getStringForRatio(0), 'G')
assert.equal(getStringForRatio(0.249), 'G')
assert.equal(getStringForRatio(0.25), 'D')
assert.equal(getStringForRatio(0.5), 'A')
assert.equal(getStringForRatio(0.75), 'E')
assert.equal(getStringForRatio(1), 'E')

assert.equal(getStringForBowVector(-0.67, 1, 'A'), 'G')
assert.equal(getStringForBowVector(-0.19, 1, 'A'), 'D')
assert.equal(getStringForBowVector(0.19, 1, 'A'), 'A')
assert.equal(getStringForBowVector(0.67, 1, 'A'), 'E')
assert.equal(getStringForBowVector(0.19, 1, 'D'), 'A')
assert.equal(getStringForBowVector(-0.19, -1, 'A'), 'A')
assert.equal(getBowDirectionForString(0.67, 1, 'E'), 1)
assert.equal(getBowDirectionForString(-0.67, -1, 'E'), -1)
