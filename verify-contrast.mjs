import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } })
const logs = []
page.on('console', (msg) => { if (msg.type() === 'error') logs.push(msg.text()) })
page.on('pageerror', (err) => logs.push('pageerror: ' + err.message))

await page.goto('http://127.0.0.1:5173')
await page.locator('.segmented--mode .segmented__opt', { hasText: 'Letra' }).click()

const searchBox = page.locator('.lyric-search input')
await searchBox.fill('Unbreakable Michael Jackson')
await page.waitForSelector('.lyric-hit', { timeout: 20000 })
await page.locator('.lyric-hit').first().click()
await page.waitForTimeout(800)

for (const [id, label] of [['abnt', 'ABNT'], ['newspaper', 'Jornal'], ['minimal', 'Minimalista']]) {
  await page.locator('.style-grid .style-card', { hasText: label }).click()
  await page.waitForTimeout(400)
  const card = page.locator('.preview .card--lyric').first()
  await card.screenshot({ path: `contrast-${id}.png` })
  console.log('saved', id)
}

console.log('console errors:', logs)
await browser.close()
