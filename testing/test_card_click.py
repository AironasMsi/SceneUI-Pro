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
        
        # Tikriname kortelių elementus ir mygtukus
        card_info = await page.evaluate('''() => {
            const cards = Array.from(document.querySelectorAll('.card'));
            return {
                cardsCount: cards.length,
                firstCardHtml: cards[0] ? cards[0].outerHTML.substring(0, 500) : null
            };
        }''')
        print('CARD INFO:', card_info)
        
        # Bandome paspausti ant pirmoje kortelėje esančio fullscreen mygtuko
        fs_btn = await page.query_selector('.card-overlay button[title="Fullscreen"]')
        print('FS BTN found:', bool(fs_btn))
        if fs_btn:
            await fs_btn.click()
            await page.wait_for_timeout(1000)
            is_show = await page.evaluate('''() => document.getElementById('viewer')?.classList.contains('show')''')
            print('Viewer opened after clicking FS button?', is_show)
            await page.screenshot(path='test_fs_click.png')
            print('Saved test_fs_click.png')
            
        await browser.close()

asyncio.run(run())
