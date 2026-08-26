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
async function sniff(resp) {
  const txt = await resp.text()
  const isApi = txt.trim().startsWith("{") || txt.trim().startsWith("[")
  return { status: resp.status, apiJson: isApi, body: txt.slice(0, 140) }
}
async function main() {
  const secret = (loadEnv(path.join(__dirname, ".env.local")).FINAM_API_SECRET || "").trim()
  const base = "https://api.finam.ru"
  const sData = await (await fetch(`${base}/v1/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }) })).json()
  const jwt = sData && sData.token
  if (!jwt) throw new Error("no JWT")
  const H = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }
  const paths = [
    "/v1/accounts/all", "/v1/account/all", "/v1/accounts/info", "/v1/account-info",
    "/v1/accounts/list?type=1", "/v1/client/list", "/v1/clients/all", "/v1/accounts/user",
    "/v1/account/list", "/v1/cass", "/v1/portfolio/list", "/v1/profiles",
  ]
  for (const p of paths) {
    try {
      const r = await fetch(`${base}${p}`, { headers: H })
      const info = await sniff(r)
      console.log(`[${p}] -> ${info.status} json=${info.apiJson}  ${info.body}`)
    } catch (e) { console.log(`[${p}] -> ERR ${e.message}`) }
  }
  // POST тоже пробуем на /v1/accounts
  try {
    const r = await fetch(`${base}/v1/accounts`, { method: "POST", headers: H, body: "{}" })
    const info = await sniff(r)
    console.log(`[POST /v1/accounts] -> ${info.status} json=${info.apiJson}  ${info.body}`)
  } catch (e) { console.log(`[POST /v1/accounts] ERR ${e.message}`) }
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1) })