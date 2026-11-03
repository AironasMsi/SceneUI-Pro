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
        
        test_info = await page.evaluate('''() => {
            const cards = Array.from(document.querySelectorAll('.card'));
            const res = [];
            cards.slice(0, 5).forEach((c, idx) => {
                const overlay = c.querySelector('.card-overlay');
                const fsBtn = c.querySelector('button[title="Fullscreen"]');
                let hitElement = null;
                if (fsBtn) {
                    const rect = fsBtn.getBoundingClientRect();
                    hitElement = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
                }
                res.push({
                    cardIndex: idx,
                    cardId: c.id,
                    hasOverlay: !!overlay,
                    overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
                    overlayPointerEvents: overlay ? getComputedStyle(overlay).pointerEvents : null,
                    fsBtnExists: !!fsBtn,
                    hitElementTag: hitElement ? hitElement.tagName : null,
                    hitElementClass: hitElement ? hitElement.className : null,
                    hitElementTitle: hitElement ? hitElement.title : null
                });
            });
            return res;
        }''')
        print('CARD HOVER & HIT TEST (without hover):', test_info)
        
        card1 = await page.query_selector('.card:first-child')
        if card1:
            await card1.hover()
            await page.wait_for_timeout(500)
            hover_hit = await page.evaluate('''() => {
                const c = document.querySelector('.card:first-child');
                const fsBtn = c.querySelector('button[title="Fullscreen"]');
                if (fsBtn) {
                    const rect = fsBtn.getBoundingClientRect();
                    const hit = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
                    return {
                        hitTag: hit ? hit.tagName : null,
                        hitClass: hit ? hit.className : null,
                        hitTitle: hit ? hit.title : null,
                        fsBtnRect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
                    };
                }
                return null;
            }''')
            print('HOVER HIT TEST on card 1:', hover_hit)
            
        await browser.close()

asyncio.run(run())
