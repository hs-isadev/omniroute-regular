export const ZAI_ASSISTANT_RESPONSE_SELECTOR='.chat-assistant #response-content-container .markdown-prose';

export function cleanAssistantParts(parts) {
  return parts
    .filter(part=>!part.thinking)
    .map(part=>String(part.text??'').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}
