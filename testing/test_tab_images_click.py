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
        
        card = await page.query_selector('#tab-images .card')
        print('Found card in #tab-images:', bool(card))
        if card:
            await card.hover()
            await page.wait_for_timeout(300)
            await page.screenshot(path='test_hover_card.png')
            print('Saved test_hover_card.png')
            
            fs_btn = await card.query_selector('button[title="Fullscreen"]')
            print('Found fs_btn:', bool(fs_btn))
            if fs_btn:
                await fs_btn.click()
                await page.wait_for_timeout(500)
                is_open = await page.evaluate('''() => document.getElementById('viewer')?.classList.contains('show')''')
                print('Viewer isOpen after click:', is_open)
                await page.screenshot(path='test_viewer_after_btn_click.png')
                print('Saved test_viewer_after_btn_click.png')
                
        await browser.close()

asyncio.run(run())
