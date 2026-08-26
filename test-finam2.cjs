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
async function j(resp) {
  const txt = await resp.text()
  try { return JSON.parse(txt) } catch { return { raw: txt.slice(0, 200) } }
}
async function main() {
  const secret = (loadEnv(path.join(__dirname, ".env.local")).FINAM_API_SECRET || "").trim()
  const base = "https://api.finam.ru"
  const sData = await (await fetch(`${base}/v1/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }) })).json()
  const jwt = sData && sData.token
  if (!jwt) throw new Error("no JWT")
  const H = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }

  console.log("=== кандидаты списка счетов ===")
  const paths = [
    "/v1/accounts", "/v1/accounts/", "/v1/account", "/v1/account/",
    "/v1/clients", "/v1/portfolio", "/v1/portfolio/", "/v1/portfolio/info",
    "/v1/client", "/v1/accounts/list", "/v1/accounts/me", "/v1/account/list",
  ]
  for (const p of paths) {
    try {
      const r = await fetch(`${base}${p}`, { headers: H })
      console.log(`[${p}] -> ${r.status}  ${JSON.stringify(await j(r)).slice(0, 180)}`)
    } catch (e) { console.log(`[${p}] -> ERR ${e.message}`) }
  }

  console.log("=== /assets/{sym}/params c account_id и без ===")
  const sym = encodeURIComponent("GAZP@MISX")
  const variants = [
    `/v1/assets/${sym}/params`,
    `/v1/assets/${sym}/params?account_id=1`,
    `/v1/instruments/${sym}/params`,
    `/v1/instruments/${sym}`,
  ]
  for (const p of variants) {
    try {
      const r = await fetch(`${base}${p}`, { headers: H })
      console.log(`[${p}] -> ${r.status}  ${JSON.stringify(await j(r)).slice(0, 200)}`)
    } catch (e) { console.log(`[${p}] -> ERR ${e.message}`) }
  }
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1) })