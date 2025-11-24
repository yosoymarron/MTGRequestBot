const CHARACTER_LIMIT = 3500;

export function sanitizeInput(userInput: string): string {
  // 1. Cap the input at the character limit
  let finalValue = userInput.substring(0, CHARACTER_LIMIT);

  // 2. Robust sanitization for safe inclusion in a JSON string value
  // Escape backslashes first to prevent them from prematurely escaping quotes
  finalValue = finalValue
    .replace(/\\/g, '\\\\') // Escape literal backslashes
    .replace(/"/g, '\\"') // Escape double quotes for JSON
    .replace(/[\r\n\t]/g, ' ') // Replace whitespace with space
    .trim();

  return finalValue;
}

