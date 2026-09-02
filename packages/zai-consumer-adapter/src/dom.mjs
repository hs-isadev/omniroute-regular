export const ZAI_ASSISTANT_RESPONSE_SELECTOR='.chat-assistant #response-content-container .markdown-prose';
export const ZAI_PEAK_HOUR_PATTERN=/\b(?:in|during)\s+peak\s+hours?\b/i;
export const ZAI_FLASH_SWITCH_PATTERN=/\bswitch\s+to\s+glm\s*-?\s*5\s*\.?\s*3\s+flash\b/i;

export function cleanAssistantParts(parts) {
  return parts
    .filter(part=>!part.thinking)
    .map(part=>String(part.text??'').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function decidePeakHourAction(noticeText,actionLabels=[]) {
  if(!ZAI_PEAK_HOUR_PATTERN.test(String(noticeText??'')))return {action:'none',label:null};
  const label=actionLabels.map(value=>String(value).trim()).find(value=>ZAI_FLASH_SWITCH_PATTERN.test(value));
  return label?{action:'switch',label}:{action:'fallback',label:null};
}
