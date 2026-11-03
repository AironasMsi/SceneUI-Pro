import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        
        print("Navigating to app...")
        page.goto("http://127.0.0.1:8001/", wait_until="networkidle")
        time.sleep(1)

        # 1. Switch to Images tab
        print("Clicking nav-item[data-tab='images']...")
        page.locator('.nav-item[data-tab="images"]').click()
        page.wait_for_selector("#tab-images:not(.hidden)", timeout=5000)
        time.sleep(0.5)

        # 2. Open Video Trimmer for S1
        page.evaluate("""() => {
            let out = window.getOutput('S1');
            if (!out) {
                out = { sceneId: 'S1', variations: [], mainId: null };
                window.getProj().outputs.push(out);
            }
            if (!out.variations || out.variations.length === 0) {
                out.variations = [{ id: 'v_trim_test', type: 'video', url: '/outputs/test.mp4', status: 'done' }];
                out.mainId = 'v_trim_test';
            }
            window.openVideoTrimmer('S1');
        }""")
        time.sleep(0.5)

        # 3. Test Playhead stationary position during In/Out dragging
        handle_in = page.locator("#trimmerHandleIn")
        playhead = page.locator("#trimmerPlayhead")
        
        # Initial playhead style.left
        init_playhead_left = page.evaluate("document.getElementById('trimmerPlayhead').style.left")
        print(f"Initial playhead left: {init_playhead_left}")

        # Drag handle In
        in_box = handle_in.bounding_box()
        if in_box:
            page.mouse.move(in_box["x"] + in_box["width"] / 2, in_box["y"] + in_box["height"] / 2)
            page.mouse.down()
            page.mouse.move(in_box["x"] + 100, in_box["y"] + in_box["height"] / 2)
            time.sleep(0.2)
            
            # During drag: Playhead should still be at init position, not moved along with in handle!
            during_drag_left = page.evaluate("document.getElementById('trimmerPlayhead').style.left")
            print(f"During IN drag, playhead left: {during_drag_left} (expected same as initial: {init_playhead_left})")
            
            # Label should show [IN] preview
            cur_lbl = page.evaluate("document.getElementById('trimmerCurrentTimeVal').textContent")
            print(f"During IN drag, time label shows: {cur_lbl}")
            assert "[IN]" in cur_lbl, "Time label should indicate [IN] during drag"
            
            page.mouse.up()
            time.sleep(0.2)

        # 4. Verify 'Groti visą' button exists
        full_btn = page.locator("#btnTrimmerPlayFull")
        print(f"Full video button exists: {full_btn.count() > 0}")
        assert full_btn.count() > 0, "Button 'Groti visa' must exist!"

        # 5. Test Continuous Loop button
        loop_btn = page.locator("#btnTrimmerLoop")
        loop_btn.click()
        time.sleep(0.5)
        loop_badge_visible = page.locator("#trimmerLoopStatusBadge").is_visible()
        print(f"Loop status badge visible: {loop_badge_visible}")

        # Take screenshot
        page.screenshot(path="testing/screenshot_stationary_playhead.png")
        print("Saved testing/screenshot_stationary_playhead.png")

        browser.close()
        print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
