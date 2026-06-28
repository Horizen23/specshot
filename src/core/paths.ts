import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let templatesBaseDir: string | null = null;

export function getTemplatesBaseDir(): string {
  if (templatesBaseDir) return templatesBaseDir;
  const candidates = [
    path.join(__dirname, "../../templates/presets"),
    path.join(__dirname, "../templates/presets"),
    path.join(__dirname, "../../../templates/presets"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      templatesBaseDir = candidate;
      return candidate;
    }
  }
  throw new Error("Could not locate templates/presets directory.");
}

export function getPresetDir(preset: string): string {
  return path.join(getTemplatesBaseDir(), preset);
}

export function getOneTimeDir(preset: string): string {
  return path.join(getPresetDir(preset), "one-time");
}

export function getRepeatableDir(preset: string): string {
  return path.join(getPresetDir(preset), "repeatable");
}

export function getGeneratorDir(preset: string): string {
  return path.join(getRepeatableDir(preset), "generator");
}

export function getMswDir(preset: string): string {
  return path.join(getRepeatableDir(preset), "msw");
}

export function hasOneTimeDir(preset: string): boolean {
  return fs.existsSync(getOneTimeDir(preset));
}

export function assertPresetExists(preset: string): void {
  const presetDir = getPresetDir(preset);
  if (!fs.existsSync(presetDir)) {
    throw new Error(
      `Preset "${preset}" not found at ${presetDir}\n` +
      `Available presets can be listed with: npx specshot templates list`
    );
  }
}

export function assertPresetHasGenerator(preset: string): void {
  assertPresetExists(preset);
  const genDir = getGeneratorDir(preset);
  if (!fs.existsSync(genDir)) {
    throw new Error(
      `Preset "${preset}" is missing repeatable/generator/ directory at ${genDir}\n` +
      `Each preset must have a repeatable/generator/ directory with .hbs template files.`
    );
  }
}
