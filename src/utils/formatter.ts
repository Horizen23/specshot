/**
 * formatter.ts
 *
 * Utility for formatting generated TypeScript files with Prettier.
 * Isolates the child-process I/O side-effect from pure code-generation logic.
 */

/**
 * Runs `prettier --write` over all `.ts` / `.tsx` files inside the given
 * directory.  Silently no-ops when Prettier is not installed or fails.
 *
 * @param dir - Absolute path to the directory whose files should be formatted.
 */
export async function formatGeneratedFiles(dir: string): Promise<void> {
  try {
    const { execSync } = await import("child_process");
    console.log(`\nFormatting generated files...`);
    execSync(`npx prettier --write "${dir}/**/*.{ts,tsx}"`, {
      stdio: "ignore",
    });
  } catch (_e) {
    // Prettier is optional — ignore failures silently.
  }
}
