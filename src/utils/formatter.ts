/**
 * formatter.ts
 *
 * Utility for formatting generated TypeScript files with Prettier in-memory.
 */
import prettier from "prettier";

export async function formatContent(
  content: string,
  filepath: string,
): Promise<string> {
  try {
    const options = await prettier.resolveConfig(filepath);
    if (!options) {
      // If the project doesn't have a Prettier config, skip formatting.
      return content;
    }

    return await prettier.format(content, {
      ...options,
      filepath,
    });
  } catch (e) {
    // If formatting fails for any reason, return the unformatted content safely
    return content;
  }
}
