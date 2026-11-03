import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1400, "height": 900})
        await page.goto('http://127.0.0.1:8001')
        await page.wait_for_timeout(2500)
        
        await page.click('.nav-item[data-tab="images"]')
        await page.wait_for_timeout(1500)
        
        vols = await page.evaluate('''() => {
            return Array.from(document.querySelectorAll('#imgGrid video')).map(v => ({
                src: (v.src || '').substring(0, 60),
                muted: v.muted,
                volume: v.volume,
                paused: v.paused
            }));
        }''')
        print(f'TOTAL VIDEOS IN IMGGRID: {len(vols)}')
        for v in vols[:5]:
            print(v)
            
        await browser.close()

asyncio.run(run())
