import { useEffect, useState } from "react"

const KEY = "bitscan.marketInvert"
type State = { global: boolean; pairs: string[] }

function read(): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "") as Partial<State>
    return { global: Boolean(parsed.global), pairs: Array.isArray(parsed.pairs) ? parsed.pairs.filter((item) => typeof item === "string") : [] }
  } catch {
    return { global: false, pairs: [] }
  }
}

export function pairKey(base: string, quote: string) {
  return `${base}/${quote}`
}

export function useMarketInvert() {
  const [state, setState] = useState<State>(read)
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])
  function inverted(base: string, quote: string) {
    return state.global !== state.pairs.includes(pairKey(base, quote))
  }
  function togglePair(base: string, quote: string) {
    const key = pairKey(base, quote)
    setState((current) => ({
      ...current,
      pairs: current.pairs.includes(key) ? current.pairs.filter((item) => item !== key) : [...current.pairs, key],
    }))
  }
  function toggleGlobal() {
    setState((current) => ({ ...current, global: !current.global }))
  }
  return { global: state.global, inverted, togglePair, toggleGlobal }
}

export function invertNumber(value: string | number | null | undefined): number | null {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return null
  return 1 / number
}
