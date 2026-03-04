/**
 * Extract and parse JSON from an LLM response that may be wrapped in
 * markdown code fences (```json ... ``` or ``` ... ```).
 */
export function extractJson(text: string): unknown {
  // Try direct parse first
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to code-fence stripping
  }

  // Strip markdown code fences: ```json\n...\n``` or ```\n...\n```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }

  // Try to find the first JSON structure (array or object) in the text
  const jsonStart = trimmed.search(/[\[{]/);
  const jsonEndBracket = trimmed.lastIndexOf("]");
  const jsonEndBrace = trimmed.lastIndexOf("}");
  const jsonEnd = Math.max(jsonEndBracket, jsonEndBrace);

  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  }

  // Nothing worked -- let JSON.parse throw for the caller's catch block
  return JSON.parse(trimmed);
}
