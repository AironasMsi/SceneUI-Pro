import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1400, "height": 900})
        await page.goto('http://127.0.0.1:8001')
        await page.wait_for_timeout(2500)
        await page.click('.nav-item[data-tab="images"]')
        await page.wait_for_timeout(1000)
        
        card17 = await page.query_selector('.card:has-text("S17")')
        if card17:
            await card17.hover()
            fs = await card17.query_selector('button[title="Fullscreen"]')
            if fs:
                await fs.click()
                await page.wait_for_timeout(1000)
                
                info = await page.evaluate('''() => {
                    const vid = document.getElementById('vwVideo');
                    const img = document.getElementById('vwImg');
                    return {
                        stateViewerContext: window.state?.viewerContext,
                        stateViewerIndex: window.state?.viewerIndex,
                        activeId: window.state?.viewerList ? window.state.viewerList[window.state.viewerIndex] : null,
                        vidDisplay: vid ? getComputedStyle(vid).display : null,
                        imgDisplay: img ? getComputedStyle(img).display : null,
                        imgSrc: img ? img.src : null,
                        vidSrc: vid ? vid.src : null
                    };
                }''')
                print('VIEWER MEDIA STATE FOR S17:', info)
        await browser.close()

asyncio.run(run())
