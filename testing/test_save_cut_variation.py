import time
import os
from playwright.sync_api import sync_playwright

def test_save_cut_as_variation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        print("Navigating to application...")
        page.goto("http://127.0.0.1:8001/", wait_until="networkidle")
        time.sleep(1)

        print("Navigating to Images tab...")
        page.locator('.nav-item[data-tab="images"]').click()
        page.wait_for_selector("#tab-images:not(.hidden)", timeout=5000)
        time.sleep(0.5)

        # Set up S1 with original video variation
        print("Setting up S1 with initial video variation...")
        init_state = page.evaluate("""() => {
            let out = window.getOutput('S1');
            if (!out) {
                out = { sceneId: 'S1', variations: [], mainId: null };
                window.getProj().outputs.push(out);
            }
            out.variations = [{
                id: 'v_orig_1',
                type: 'video',
                url: '/vault/default_S1_1f036995-284d-47e5-8b50-b991578c6862.mp4',
                status: 'done',
                wfMode: 'I2V Wan',
                createdAt: '2026-10-07 20:00:00'
            }];
            out.mainId = 'v_orig_1';
            window.saveCurrentProject();
            window.triggerUIRefresh('images');
            return { varCount: out.variations.length, mainId: out.mainId };
        }""")
        print("Initial state:", init_state)
        assert init_state["varCount"] == 1

        # Open Trimmer
        print("Opening Video Trimmer...")
        page.evaluate("window.openVideoTrimmer('S1')")
        page.wait_for_selector("#modalVideoTrimmer.show", timeout=5000)
        time.sleep(0.5)

        # Change In and Out points
        print("Setting trim range: In=0.50s, Out=2.50s...")
        page.evaluate("""() => {
            const inSl = document.getElementById('trimmerInSlider');
            if (inSl) {
                inSl.value = 0.50;
                inSl.dispatchEvent(new Event('input'));
            }
            const outSl = document.getElementById('trimmerOutSlider');
            if (outSl) {
                outSl.value = 2.50;
                outSl.dispatchEvent(new Event('input'));
            }
        }""")

        # Click Save Trim button
        print("Clicking '💾 Išsaugoti atkarpą'...")
        page.locator("#btnSaveVideoTrim").click()

        # Wait for trimmer modal to close after cut process finishes
        page.locator("#modalVideoTrimmer").wait_for(state="hidden", timeout=15000)
        print("Video Trimmer modal closed successfully!")
        time.sleep(1)

        # Check variations and main variant in project state
        after_state = page.evaluate("""() => {
            let out = window.getOutput('S1');
            return {
                varCount: out.variations.length,
                mainId: out.mainId,
                variations: out.variations.map(v => ({ id: v.id, url: v.url, wfMode: v.wfMode, type: v.type }))
            };
        }""")
        print("After state:", after_state)

        # Must have 2 variations now!
        assert after_state["varCount"] == 2, f"Expected 2 variations, got {after_state['varCount']}"
        assert after_state["mainId"].startswith("v_cut_"), f"Main ID should be the new cut variation, got {after_state['mainId']}"

        cut_var = [v for v in after_state["variations"] if v["id"] == after_state["mainId"]][0]
        print("Created cut variation:", cut_var)
        assert "cut_S1_" in cut_var["url"], f"URL should be newly created cut mp4, got {cut_var['url']}"
        assert "Cut" in cut_var["wfMode"], f"wfMode should mention Cut, got {cut_var['wfMode']}"

        # Verify physical file was created on disk
        clean_filename = cut_var["url"].replace("/vault/", "")
        local_disk_path = os.path.join("data", "vault", clean_filename)
        assert os.path.exists(local_disk_path), f"File {local_disk_path} must exist on disk!"
        file_size = os.path.getsize(local_disk_path)
        print(f"Verified physical cut file on disk: {local_disk_path} (size: {file_size} bytes)")
        assert file_size > 10000, "File size must be a valid video"

        # Now open variations dialog to verify visual rendering of the cut variation
        print("Opening variations modal (#modalVars)...")
        page.evaluate("window.openVars('S1')")
        page.wait_for_selector("#modalVars.show", timeout=5000)
        time.sleep(0.5)

        # Check that CUT badge is rendered
        cut_badge = page.locator("#modalVars .badge:has-text('CUT')")
        assert cut_badge.count() > 0, "Expected ✂️ CUT badge in variations modal"
        print("Found CUT badge in variations dialog!")

        # Take screenshot proof
        page.screenshot(path="testing/cut_variation_verified.png")
        print("Screenshot saved to testing/cut_variation_verified.png")

        browser.close()

if __name__ == "__main__":
    test_save_cut_as_variation()
