export function wrapAsMarkdown(week, content) {
  const header = `---
title: "Week ${week} – Weekly Report"
generated: "${new Date().toISOString()}"
---

`;
  return header + content.trim() + "\n";
}
