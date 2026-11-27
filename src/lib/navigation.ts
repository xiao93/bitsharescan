import { createContext, useContext } from "react"

export const NavigationContext = createContext({ isNavigating: false })

export function useNavigating() {
  return useContext(NavigationContext)
}
