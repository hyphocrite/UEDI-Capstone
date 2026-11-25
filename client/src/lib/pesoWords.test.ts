import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numberWords, pesoWords } from './pesoWords'

test('whole numbers in words', () => {
  assert.equal(numberWords(0), 'Zero')
  assert.equal(numberWords(15), 'Fifteen')
  assert.equal(numberWords(42), 'Forty-Two')
  assert.equal(numberWords(100), 'One Hundred')
  assert.equal(numberWords(25000), 'Twenty-Five Thousand')
  assert.equal(numberWords(100000), 'One Hundred Thousand')
  assert.equal(numberWords(1002305), 'One Million Two Thousand Three Hundred Five')
})

test('pesos with centavos, as on a form', () => {
  assert.equal(pesoWords(5000), 'Five Thousand Pesos Only')
  assert.equal(pesoWords(1), 'One Peso Only')
  assert.equal(pesoWords(1234.5), 'One Thousand Two Hundred Thirty-Four Pesos and 50/100 Only')
  assert.equal(pesoWords(-1), '')
})
