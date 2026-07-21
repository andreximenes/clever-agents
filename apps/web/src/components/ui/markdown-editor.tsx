"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import "@uiw/react-md-editor/markdown-editor.css";

// The editor touches `document`/`navigator`, so it must be client-only.
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type Props = {
  value: string;
  onChange: (value: string) => void;
  height?: number;
};

/** Follows the app theme (the editor ships its own light/dark styling). */
function useAppTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.dataset.theme === "light" ? "light" : "dark",
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function MarkdownEditor({ value, onChange, height = 320 }: Props) {
  const theme = useAppTheme();

  return (
    <div
      data-color-mode={theme}
      className="md-editor-wrap overflow-hidden rounded-[var(--radius)]"
    >
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? "")}
        height={height}
        preview="edit"
        visibleDragbar={false}
      />
    </div>
  );
}
