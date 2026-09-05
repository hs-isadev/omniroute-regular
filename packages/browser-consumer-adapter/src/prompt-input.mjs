export const PROMPT_FOCUS_DELAY_MS=150;

export async function focusPauseAndFill(page,selector,value){
  const input=page.locator(selector).first();
  await input.click();
  await page.waitForTimeout(PROMPT_FOCUS_DELAY_MS);
  await input.fill(value);
}
