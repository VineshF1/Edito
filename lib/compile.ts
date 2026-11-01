// Edito — ResumeContent (JSON) → final .tex (in temp dir) → Tectonic → PDF buffer.
// Tectonic binary lives in ./tools/tectonic. Compile happens in a per-request
// temp dir so concurrent requests don't collide.

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fillTemplate } from "./latex";

const execFileP = promisify(execFile);

// Platform-aware binary: Windows gets tectonic.exe; Linux (Vercel/CI) gets
// the vendored musl static build matched to the function architecture.
const TECTONIC_DIR = path.join(process.cwd(), "tools", "tectonic");
function tectonicBinary(): string {
  if (process.platform === "win32") {
    return path.join(TECTONIC_DIR, "tectonic.exe");
  }
  return path.join(
    TECTONIC_DIR,
    "linux",
    process.arch === "arm64" ? "tectonic-aarch64" : "tectonic-x86_64"
  );
}

const TMP_BIN_DIR = path.join(os.tmpdir(), "tectonic-bin");
const CACHE_DIR = path.join(os.tmpdir(), "tectonic-cache");

export async function compileToPdf(
  tex: string,
  outName = "resume"
): Promise<{ pdf: Buffer; pages: number | null }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edito-"));
  let cacheEnv: Record<string, string> | null = null;
  try {
    const texPath = path.join(dir, `${outName}.tex`);
    // chcp 65001 not needed; write UTF-8 without BOM — Tectonic requires UTF-8.
    fs.writeFileSync(texPath, tex, { encoding: "utf8" });
    const bin = tectonicBinary();
    let execBin = bin;
    if (process.platform !== "win32") {
      // On serverless (e.g. Vercel) the deployed files are read-only and may
      // lack the +x bit: copy the binary to the writable /tmp and chmod it.
      // Memoized across warm invocations via the module-level copy cache.
      fs.mkdirSync(TMP_BIN_DIR, { recursive: true });
      const copy = path.join(TMP_BIN_DIR, path.basename(bin));
      if (!fs.existsSync(copy)) {
        fs.copyFileSync(bin, copy);
        fs.chmodSync(copy, 0o755);
      }
      execBin = copy;
      // Cache dir: HOME is read-only on serverless — keep the bundle cache
      // under /tmp so warm invocations reuse it.
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      cacheEnv = { TECTONIC_CACHE_DIR: CACHE_DIR };
    }
    // Run tectonic with cwd = dir so logs stay per-request.
    await execFileP(execBin, [`${outName}.tex`], {
      cwd: dir,
      timeout: 120_000,
      windowsHide: true,
      ...(cacheEnv ? { env: { ...process.env, ...cacheEnv } } : {}),
    });
    const pdfPath = path.join(dir, `${outName}.pdf`);
    const pdf = fs.readFileSync(pdfPath);
    // Page count via PyMuPDF when available (local tool; python is present).
    let pages: number | null = null;
    try {
      const { stdout } = await execFileP(
        "python",
        ["-c", "import fitz,sys;print(fitz.open(sys.argv[1]).page_count)", pdfPath],
        { timeout: 15_000, windowsHide: true }
      );
      const n = parseInt(stdout.trim(), 10);
      if (Number.isFinite(n)) pages = n;
    } catch {
      pages = null; // python/fitz unavailable — skip the one-page check
    }
    return { pdf, pages };
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message: string };
    const logFile = path.join(dir, `${outName}.log`);
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
    throw new Error(
      `LaTeX compile failed: ${e.message}\n${e.stderr ?? ""}\n${log?.split("\n").filter((l) => l.startsWith("!")).join("\n")}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
