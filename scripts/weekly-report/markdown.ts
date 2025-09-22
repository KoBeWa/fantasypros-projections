export function wrapAsMarkdown(week: number, content: string) {
  const header = `---
title: "Week ${week} – Weekly Report"
generated: "${new Date().toISOString()}"
---

`;
  return header + content.trim() + "\n";
}
