import asyncio
import os
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1400, 'height': 900})
        await page.goto('http://127.0.0.1:8001/', wait_until='commit', timeout=15000)
        await page.wait_for_timeout(2500)

        # Wait for project to be fully loaded
        await page.wait_for_function("() => window.getProj && window.getProj() && window.getProj().scenes && window.getProj().scenes.length > 0", timeout=15000)

        # Open BGM Studio
        btn_bgm = page.locator('#btnOpenBgmStudio')
        if await btn_bgm.count() > 0:
            await btn_bgm.click()
            await page.wait_for_timeout(1500)
        else:
            await page.evaluate("window.openBgmStudio()")
            await page.wait_for_timeout(1500)

        # Select Epic Cinematic Journey track
        await page.wait_for_selector('#bgmLibraryList strong:has-text("Epic_Cinematic_Journey")', timeout=5000)
        apply_btn = page.locator('#bgmLibraryList:has-text("Epic_Cinematic_Journey") button:has-text("Pritaikyti šiam filmui")')
        if await apply_btn.count() > 0:
            await apply_btn.first.click()
            await page.wait_for_timeout(1000)
            print('Clicked apply on Epic_Cinematic_Journey')

        # Check static modal layout (no vertical scroll on modal body)
        modal_body_info = await page.evaluate("""() => {
            const body = document.querySelector('#modalBgmStudio .modal-b');
            return {
                clientHeight: body ? body.clientHeight : 0,
                scrollHeight: body ? body.scrollHeight : 0,
                hasVerticalScroll: body ? (body.scrollHeight > body.clientHeight) : false,
                overflowY: body ? window.getComputedStyle(body).overflowY : ''
            };
        }""")
        print('Modal Body Static Check:', modal_body_info)

        # Check presence of ruler lane and placement lane
        ruler_box = await page.locator('#bgmMovieRulerLane').bounding_box()
        placement_box = await page.locator('#bgmMoviePlacementLane').bounding_box()
        print('Ruler Lane Bounding Box:', ruler_box)
        print('Placement Lane Bounding Box:', placement_box)

        # Test setting movie start to 4.0s
        await page.evaluate("window.setBgmMovieStart(4.0)")
        # Put playhead also near 4.0s (close to left handle)
        await page.evaluate("window.seekPreviewToMovieTime(4.0)")
        await page.wait_for_timeout(500)

        val_before = await page.locator('#bgmVideoStartOffsetInput').input_value()
        time_before = await page.locator('#bgmCurrentTimeLabel').text_content()
        print(f'Before drag tests -> VideoStart: {val_before}s, Playhead: {time_before}')

        # 1. TEST CLICKING / DRAGGING LEFT HANDLE (#bgmMovieClipHandleLeft)
        handle_l = page.locator('#bgmMovieClipHandleLeft')
        handle_l_box = await handle_l.bounding_box()
        print('Left Handle Box:', handle_l_box)
        assert handle_l_box is not None, "Left handle must be rendered and visible"

        # Drag left handle to the right (+60px)
        await page.mouse.move(handle_l_box['x'] + handle_l_box['width'] / 2, handle_l_box['y'] + handle_l_box['height'] / 2)
        await page.mouse.down()
        await page.mouse.move(handle_l_box['x'] + handle_l_box['width'] / 2 + 60, handle_l_box['y'] + handle_l_box['height'] / 2, steps=10)
        await page.mouse.up()
        await page.wait_for_timeout(500)

        val_after_handle_drag = await page.locator('#bgmVideoStartOffsetInput').input_value()
        time_after_handle_drag = await page.locator('#bgmCurrentTimeLabel').text_content()
        print(f'After Dragging Left Handle -> VideoStart: {val_after_handle_drag}s (was {val_before}s), Playhead: {time_after_handle_drag}')
        assert float(val_after_handle_drag) > float(val_before), "Dragging left handle must update video start!"

        # 2. TEST CLICKING / DRAGGING PLAYHEAD CAP (#bgmMoviePlayheadCap) IN RULER LANE
        cap = page.locator('#bgmMoviePlayheadCap')
        cap_box = await cap.bounding_box()
        print('Playhead Cap Box:', cap_box)
        assert cap_box is not None, "Cap must be visible in ruler lane"

        # Drag cap to the right (+120px)
        await page.mouse.move(cap_box['x'] + cap_box['width'] / 2, cap_box['y'] + cap_box['height'] / 2)
        await page.mouse.down()
        await page.mouse.move(cap_box['x'] + cap_box['width'] / 2 + 120, cap_box['y'] + cap_box['height'] / 2, steps=10)
        await page.mouse.up()
        await page.wait_for_timeout(500)

        val_after_cap_drag = await page.locator('#bgmVideoStartOffsetInput').input_value()
        time_after_cap_drag = await page.locator('#bgmCurrentTimeLabel').text_content()
        print(f'After Dragging Playhead Cap -> VideoStart: {val_after_cap_drag}s, Playhead: {time_after_cap_drag}')
        assert val_after_cap_drag == val_after_handle_drag, "Dragging playhead cap must NOT change clip start!"

        # 3. TEST CLICKING EMPTY SPACE ON PLACEMENT LANE: MUST DO NOTHING
        empty_x = placement_box['x'] + 15
        empty_y = placement_box['y'] + 15
        await page.mouse.click(empty_x, empty_y)
        await page.wait_for_timeout(400)
        val_after_empty_click = await page.locator('#bgmVideoStartOffsetInput').input_value()
        time_after_empty_click = await page.locator('#bgmCurrentTimeLabel').text_content()
        print(f'After Clicking Empty Placement Lane -> VideoStart: {val_after_empty_click}s, Playhead: {time_after_empty_click}')
        assert val_after_empty_click == val_after_cap_drag, "Empty lane click must not alter video start"
        assert time_after_empty_click == time_after_cap_drag, "Empty lane click must not hijack playhead"

        # 4. TEST REPLAY BUTTON
        replay_btn = page.locator('#btnBgmReplayFromStart')
        await replay_btn.click()
        await page.wait_for_timeout(1500)
        time_after_replay = await page.locator('#bgmCurrentTimeLabel').text_content()
        print('After clicking Replay -> Time:', time_after_replay)

        # Stop preview
        stop_btn = page.locator('#modalBgmStudio button:has-text("⏹ Sustabdyti")')
        await stop_btn.click()
        await page.wait_for_timeout(500)

        os.makedirs('testing', exist_ok=True)
        await page.screenshot(path='testing/bgm_separated_lanes.png')
        print('SUCCESS: Screenshot saved to testing/bgm_separated_lanes.png')

        await browser.close()

asyncio.run(run())
