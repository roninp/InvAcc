const fs = require("fs")
const path = require("path")

// Читаем FINAM_API_SECRET из .env.local
function loadEnv(file) {
  const out = {}
  const txt = fs.readFileSync(file, "utf8")
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([\w.-]+)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

async function main() {
  const env = loadEnv(path.join(__dirname, ".env.local"))
  const secret = (env.FINAM_API_SECRET || "").trim()
  if (!secret) throw new Error("FINAM_API_SECRET not found")

  const base = "https://api.finam.ru"
  const hdr = () => ({ "Content-Type": "application/json" })

  // 1) JWT
  const sResp = await fetch(`${base}/v1/sessions`, {
    method: "POST",
    headers: hdr(),
    body: JSON.stringify({ secret }),
  })
  const sData = await sResp.json()
  const jwt = sData && sData.token
  if (!jwt) throw new Error("no JWT: " + JSON.stringify(sData))
  console.log("JWT ok")

  const authHeaders = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }

  // 2) Список счетов — пробуем варианты путей
  const listPaths = ["/v1/accounts", "/v1/accounts/list", "/v1/v1/accounts"]
  for (const p of listPaths) {
    const r = await fetch(`${base}${p}`, { headers: authHeaders })
    console.log(`LIST [${p}] -> ${r.status}`)
    const body = JSON.parse(await r.text())
    console.log("    " + JSON.stringify(body).slice(0, 400))
  }
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1) })