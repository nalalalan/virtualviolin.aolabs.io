import assert from 'node:assert/strict'
import { fingerKeys, getPitchInfo, getStringForRatio, type ViolinString } from './pitchMapping'

const expectedNotes: Record<ViolinString, string[]> = {
  G: ['G', 'G#/Ab', 'A', 'A#/Bb', 'B', 'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F'],
  D: ['D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B', 'C'],
  A: ['A', 'A#/Bb', 'B', 'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G'],
  E: ['E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B', 'C', 'C#/Db', 'D'],
}

for (const [stringName, notes] of Object.entries(expectedNotes) as Array<[ViolinString, string[]]>) {
  assert.equal(getPitchInfo(stringName, null).noteName, notes[0], `${stringName} open`)

  fingerKeys.forEach((key, index) => {
    assert.equal(getPitchInfo(stringName, key).noteName, notes[index + 1], `${stringName} + ${key}`)
  })
}

assert.equal(getStringForRatio(0), 'G')
assert.equal(getStringForRatio(0.249), 'G')
assert.equal(getStringForRatio(0.25), 'D')
assert.equal(getStringForRatio(0.5), 'A')
assert.equal(getStringForRatio(0.75), 'E')
assert.equal(getStringForRatio(1), 'E')
