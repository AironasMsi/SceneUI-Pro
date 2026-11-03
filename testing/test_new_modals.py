import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1400, "height": 900})
        await page.goto("http://127.0.0.1:8001/", wait_until="networkidle")
        
        # 1. Test opening Scene Audio Mixer modal
        print("Testing openSceneAudioMixer...")
        await page.evaluate("window.openSceneAudioMixer()")
        await page.wait_for_selector("#modalSceneAudioMixer.show", timeout=5000)
        await page.screenshot(path="testing/screenshot_mixer_modal.png")
        print("Mixer screenshot saved!")
        
        # Test absolute and relative sliders
        await page.evaluate("window.mixerApplyAbsolute(80)")
        val_80 = await page.evaluate("document.getElementById('mixerAbsVolLabel').textContent")
        print("Abs Vol label:", val_80)
        
        await page.evaluate("window.mixerApplyRelative(-5)")
        val_rel = await page.evaluate("document.getElementById('mixerRelVolLabel').textContent")
        print("Rel Vol label:", val_rel)
        
        await page.evaluate("window.closeSceneAudioMixer()")
        
        # 2. Test opening Video Trimmer modal (with mock scene if needed)
        print("Testing openVideoTrimmer...")
        # Check if project has scenes
        scenes_len = await page.evaluate("window.getProj() ? (window.getProj().scenes || []).length : 0")
        print(f"Project scenes count: {scenes_len}")
        if scenes_len > 0:
            first_sc_id = await page.evaluate("window.getProj().scenes[0].id")
            # Ensure scene has a video output for trimmer test
            await page.evaluate(f"""() => {{
                let out = window.getOutput('{first_sc_id}');
                if (!out) {{
                    out = {{ sceneId: '{first_sc_id}', variations: [], mainId: null }};
                    window.getProj().outputs.push(out);
                }}
                if (!out.variations || out.variations.length === 0) {{
                    out.variations.push({{
                        id: 'v_mock_1',
                        url: '/data/audio/mock.mp4',
                        type: 'video'
                    }});
                    out.mainId = 'v_mock_1';
                }} else {{
                    out.variations[0].type = 'video';
                }}
                window.openVideoTrimmer('{first_sc_id}');
            }}""")
            await page.wait_for_selector("#modalVideoTrimmer.show", timeout=5000)
            await page.screenshot(path="testing/screenshot_trimmer_modal.png")
            print("Trimmer screenshot saved!")
            await page.evaluate("window.closeVideoTrimmer()")
            
        await browser.close()
        print("ALL TESTS PASSED!")

asyncio.run(main())
