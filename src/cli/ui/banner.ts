import chalk from "chalk";

// Utility to count visible characters (ignores ANSI escape codes)
function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}

export function showBanner(title: string, subtitle?: string) {
  const titleLen = stripAnsi(title).length;
  const subtitleLen = subtitle ? stripAnsi(subtitle).length : 0;
  const width = Math.max(titleLen, subtitleLen) + 8;

  const top = chalk.cyan("╭" + "─".repeat(width) + "╮");
  const bottom = chalk.cyan("╰" + "─".repeat(width) + "╯");

  const pad = (text: string) => {
    const textLen = stripAnsi(text).length;
    const left = Math.floor((width - textLen) / 2);
    const right = width - textLen - left;
    return " ".repeat(left) + text + " ".repeat(right);
  };

  console.log(top);
  console.log(
    chalk.cyan("│") + pad(chalk.bold.whiteBright(title)) + chalk.cyan("│"),
  );
  if (subtitle) {
    console.log(
      chalk.cyan("│") + pad(chalk.dim.italic(subtitle)) + chalk.cyan("│"),
    );
  }
  console.log(bottom);
  console.log();
}
