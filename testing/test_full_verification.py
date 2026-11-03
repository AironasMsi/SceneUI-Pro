import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1400, "height": 900})
        await page.goto('http://127.0.0.1:8001')
        await page.wait_for_timeout(2500)
        
        # 1. Tikriname, ar pradžioje groja koks nors garsas
        initial_audio = await page.evaluate('''() => {
            const all = Array.from(document.querySelectorAll('audio, video'));
            return all.filter(m => !m.paused && !m.muted && m.volume > 0).map(m => ({
                tag: m.tagName,
                id: m.id,
                src: m.src
            }));
        }''')
        print('INITIAL AUDIBLE MEDIA (should be EMPTY):', initial_audio)
        
        # 2. Einame per visus skirtukus ir tikriname garsą
        tabs = ['script', 'workflow', 'style_lab', 'characters', 'audio', 'images', 'review', 'timeline', 'render']
        for t in tabs:
            await page.click(f'.nav-item[data-tab="{t}"]')
            await page.wait_for_timeout(600)
            audible = await page.evaluate('''() => {
                const all = Array.from(document.querySelectorAll('audio, video'));
                return all.filter(m => !m.paused && !m.muted && m.volume > 0).map(m => ({
                    tag: m.tagName,
                    id: m.id,
                    src: m.src
                }));
            }''')
            if audible:
                print(f'TAB {t} HAS AUDIBLE MEDIA:', audible)
            else:
                print(f'TAB {t}: SILENT (OK)')
                
        # 3. Grįžtame į Images ir atidarome S17 video peržiūrą per kortelės FS mygtuką
        await page.click('.nav-item[data-tab="images"]')
        await page.wait_for_timeout(1000)
        
        card17 = await page.query_selector('.card:has-text("S17")')
        if card17:
            await card17.hover()
            fs = await card17.query_selector('button[title="Fullscreen"]')
            if fs:
                await fs.click()
                await page.wait_for_timeout(1000)
                await page.screenshot(path='s17_open_proof.png')
                print('Screenshot saved: s17_open_proof.png')
                
                is_open = await page.evaluate('''() => document.getElementById('viewer')?.classList.contains('show')''')
                print('S17 Viewer is OPEN?', is_open)
                
                # Paspaudžiame ant video (turi perjungti play/pause)
                vwVid = await page.query_selector('#vwVideo')
                if vwVid:
                    p1 = await page.evaluate('''() => document.getElementById('vwVideo').paused''')
                    await vwVid.click()
                    await page.wait_for_timeout(300)
                    p2 = await page.evaluate('''() => document.getElementById('vwVideo').paused''')
                    print(f'Click video toggled paused: {p1} -> {p2}')
                    
                # Uždarome viewer per ESC klavišą
                await page.keyboard.press('Escape')
                await page.wait_for_timeout(500)
                is_closed = await page.evaluate('''() => !document.getElementById('viewer')?.classList.contains('show')''')
                print('Viewer is CLOSED on ESC?', is_closed)
                
                after_esc = await page.evaluate('''() => {
                    const all = Array.from(document.querySelectorAll('audio, video'));
                    return all.filter(m => !m.paused && !m.muted && m.volume > 0);
                }''')
                print('Audible media after ESC (should be 0):', len(after_esc))
                
        await browser.close()

asyncio.run(run())
