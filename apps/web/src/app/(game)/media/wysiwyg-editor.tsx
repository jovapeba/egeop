"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Minus,
  RemoveFormatting,
  Code,
  Eye,
  Edit3,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/ui";

interface WysiwygEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const TEMPLATES = [
  {
    name: "War Dispatch",
    icon: "⚔️",
    content: `<h3><strong>WAR DISPATCH: Breaking Frontline Report</strong></h3>
<p>Forces engaged along the contested frontier in an intense battle round. Heavy armor and air defense battalions are clashing across the sector.</p>
<blockquote><em>"Hold the defensive line until auxiliary reinforcements arrive." — Military Command</em></blockquote>
<p><strong>Status & Recommendations:</strong></p>
<ul>
  <li>Defenders maintain wall integrity above 50%</li>
  <li>Citizens are urged to supply weapons and rally at the front</li>
  <li>Medical tents report high casualty recovery</li>
</ul>
<p>Stay tuned for round conclusion updates.</p>`,
  },
  {
    name: "Market Brief",
    icon: "📈",
    content: `<h3><strong>DAILY MARKET & ECONOMY INTELLIGENCE</strong></h3>
<p>Global commodity order-books showed strong movement today following recent tax policy updates.</p>
<p><strong>Key Highlights:</strong></p>
<ul>
  <li><strong>Raw Materials:</strong> Grain and Iron seeing steady regional trade</li>
  <li><strong>Manufactured Goods:</strong> Q5 Weapons and Food in high demand</li>
  <li><strong>Monetary FX:</strong> Gold-to-Fiat exchange rate holding firm</li>
</ul>
<blockquote><em>Prudent traders should monitor import tariff rates before shipping stock abroad.</em></blockquote>`,
  },
  {
    name: "Political Editorial",
    icon: "🏛️",
    content: `<h3><strong>CONGRESSIONAL & CIVIC EDITORIAL</strong></h3>
<p>With upcoming elections approaching, citizen representatives are proposing vital fiscal legislation to support national defense and local industries.</p>
<p><strong>Our Editorial Stance:</strong></p>
<ol>
  <li>Support equitable minimum wage laws to incentivize productivity</li>
  <li>Invest national treasury reserves into regional hospital facilities</li>
  <li>Maintain transparent governance across all ministries</li>
</ol>
<p>Every vote shapes our nation's destiny. Make your voice heard at the ballot box.</p>`,
  },
];

export function WysiwygEditor({
  value,
  onChange,
  placeholder = "Compose your article with rich headings, quotes, images, and lists…",
  minHeight = "min-h-[260px]",
}: WysiwygEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"visual" | "html" | "preview">("visual");
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Sync internal editor HTML only if changed externally and out of sync
  useEffect(() => {
    if (editorRef.current && viewMode === "visual") {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
    // Update word / char counts
    const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    setCharCount(text.length);
    setWordCount(text ? text.split(" ").length : 0);
  }, [value, viewMode]);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      onChange(html);
    }
  };

  const exec = (command: string, arg?: string) => {
    if (viewMode !== "visual") {
      setViewMode("visual");
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          document.execCommand(command, false, arg);
          handleInput();
        }
      }, 50);
      return;
    }
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand(command, false, arg);
      handleInput();
    }
  };

  const insertLink = () => {
    const url = prompt("Enter hyperlink URL (e.g. https://...):");
    if (url) {
      const valid = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      exec("createLink", valid);
    }
  };

  const insertImage = () => {
    const url = prompt("Enter image URL (e.g. https://example.com/banner.jpg):");
    if (url) {
      const valid = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      exec("insertImage", valid);
    }
  };

  const applyTemplate = (content: string) => {
    if (value && value.trim().length > 10) {
      if (!confirm("Replace current draft with template?")) return;
    }
    onChange(content);
    if (editorRef.current) {
      editorRef.current.innerHTML = content;
    }
  };

  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl overflow-hidden flex flex-col">
      {/* TOOLBAR */}
      <div className="bg-slate-900/90 border-b border-slate-800 p-2 flex flex-wrap items-center justify-between gap-1.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-1">
          {/* HISTORY */}
          <div className="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800/80">
            <button
              type="button"
              onClick={() => exec("undo")}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
              title="Undo (Ctrl+Z)"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("redo")}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
              title="Redo (Ctrl+Y)"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* HEADINGS */}
          <div className="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800/80">
            <button
              type="button"
              onClick={() => exec("formatBlock", "<h1>")}
              className="px-2 py-1 text-slate-300 hover:text-emerald-300 hover:bg-slate-800 rounded text-xs font-bold transition flex items-center gap-1"
              title="Heading 1"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("formatBlock", "<h2>")}
              className="px-2 py-1 text-slate-300 hover:text-emerald-300 hover:bg-slate-800 rounded text-xs font-bold transition flex items-center gap-1"
              title="Heading 2"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("formatBlock", "<h3>")}
              className="px-2 py-1 text-slate-300 hover:text-emerald-300 hover:bg-slate-800 rounded text-xs font-bold transition flex items-center gap-1"
              title="Heading 3"
            >
              <Heading3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("formatBlock", "<p>")}
              className="px-2 py-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded text-[11px] font-semibold transition"
              title="Normal paragraph"
            >
              P
            </button>
          </div>

          {/* INLINE STYLES */}
          <div className="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800/80">
            <button
              type="button"
              onClick={() => exec("bold")}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("italic")}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("underline")}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              title="Underline (Ctrl+U)"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("strikeThrough")}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* LISTS & QUOTES */}
          <div className="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800/80">
            <button
              type="button"
              onClick={() => exec("insertUnorderedList")}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              title="Bullet list"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("insertOrderedList")}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              title="Numbered list"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("formatBlock", "<blockquote>")}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              title="Blockquote"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("insertHorizontalRule")}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              title="Horizontal Divider"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ALIGNMENT */}
          <div className="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800/80">
            <button
              type="button"
              onClick={() => exec("justifyLeft")}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("justifyCenter")}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("justifyRight")}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
              title="Align Right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* INSERT LINK & IMAGE */}
          <div className="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800/80">
            <button
              type="button"
              onClick={insertLink}
              className="p-1.5 text-cyan-400 hover:text-cyan-200 hover:bg-slate-800 rounded transition flex items-center gap-1"
              title="Insert Link"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={insertImage}
              className="p-1.5 text-cyan-400 hover:text-cyan-200 hover:bg-slate-800 rounded transition flex items-center gap-1"
              title="Insert Image URL"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec("removeFormat")}
              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition"
              title="Clear formatting"
            >
              <RemoveFormatting className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* VIEW MODE TABS */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode("visual")}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
              viewMode === "visual"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            <Edit3 className="w-3 h-3" /> Visual
          </button>
          <button
            type="button"
            onClick={() => setViewMode("html")}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
              viewMode === "html"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            <Code className="w-3 h-3" /> HTML
          </button>
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
              viewMode === "preview"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            <Eye className="w-3 h-3" /> Preview
          </button>
        </div>
      </div>

      {/* QUICK TEMPLATES BAR */}
      <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-slate-300 text-[11px]">Templates:</span>
          <div className="flex items-center gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => applyTemplate(t.content)}
                className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-[11px] font-medium transition flex items-center gap-1"
              >
                <span>{t.icon}</span> {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-3 ml-auto">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{charCount} characters</span>
        </div>
      </div>

      {/* EDITOR CANVAS */}
      <div className="relative p-4 flex-1">
        {viewMode === "visual" && (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            className={cn(
              "w-full outline-none text-slate-100 text-sm leading-relaxed",
              minHeight,
              "[&>h1]:text-2xl [&>h1]:font-black [&>h1]:text-slate-100 [&>h1]:mb-3 [&>h1]:mt-1",
              "[&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-slate-100 [&>h2]:mb-2 [&>h2]:mt-3",
              "[&>h3]:text-base [&>h3]:font-bold [&>h3]:text-emerald-400 [&>h3]:mb-2 [&>h3]:mt-3",
              "[&>p]:mb-3 [&>p]:leading-relaxed",
              "[&>blockquote]:border-l-4 [&>blockquote]:border-emerald-500/70 [&>blockquote]:pl-4 [&>blockquote]:py-1.5 [&>blockquote]:italic [&>blockquote]:text-slate-300 [&>blockquote]:my-3 [&>blockquote]:bg-slate-900/50 [&>blockquote]:rounded-r-lg",
              "[&>ul]:list-disc [&>ul]:list-inside [&>ul]:mb-3 [&>ul]:space-y-1",
              "[&>ol]:list-decimal [&>ol]:list-inside [&>ol]:mb-3 [&>ol]:space-y-1",
              "[&>hr]:border-slate-800 [&>hr]:my-4",
              "[&>a]:text-cyan-400 [&>a]:underline hover:[&>a]:text-cyan-300",
              "[&>img]:rounded-xl [&>img]:border [&>img]:border-slate-800 [&>img]:max-w-full [&>img]:my-3 [&>img]:shadow-xl",
            )}
            data-placeholder={placeholder}
          />
        )}

        {viewMode === "html" && (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "w-full bg-slate-950 font-mono text-xs text-emerald-400 p-3 rounded-xl border border-slate-800 outline-none focus:border-emerald-500/60 resize-y",
              minHeight,
            )}
            placeholder="Edit raw HTML tags here…"
          />
        )}

        {viewMode === "preview" && (
          <div
            className={cn(
              "w-full text-slate-100 text-sm leading-relaxed p-4 rounded-xl bg-slate-950 border border-slate-800",
              minHeight,
              "[&>h1]:text-2xl [&>h1]:font-black [&>h1]:text-slate-100 [&>h1]:mb-3 [&>h1]:mt-1",
              "[&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-slate-100 [&>h2]:mb-2 [&>h2]:mt-3",
              "[&>h3]:text-base [&>h3]:font-bold [&>h3]:text-emerald-400 [&>h3]:mb-2 [&>h3]:mt-3",
              "[&>p]:mb-3 [&>p]:leading-relaxed",
              "[&>blockquote]:border-l-4 [&>blockquote]:border-emerald-500/70 [&>blockquote]:pl-4 [&>blockquote]:py-1.5 [&>blockquote]:italic [&>blockquote]:text-slate-300 [&>blockquote]:my-3 [&>blockquote]:bg-slate-900/50 [&>blockquote]:rounded-r-lg",
              "[&>ul]:list-disc [&>ul]:list-inside [&>ul]:mb-3 [&>ul]:space-y-1",
              "[&>ol]:list-decimal [&>ol]:list-inside [&>ol]:mb-3 [&>ol]:space-y-1",
              "[&>hr]:border-slate-800 [&>hr]:my-4",
              "[&>a]:text-cyan-400 [&>a]:underline hover:[&>a]:text-cyan-300",
              "[&>img]:rounded-xl [&>img]:border [&>img]:border-slate-800 [&>img]:max-w-full [&>img]:my-3 [&>img]:shadow-xl",
            )}
            dangerouslySetInnerHTML={{
              __html: value || "<p class='text-slate-500 italic'>Nothing to preview yet. Switch to Visual mode and start writing!</p>",
            }}
          />
        )}
      </div>

      {/* FOOTER TIPS */}
      <div className="px-4 py-2 bg-slate-900/60 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
        <span>Rich HTML formatting supported: headings, bold, links, lists, blockquotes, and images</span>
        <span className="font-semibold text-slate-400">Published to Newspaper Archives</span>
      </div>
    </div>
  );
}
