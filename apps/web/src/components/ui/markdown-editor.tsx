"use client";

import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";

// The editor touches `document`/`navigator`, so it must be client-only.
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type Props = {
  value: string;
  onChange: (value: string) => void;
  height?: number;
};

export function MarkdownEditor({ value, onChange, height = 320 }: Props) {
  return (
    <div data-color-mode="dark" className="rounded-[var(--radius)] overflow-hidden">
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
