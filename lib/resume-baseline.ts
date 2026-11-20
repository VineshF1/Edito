// Edito — baseline resume content (plain text; LaTeX escaping happens in code).
// Only these three zones are ever rewritten: summary, skill lines, project bullets.
// Names, links, certifications, education, contact are frozen.

export type SkillLine = { label: string; items: string[] };
export type ProjectBullets = { id: string; bullets: string[] };

export type ResumeContent = {
  summary: string;
  skills: SkillLine[];
  projects: ProjectBullets[];
};

// Frozen: project titles, tech, and links (order and format never change)
export const PROJECT_META: { id: string; titleLatex: string }[] = [
  {
    id: "halos",
    titleLatex:
      "\\textbf{Halos AI -- F1 Chatbot \\textbar\\; Python, FastAPI \\;\\textbar\\; \\href{https://halos-ai.vercel.app}{halos-ai.vercel.app} \\;\\textbar\\; \\href{https://github.com/VineshF1/halos-ai}{github.com/VineshF1/halos-ai}}\n\\hfill",
  },
  {
    id: "skytrace",
    titleLatex:
      "\\textbf{SkyTrace -- Satellite Tracker \\;\\textbar\\; Python, Google ADK, MCP \\;\\textbar\\; \\href{https://github.com/VineshF1/skytrace}{github.com/VineshF1/skytrace}}\n\\hfill",
  },
  {
    id: "eaurouge",
    titleLatex:
      "\\textbf{EauRouge-F1 -- Qwen3-8B QLoRA \\;\\textbar\\; Python, Unsloth \\;\\textbar\\; \\href{https://github.com/VineshF1/eaurouge-f1}{github.com/VineshF1/eaurouge-f1}}",
  },
];

export const SKILL_LABELS = [
  "Programming Languages",
  "AI/ML",
  "Frameworks",
  "Databases & Vector Search",
  "Developer Tools",
];

export const BASELINE: ResumeContent = {
  summary:
    "B.Tech student in Artificial Intelligence and Machine Learning (graduating 2027) with hands-on experience building end-to-end Generative AI applications: React front ends, FastAPI backends and LLM integration. Shipped RAG pipelines with hybrid search, Text-to-SQL and multi-agent systems (LangGraph, Google ADK, MCP) plus a QLoRA fine-tune, with prompt-injection defenses.",
  skills: [
    {
      label: "Programming Languages",
      items: ["Python", "SQL", "TypeScript", "JavaScript"],
    },
    {
      label: "AI/ML",
      items: [
        "RAG",
        "Hybrid Search",
        "Text-to-SQL",
        "Prompt Engineering",
        "LLM Guardrails",
        "Multi-Agent Systems",
        "LLM Fine-tuning (QLoRA)",
        "MCP",
        "Google ADK",
        "LangChain",
        "Vector Databases",
      ],
    },
    {
      label: "Frameworks",
      items: ["FastAPI", "LangGraph", "React", "Unsloth"],
    },
    {
      label: "Databases & Vector Search",
      items: ["PostgreSQL", "pgvector"],
    },
    {
      label: "Developer Tools",
      items: ["Git", "GitHub", "Docker", "Vercel", "Render", "AI-assisted development"],
    },
  ],
  projects: [
    {
      id: "halos",
      bullets: [
        "Built a full-stack LLM application (React/TypeScript front end, FastAPI backend) that routes each query to hybrid RAG (BM25 + pgvector) or Text-to-SQL, with 27/30 routing accuracy on a labeled test set.",
        "Validated Text-to-SQL on 20 known-answer queries against the live deployment: 16/20 correct (80%).",
        "Scraped 64 Wikipedia pages with Playwright, chunked them to 1,469 embeddings with NVIDIA NV-Embed-v1 and indexed them in Neon PostgreSQL with pgvector.",
        "Implemented prompt-injection detection, input sanitization and per-IP rate limiting (30 requests/min) on the FastAPI backend; deployed to Vercel and Render.",
      ],
    },
    {
      id: "skytrace",
      bullets: [
        "Engineered a two-agent satellite tracker (Google ADK) that routes all external API calls through one MCP server; 14/14 tests pass.",
        "Integrated Celestrak, N2YO and Nominatim with SGP4 orbit propagation, ECEF/Haversine distance math and token-bucket rate limiting (burst of 15: 10 allowed, 5 blocked).",
      ],
    },
    {
      id: "eaurouge",
      bullets: [
        "Fine-tuned Qwen3-8B (QLoRA r=32, 4-bit) on 5,872 rows from a 10,656-pair F1 Q&A dataset on a Kaggle T4: 216 steps, resumable checkpoints.",
        "Found 88.5% answer leakage in a random train/test split; rebuilt it by source (9,608 train / 1,048 eval, zero shared answers) with a seeded, repeatable eval script.",
        "On 100 reworded questions about trained facts, answer-match rose from 33/100 (base) to 43/100; exact match 0/100 to 11/100.",
      ],
    },
  ],
};
