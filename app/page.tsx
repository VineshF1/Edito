"use client";

import { useRef, useState } from "react";
import Mark from "@/components/Mark";
import Optimizer from "@/components/Optimizer";
import EmailWriter from "@/components/EmailWriter";

type Tab = "optimize" | "email";

export default function Home() {
  const [tab, setTab] = useState<Tab>("optimize");
  const [direction, setDirection] = useState<"left" | "right" | "">("");
  const lastSwitch = useRef(0);

  function switchTab(next: Tab) {
    if (next === tab) return;
    // debounce rapid double-clicks so the animation doesn't restart mid-flight
    const now = Date.now();
    if (now - lastSwitch.current < 350) return;
    lastSwitch.current = now;
    setDirection(next === "email" ? "right" : "left");
    setTab(next);
  }

  return (
    <div className="min-h-dvh">
      <div className="border-b border-[var(--line)] bg-[var(--surface)]">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Mark size={24} />
            <span className="font-display text-xl font-semibold tracking-tight">
              Edito
            </span>
          </div>
        </header>
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6">
        <div className="tabbar mb-8" role="tablist" aria-label="Sections">
          <button
            role="tab"
            aria-selected={tab === "optimize"}
            onClick={() => switchTab("optimize")}
          >
            Resume optimizer
          </button>
          <button
            role="tab"
            aria-selected={tab === "email"}
            onClick={() => switchTab("email")}
          >
            Email writer
          </button>
        </div>

        {tab === "optimize" ? (
          <div
            key="optimize"
            className={direction ? "section-slide-left" : ""}
          >
            <Optimizer />
          </div>
        ) : (
          <div
            key="email"
            className={direction ? "section-slide-right" : ""}
          >
            <EmailWriter />
          </div>
        )}
      </main>
    </div>
  );
}
