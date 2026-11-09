function sameSequence(tokens: string[], left: number, right: number, size: number): boolean {
  for (let offset = 0; offset < size; offset++) {
    if (tokens[left + offset] !== tokens[right + offset]) return false
  }
  return true
}

function compressAdjacentRepeatedPhrases(tokens: string[]): string[] {
  const output: string[] = []
  let index = 0

  while (index < tokens.length) {
    let compressed = false
    const maxPhraseSize = Math.min(12, Math.floor((tokens.length - index) / 2))

    for (let size = maxPhraseSize; size >= 2; size--) {
      let repeats = 1
      while (
        index + (repeats + 1) * size <= tokens.length &&
        sameSequence(tokens, index, index + repeats * size, size)
      ) {
        repeats++
      }

      if (repeats > 1) {
        output.push(...tokens.slice(index, index + size))
        index += repeats * size
        compressed = true
        break
      }
    }

    if (compressed) continue

    const token = tokens[index]
    if (token !== output[output.length - 1]) output.push(token)
    index++
  }

  return output
}

function removeRepeatedLeadingCode(tokens: string[]): string[] {
  const first = tokens[0]
  if (!first || !/^[A-Z]{1,4}(\.\d+)?$|^\d{3}(\.[A-Z0-9]+)?$|^\d{5,6}\.?$|^[1-9]\d{5}$/i.test(first)) {
    return tokens
  }

  const result = [first]
  for (let index = 1; index < tokens.length; index++) {
    if (tokens[index] === first && index < 10) continue
    result.push(tokens[index])
  }
  return result
}

export function normalizeUraian(value: string): string {
  const tokens = value
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  let normalized = removeRepeatedLeadingCode(tokens)
  let previous = ''

  while (previous !== normalized.join('\u0000')) {
    previous = normalized.join('\u0000')
    normalized = compressAdjacentRepeatedPhrases(normalized)
  }

  return normalized.join(' ')
}
