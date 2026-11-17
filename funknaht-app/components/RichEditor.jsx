"use client";
import { useEffect, useState } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { FiBold, FiItalic, FiUnderline, FiList, FiCheckSquare, FiAlignLeft, FiAlignCenter, FiAlignRight, FiAlignJustify, FiLink, FiCornerUpLeft, FiCornerUpRight,
  FiMinus, FiChevronsRight, FiChevronsLeft, FiSlash, FiGrid, FiImage } from "react-icons/fi";
import { FONTS, SIZES, TEXT_COLORS, MARKER_COLORS } from "@/lib/richtext";

// Photos from a phone are several MB; they are shrunk to at most 1400 px and stored as JPEG inside the note.
async function shrinkImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Bitte ein Bild (JPG, PNG, WebP oder GIF) wählen.");
  if (file.size > 25000000) throw new Error("Das Bild ist zu groß.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs get a white background
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const q of [0.82, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length < 1400000) return { src: url, width: canvas.width };
  }
  throw new Error("Das Bild ist zu groß.");
}

const BLOCKS = [["p", "Text"], ["h1", "Überschrift 1"], ["h2", "Überschrift 2"], ["h3", "Überschrift 3"], ["quote", "Zitat"]];

// Toolbar button. mousedown is cancelled so the text selection in the editor survives the click.
function Tool({ label, active, disabled, onClick, children }) {
  return <button type="button" className="tb" title={label} aria-label={label} aria-pressed={active ? "true" : undefined} disabled={disabled}
    onMouseDown={e => e.preventDefault()} onClick={onClick}>{children}</button>;
}

function Palette({ label, colors, value, onPick, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!e.target.closest?.(".tb-wrap")) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span className="tb-wrap">
      <Tool label={label} active={open} onClick={() => setOpen(o => !o)}>{children}</Tool>
      {open && (
        <span className="tb-pop" role="menu" aria-label={label}>
          <button type="button" className="tb-none" onMouseDown={e => e.preventDefault()} onClick={() => { onPick(""); setOpen(false); }}>Standard</button>
          {colors.map(([c, name]) => <button key={c} type="button" className="tb-swatch" style={{ background: c }} title={name} aria-label={name} aria-pressed={value === c}
            onMouseDown={e => e.preventDefault()} onClick={() => { onPick(c); setOpen(false); }} />)}
          <label className="tb-custom" title="Eigene Farbe">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || "") ? value : "#3b82f6"} onChange={e => onPick(e.target.value)} />
          </label>
        </span>
      )}
    </span>
  );
}

function Toolbar({ editor }) {
  // Re-reads the formatting at the cursor after every change, so buttons show what is active.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : e.isActive("blockquote") ? "quote" : "p",
      font: e.getAttributes("textStyle").fontFamily || "", size: e.getAttributes("textStyle").fontSize || "", color: e.getAttributes("textStyle").color || "",
      marker: e.getAttributes("highlight").color || "",
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), task: e.isActive("taskList"), link: e.isActive("link"),
      align: ["center", "right", "justify"].find(a => e.isActive({ textAlign: a })) || "left",
      undo: e.can().undo(), redo: e.can().redo(), table: e.isActive("table"),
    }),
  });
  const run = () => editor.chain().focus();
  const item = s.task ? "taskItem" : "listItem";

  const block = v => {
    if (v === "p") run().setParagraph().run();
    else if (v === "quote") run().toggleBlockquote().run();
    else run().setHeading({ level: Number(v[1]) }).run();
  };
  const link = () => {
    const href = window.prompt("Adresse des Links (leer lassen, um den Link zu entfernen)", editor.getAttributes("link").href || "https://");
    if (href === null) return;
    const url = href.trim();
    if (!url || url === "https://") run().extendMarkRange("link").unsetLink().run();
    else run().extendMarkRange("link").setLink({ href: /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : "https://" + url }).run();
  };

  return (
    <div className="editor__bar" role="toolbar" aria-label="Formatierung">
      <Tool label="Rückgängig (Strg+Z)" disabled={!s.undo} onClick={() => run().undo().run()}><FiCornerUpLeft /></Tool>
      <Tool label="Wiederholen (Strg+Y)" disabled={!s.redo} onClick={() => run().redo().run()}><FiCornerUpRight /></Tool>
      <i className="tb-sep" />
      <select className="tb-select" aria-label="Absatzformat" value={s.block} onChange={e => block(e.target.value)}>{BLOCKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select className="tb-select" aria-label="Schriftart" value={FONTS.some(f => f[0] === s.font) ? s.font : ""} onChange={e => (e.target.value ? run().setFontFamily(e.target.value).run() : run().unsetFontFamily().run())}>
        {FONTS.map(([v, l]) => <option key={l} value={v} style={{ fontFamily: v || undefined }}>{l}</option>)}
      </select>
      <select className="tb-select tb-select--size" aria-label="Schriftgröße" value={SIZES.some(z => z[0] === s.size) ? s.size : ""} onChange={e => (e.target.value ? run().setFontSize(e.target.value).run() : run().unsetFontSize().run())}>
        {SIZES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
      </select>
      <i className="tb-sep" />
      <Tool label="Fett (Strg+B)" active={s.bold} onClick={() => run().toggleBold().run()}><FiBold /></Tool>
      <Tool label="Kursiv (Strg+I)" active={s.italic} onClick={() => run().toggleItalic().run()}><FiItalic /></Tool>
      <Tool label="Unterstrichen (Strg+U)" active={s.underline} onClick={() => run().toggleUnderline().run()}><FiUnderline /></Tool>
      <Tool label="Durchgestrichen" active={s.strike} onClick={() => run().toggleStrike().run()}><span className="tb-letter" style={{ textDecoration: "line-through" }}>S</span></Tool>
      <Palette label="Schriftfarbe" colors={TEXT_COLORS} value={s.color} onPick={c => (c ? run().setColor(c).run() : run().unsetColor().run())}>
        <span className="tb-letter" style={{ borderBottom: `3px solid ${s.color || "var(--brass)"}` }}>A</span>
      </Palette>
      <Palette label="Textmarker" colors={MARKER_COLORS} value={s.marker} onPick={c => (c ? run().setHighlight({ color: c }).run() : run().unsetHighlight().run())}>
        <span className="tb-letter" style={{ background: s.marker || MARKER_COLORS[0][0], borderRadius: 4, padding: "0 5px" }}>A</span>
      </Palette>
      <i className="tb-sep" />
      <Tool label="Aufzählung" active={s.bullet} onClick={() => run().toggleBulletList().run()}><FiList /></Tool>
      <Tool label="Nummerierte Liste" active={s.ordered} onClick={() => run().toggleOrderedList().run()}><span className="tb-letter">1.</span></Tool>
      <Tool label="Checkliste" active={s.task} onClick={() => run().toggleTaskList().run()}><FiCheckSquare /></Tool>
      <Tool label="Ausrücken" onClick={() => run().liftListItem(item).run()}><FiChevronsLeft /></Tool>
      <Tool label="Einrücken (Tab)" onClick={() => run().sinkListItem(item).run()}><FiChevronsRight /></Tool>
      <i className="tb-sep" />
      {[["left", "Linksbündig", FiAlignLeft], ["center", "Zentriert", FiAlignCenter], ["right", "Rechtsbündig", FiAlignRight], ["justify", "Blocksatz", FiAlignJustify]].map(([a, l, Icon]) =>
        <Tool key={a} label={l} active={s.align === a} onClick={() => run().setTextAlign(a).run()}><Icon /></Tool>)}
      <i className="tb-sep" />
      <Tool label="Link" active={s.link} onClick={link}><FiLink /></Tool>
      <Tool label="Trennlinie" onClick={() => run().setHorizontalRule().run()}><FiMinus /></Tool>
      <Tool label="Formatierung entfernen" onClick={() => run().unsetAllMarks().clearNodes().run()}><FiSlash /></Tool>
      <i className="tb-sep" />
      <Tool label="Tabelle einfügen" active={s.table} onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><FiGrid /></Tool>
      <label className="tb" title="Bild einfügen" aria-label="Bild einfügen" onMouseDown={e => e.preventDefault()}>
        <FiImage />
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={async e => {
          const file = e.target.files[0]; e.target.value = "";
          if (!file) return;
          try { const img = await shrinkImage(file); run().setImage({ src: img.src, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 120), width: Math.min(img.width, 720) }).run(); }
          catch (err) { window.alert(err.message); }
        }} />
      </label>
      {s.table && (
        <span className="tb-group" role="group" aria-label="Tabelle">
          <Tool label="Zeile darunter" onClick={() => run().addRowAfter().run()}><span className="tb-text">+ Zeile</span></Tool>
          <Tool label="Spalte rechts" onClick={() => run().addColumnAfter().run()}><span className="tb-text">+ Spalte</span></Tool>
          <Tool label="Zeile löschen" onClick={() => run().deleteRow().run()}><span className="tb-text">− Zeile</span></Tool>
          <Tool label="Spalte löschen" onClick={() => run().deleteColumn().run()}><span className="tb-text">− Spalte</span></Tool>
          <Tool label="Tabelle löschen" onClick={() => run().deleteTable().run()}><span className="tb-text">Tabelle weg</span></Tool>
        </span>
      )}
    </div>
  );
}

// Word-like editor for notes. value and onChange use the document tree described in lib/richtext.js.
// compact: smaller writing area for descriptions inside a form (orders, tasks).
export default function RichEditor({ value, onChange, editable = true, compact = false, label = "Notiztext" }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto", "tel"] } }),
      TextStyle, Color, FontFamily, FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      Image.configure({ allowBase64: true, inline: false }),
      TaskList, TaskItem.configure({ nested: true, a11y: { checkboxLabel: node => `Erledigt: ${node.textContent || "leerer Punkt"}` } }),
    ],
    content: value,
    editorProps: { attributes: { class: compact ? "rich rich--compact" : "rich", role: "textbox", "aria-multiline": "true", "aria-label": label } },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON()),
  });
  if (!editor) return <div className="editor"><div className={compact ? "rich rich--compact" : "rich"} /></div>;
  return (
    <div className={compact ? "editor editor--compact" : "editor"}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
