/** Quote integers that cannot survive JSON.parse so asset supplies stay exact. */
export function parseChainJson(text: string): unknown {
  const fixed = text.replace(/([:[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g, '$1"$2"')
  return JSON.parse(fixed) as unknown
}
