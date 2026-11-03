import time
from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        
        print("Navigating to app...")
        page.goto("http://127.0.0.1:8001/", wait_until="networkidle")
        time.sleep(1)

        # 1. Switch to Images tab
        print("Opening images tab...")
        page.locator('.nav-item[data-tab="images"]').click()
        page.wait_for_selector("#tab-images:not(.hidden)", timeout=5000)
        time.sleep(0.5)

        # 2. Open Trimmer with test video
        print("Opening Video Trimmer with test video...")
        page.evaluate("""() => {
            let out = window.getOutput('S1');
            if (!out) {
                out = { sceneId: 'S1', variations: [], mainId: null };
                window.getProj().outputs.push(out);
            }
            out.variations = [{ id: 'v_trim_test', type: 'video', url: '/vault/default_S1_1f036995-284d-47e5-8b50-b991578c6862.mp4', status: 'done' }];
            out.mainId = 'v_trim_test';
            window.openVideoTrimmer('S1');
        }""")
        time.sleep(1)

        # Check modal dimensions
        modal_box = page.locator("#modalVideoTrimmer .modal").bounding_box()
        print("Modal box:", modal_box)
        assert modal_box["width"] >= 890, f"Expected width >= 890, got {modal_box['width']}"
        assert modal_box["height"] >= 680, f"Expected height >= 680, got {modal_box['height']}"

        # 3. Test button wrapping: check Y offset of all buttons in control row
        btn_rewind = page.locator("#modalVideoTrimmer button:has-text('⏪ -0.1s')").bounding_box()
        btn_play = page.locator("#btnTrimmerTogglePlay").bounding_box()
        btn_loop = page.locator("#btnTrimmerLoop").bounding_box()
        btn_full = page.locator("#btnTrimmerPlayFull").bounding_box()
        btn_in_curr = page.locator("#modalVideoTrimmer button:has-text('📌 [In] čia')").bounding_box()
        btn_out_curr = page.locator("#modalVideoTrimmer button:has-text('📌 [Out] čia')").bounding_box()

        print(f"Buttons Y-coordinates: rewind={btn_rewind['y']}, play={btn_play['y']}, loop={btn_loop['y']}, in={btn_in_curr['y']}, out={btn_out_curr['y']}")
        # All buttons in the same row must have matching Y (within 2px tolerance)
        assert abs(btn_rewind['y'] - btn_in_curr['y']) < 3, "Buttons must NOT wrap to second line!"
        assert abs(btn_play['y'] - btn_out_curr['y']) < 3, "Buttons must NOT wrap to second line!"

        initial_modal_h = modal_box["height"]

        # 4. Play video (toggle play)
        print("Clicking play...")
        page.locator("#btnTrimmerTogglePlay").click()
        time.sleep(0.5)

        # Check modal height has NOT changed (zero stretching)
        box_after_play = page.locator("#modalVideoTrimmer .modal").bounding_box()
        print("Modal height after play:", box_after_play["height"])
        assert abs(box_after_play["height"] - initial_modal_h) < 1, "Modal height must remain strictly static during play!"

        # Check button Y positions after play
        btn_play_after = page.locator("#btnTrimmerTogglePlay").bounding_box()
        btn_in_after = page.locator("#modalVideoTrimmer button:has-text('📌 [In] čia')").bounding_box()
        assert abs(btn_play_after['y'] - btn_in_after['y']) < 3, "Buttons must remain in single row during play!"

        # 5. Toggle Loop
        print("Clicking loop...")
        page.locator("#btnTrimmerLoop").click()
        time.sleep(0.5)

        box_after_loop = page.locator("#modalVideoTrimmer .modal").bounding_box()
        print("Modal height after loop:", box_after_loop["height"])
        assert abs(box_after_loop["height"] - initial_modal_h) < 1, "Modal height must remain strictly static during loop!"

        # 6. Pause video to test dragging
        page.locator("#btnTrimmerLoop").click()
        time.sleep(0.3)

        # 7. Test Dragging IN handle and verify live frame seeking
        print("Testing dragging IN handle...")
        handle_in = page.locator("#trimmerHandleIn")
        in_box = handle_in.bounding_box()
        
        # Track seeked events on video
        page.evaluate("""() => {
            window.__seekCount = 0;
            const vid = document.getElementById('trimmerVideoPlayer');
            vid.addEventListener('seeked', () => { window.__seekCount++; });
        }""")

        page.mouse.move(in_box["x"] + in_box["width"] / 2, in_box["y"] + in_box["height"] / 2)
        page.mouse.down()
        
        # Drag progressively across 5 steps
        for step in range(5):
            page.mouse.move(in_box["x"] + 30 * (step + 1), in_box["y"] + in_box["height"] / 2)
            time.sleep(0.1)

        page.mouse.up()
        time.sleep(0.4)

        seek_count = page.evaluate("window.__seekCount")
        vid_time = page.evaluate("document.getElementById('trimmerVideoPlayer').currentTime")
        in_val = page.evaluate("parseFloat(document.getElementById('trimmerInSec').value)")
        print(f"After IN drag: seekCount={seek_count}, vid_currentTime={vid_time:.2f}, inVal={in_val:.2f}")
        assert seek_count > 0, "Video must have decoded and seeked frames during drag!"
        assert abs(vid_time - in_val) < 0.15, "Video currentTime must match IN handle position!"

        # 8. Test Dragging OUT handle
        print("Testing dragging OUT handle...")
        handle_out = page.locator("#trimmerHandleOut")
        out_box = handle_out.bounding_box()

        page.evaluate("window.__seekCount = 0;")
        page.mouse.move(out_box["x"] + out_box["width"] / 2, out_box["y"] + out_box["height"] / 2)
        page.mouse.down()
        
        for step in range(5):
            page.mouse.move(out_box["x"] - 25 * (step + 1), out_box["y"] + out_box["height"] / 2)
            time.sleep(0.1)

        page.mouse.up()
        time.sleep(0.4)

        seek_count_out = page.evaluate("window.__seekCount")
        vid_time_out = page.evaluate("document.getElementById('trimmerVideoPlayer').currentTime")
        out_val = page.evaluate("parseFloat(document.getElementById('trimmerOutSec').value)")
        print(f"After OUT drag: seekCount={seek_count_out}, vid_currentTime={vid_time_out:.2f}, outVal={out_val:.2f}")
        assert seek_count_out > 0, "Video must have decoded and seeked frames during OUT drag!"
        assert abs(vid_time_out - out_val) < 0.15, "Video currentTime must match OUT handle position!"

        # Screenshot proof
        page.screenshot(path="testing/static_trimmer_verified.png")
        print("All tests passed! Screenshot saved to testing/static_trimmer_verified.png")

        browser.close()

if __name__ == "__main__":
    run_test()
