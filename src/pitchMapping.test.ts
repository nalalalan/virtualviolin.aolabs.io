import assert from 'node:assert/strict'
import { fingerKeys, getPitchInfo, getStringForRatio } from './pitchMapping'

assert.deepEqual(fingerKeys, ['f', 'd', 's', 'a'])

assert.equal(getPitchInfo('A', null, 'first', 'D').noteName, 'A', 'A open')
assert.equal(getPitchInfo('A', 'f', 'first', 'D').noteName, 'B', 'A first f')
assert.equal(getPitchInfo('A', 'd', 'first', 'D').noteName, 'C#', 'A first d')
assert.equal(getPitchInfo('A', 's', 'first', 'D').noteName, 'D', 'A first s')
assert.equal(getPitchInfo('A', 'a', 'first', 'D').noteName, 'E', 'A first a')
assert.equal(getPitchInfo('A', 'f', 'third', 'D').noteName, 'D', 'A third f')
assert.equal(getPitchInfo('A', 'a', 'third', 'D').noteName, 'G', 'A third a')
assert.equal(getPitchInfo('A', 'f', 'fifth', 'D').noteName, 'F#', 'A fifth f')
assert.equal(getPitchInfo('A', 'a', 'seventh', 'D').noteName, 'D', 'A seventh a')
assert.equal(getPitchInfo('A', 'd', 'first', 'F').noteName, 'C', 'A first d in F')
assert.equal(getPitchInfo('E', 'f', 'first', 'Bb').noteName, 'F', 'E first f in Bb')

assert.equal(getStringForRatio(0), 'G')
assert.equal(getStringForRatio(0.249), 'G')
assert.equal(getStringForRatio(0.25), 'D')
assert.equal(getStringForRatio(0.5), 'A')
assert.equal(getStringForRatio(0.75), 'E')
assert.equal(getStringForRatio(1), 'E')
