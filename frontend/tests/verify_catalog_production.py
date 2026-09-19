from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT = ROOT / "verify-catalog-dinos.png"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(ignore_https_errors=True, viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    console_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    page.goto("https://localhost/shop", wait_until="networkidle", timeout=90_000)
    page.get_by_role("button", name="สัตว์จับได้").click()
    page.wait_for_url("**/shop?type=dino", timeout=30_000)
    page.wait_for_load_state("networkidle")

    cards = page.locator('a[aria-label^="ดูรายละเอียดสินค้า"]')
    cards.first.wait_for(state="visible", timeout=30_000)
    card_count = cards.count()
    assert card_count >= 20, f"expected a full dino page, got {card_count} cards"
    assert page.get_by_text("DINO", exact=True).count() >= 1, "dino badges are missing"

    image_state = page.locator('a[aria-label^="ดูรายละเอียดสินค้า"] img').evaluate_all(
        "images => images.map(image => ({src: image.currentSrc, complete: image.complete, width: image.naturalWidth}))"
    )
    broken = [image for image in image_state if not image["complete"] or image["width"] <= 0]
    assert not broken, f"broken catalog artwork: {broken[:3]}"

    first_name = cards.first.get_attribute("aria-label")
    cards.first.click()
    page.wait_for_load_state("networkidle")
    page.get_by_text("DINO DELIVERY", exact=True).first.wait_for(state="visible", timeout=30_000)
    assert page.get_by_text("DINO DELIVERY", exact=True).count() >= 1
    assert page.get_by_text("ARK Spawn Command", exact=True).count() >= 1
    assert any("SpawnDino" in value for value in page.locator("code").all_text_contents())

    page.screenshot(path=str(SCREENSHOT), full_page=True)
    app_errors = [
        message for message in console_errors
        if "listener indicated an asynchronous response" not in message
        and "status of 401" not in message  # expected anonymous /auth/me probe
    ]
    assert not app_errors, f"application console errors: {app_errors}"

    print({
        "catalog_cards": len(image_state),
        "first_product": first_name,
        "broken_images": len(broken),
        "console_errors": len(app_errors),
        "screenshot": str(SCREENSHOT),
    })
    browser.close()
