const jd = "https://www.appitsoftware.com/careers/junior-developer-ai-tools-hyderabad";

(async () => {
  const t0 = Date.now();
  const res = await fetch("http://localhost:3000/api/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jd, model: "primary" }),
  });
  const data = await res.json();
  console.log("optimize ->", res.status, Date.now() - t0 + "ms");
  if (!res.ok) {
    console.log(data);
    process.exit(1);
  }
  console.log("writer used:", data.usedWriter);
  console.log("score:", data.scoreBefore, "->", data.scoreAfter);
  console.log("keywords:", data.keywords.slice(0, 8).map((k) => k.term).join(", "));
  console.log("summaryAfter:", data.edits.summaryAfter.slice(0, 160));
  console.log("bullet sample:", data.edits.bulletDiffs[0].after[0].slice(0, 160));

  // compile the rewritten content
  const t1 = Date.now();
  const c = await fetch("http://localhost:3000/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: {
        summary: data.edits.summary,
        skills: data.edits.skills,
        projects: data.edits.projects,
      },
    }),
  });
  console.log("compile ->", c.status, Date.now() - t1 + "ms", c.headers.get("content-type"));
  if (!c.ok) {
    console.log(await c.text());
    process.exit(1);
  }
  const pdf = Buffer.from(await c.arrayBuffer());
  require("fs").writeFileSync("scripts/e2e-out.pdf", pdf);
  console.log("PDF saved:", pdf.length, "bytes");
})();
