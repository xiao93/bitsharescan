import { currentEndpoints, currentNetwork, saveEndpoints, type Endpoints } from "./network.ts"

export type AppConfig = Endpoints

export const DEFAULT_CONFIG: AppConfig = {
  ws: "wss://api.bitshares.dev/ws",
  es: "https://es.bitshares.dev",
  http: "",
}

export function loadConfig(): AppConfig {
  return currentEndpoints()
}

export function saveConfig(config: AppConfig) {
  saveEndpoints(currentNetwork(), {
    ws: config.ws.trim(),
    es: config.es.trim().replace(/\/$/, ""),
    http: config.http.trim().replace(/\/$/, ""),
  })
}
