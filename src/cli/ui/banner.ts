import chalk from "chalk";
import os from "os";
import figlet from "figlet";

export function showBanner(title: string, subtitle?: string, version?: string) {
  const asciiText = figlet.textSync(title, {
    font: "Small Slant",
  });
  const asciiLogo = asciiText
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => chalk.cyanBright(line));

  let cwd = process.cwd();
  const home = os.homedir();
  if (cwd.startsWith(home)) {
    cwd = "~" + cwd.slice(home.length);
  }

  const infoLines = [
    version ? `v${version}` : "",
    subtitle || "The Ultimate API CodeGen",
    "Zero-dependency, Zod-validated",
    cwd,
  ];

  // ensure infoLines has same length as asciiLogo to prevent undefined
  while (infoLines.length < asciiLogo.length) {
    infoLines.push("");
  }

  console.log();
  for (let i = 0; i < asciiLogo.length; i++) {
    // Add right padding to the logo so info lines align perfectly
    const rawLine = asciiText.split("\n").filter((line) => line.trim() !== "")[
      i
    ];
    const padLen = Math.max(0, 50 - rawLine.length); // Assuming figlet width is < 50
    const padding = " ".repeat(padLen);

    console.log(
      `${asciiLogo[i]}${padding}   ${infoLines[i] ? chalk.dim(infoLines[i]) : ""}`,
    );
  }
  console.log();
}
