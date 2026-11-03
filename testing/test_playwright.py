import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1400, "height": 900})
        page.on('console', lambda msg: print(f'CONSOLE [{msg.type}]: {msg.text}'))
        page.on('pageerror', lambda err: print(f'PAGEERROR: {err}'))
        await page.goto('http://127.0.0.1:8001')
        await page.wait_for_timeout(2500)
        
        active_tab = await page.evaluate('''() => {
            return {
                lastActiveTab: window.getProj ? window.getProj().lastActiveTab : null,
                scenesCount: window.getProj && window.getProj().scenes ? window.getProj().scenes.length : 0,
                outputsCount: window.getProj && window.getProj().outputs ? window.getProj().outputs.length : 0,
                activeTabDom: document.querySelector('.nav-item.active')?.dataset.tab
            };
        }''')
        print('Active Tab info:', active_tab)
        
        # Pereiname į Images tabą
        await page.click('.nav-item[data-tab="images"]')
        await page.wait_for_timeout(1500)
        await page.screenshot(path='test_images_tab.png')
        print('Saved test_images_tab.png')
        
        # Bandome atidaryti viewer per pirmą rastą kortelę arba window.openViewer
        viewer_res = await page.evaluate('''() => {
            const proj = window.getProj();
            const firstScene = proj.scenes && proj.scenes[0] ? proj.scenes[0].id : null;
            if (firstScene) {
                window.openViewer(firstScene);
                const viewer = document.getElementById('viewer');
                return {
                    firstScene,
                    viewerShow: viewer ? viewer.classList.contains('show') : false,
                    viewerDisplay: viewer ? getComputedStyle(viewer).display : null,
                    vwVideoDisplay: document.getElementById('vwVideo')?.style.display,
                    vwImgDisplay: document.getElementById('vwImg')?.style.display,
                    vwVideoSrc: document.getElementById('vwVideo')?.src,
                    viewerList: window.state?.viewerList,
                    viewerIndex: window.state?.viewerIndex
                };
            }
            return { error: 'No scenes found' };
        }''')
        print('Viewer open result:', viewer_res)
        await page.wait_for_timeout(1500)
        await page.screenshot(path='test_viewer_open.png')
        print('Saved test_viewer_open.png')

        # Tikriname visus media elementus
        audio_check = await page.evaluate('''() => {
            const audios = Array.from(document.querySelectorAll('audio, video')).map(el => ({
                tag: el.tagName,
                id: el.id,
                src: (el.src || el.currentSrc || '').substring(0, 80),
                paused: el.paused,
                muted: el.muted,
                volume: el.volume,
                display: getComputedStyle(el).display,
                parentNode: el.parentElement ? el.parentElement.className : null
            }));
            return {
                mediaElements: audios,
                globalPlayingAudio: !!window._currentPlayingAudio
            };
        }''')
        print('Media elements status:', audio_check)
        
        # Bandome uždaryti viewer
        await page.evaluate('''() => {
            if (typeof window.closeViewer === 'function') window.closeViewer();
        }''')
        await page.wait_for_timeout(1000)
        await page.screenshot(path='test_after_close.png')
        print('Saved test_after_close.png')

        audio_after_close = await page.evaluate('''() => {
            return Array.from(document.querySelectorAll('audio, video')).map(el => ({
                id: el.id,
                paused: el.paused,
                muted: el.muted,
                volume: el.volume
            }));
        }''')
        print('Media elements after close:', audio_after_close)
        
        await browser.close()

asyncio.run(run())
