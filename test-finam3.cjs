const fs = require("fs")
const path = require("path")
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
  const secret = (loadEnv(path.join(__dirname, ".env.local")).FINAM_API_SECRET || "").trim()
  const base = "https://api.finam.ru"
  const sData = await (await fetch(`${base}/v1/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }) })).json()
  const jwt = sData && sData.token
  if (!jwt) throw new Error("no JWT")
  const H = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }

  // Полный сессионный ответ — найти account_id/client
  console.log("=== sessions response keys ===")
  console.log(Object.keys(sData))
  console.log(JSON.stringify(sData).slice(0, 600))

  // Инспекция каталога: первые активы MISX и их все поля
  const r = await fetch(`${base}/v1/assets/all?only_active=true`, { headers: H })
  const data = await r.json()
  const assets = (data.assets || []).filter((a) => (a.mic || "").toUpperCase() === "MISX")
  console.log("=== активов на странице:", assets.length, "первых 3 ===")
  for (const a of assets.slice(0, 3)) console.log(JSON.stringify(a))
  const keys = new Set()
  for (const a of assets) Object.keys(a).forEach((k) => keys.add(k))
  console.log("=== все ключи актива ===", Array.from(keys).join(", "))
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1) })