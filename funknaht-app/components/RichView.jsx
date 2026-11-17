import { createElement, Fragment } from "react";

// Read-only rendering of a formatted note (see lib/richtext.js) as plain React elements – no HTML strings.
// Works on the server (PDF/print page) and in the browser (note cards).
const TAG = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code" };

function inline(n, key, links) {
  if (n.type === "hardBreak") return <br key={key} />;
  let el = n.text;
  for (const m of n.marks || []) {
    const a = m.attrs || {};
    if (TAG[m.type]) el = createElement(TAG[m.type], null, el);
    else if (m.type === "textStyle") el = <span style={{ color: a.color || undefined, fontFamily: a.fontFamily || undefined, fontSize: a.fontSize || undefined }}>{el}</span>;
    else if (m.type === "highlight") el = <mark style={a.color ? { background: a.color } : undefined}>{el}</mark>;
    // Cards are buttons, so a link there is only styled; on the print page it is a real link.
    else if (m.type === "link") el = links ? <a href={a.href} target="_blank" rel="noopener noreferrer nofollow">{el}</a> : <span className="rich__link">{el}</span>;
  }
  return <Fragment key={key}>{el}</Fragment>;
}

function block(n, key, links) {
  const kids = (n.content || []).map((c, i) => (c.type === "text" || c.type === "hardBreak" ? inline(c, i, links) : block(c, i, links)));
  const align = n.attrs?.textAlign ? { textAlign: n.attrs.textAlign } : undefined;
  switch (n.type) {
    case "paragraph": return <p key={key} style={align}>{kids}</p>;
    case "heading": return createElement("h" + Math.min(6, (n.attrs?.level || 2) + 2), { key, style: align }, kids);
    case "bulletList": return <ul key={key}>{kids}</ul>;
    case "orderedList": return <ol key={key} start={n.attrs?.start || 1}>{kids}</ol>;
    case "taskList": return <ul key={key} data-type="taskList">{kids}</ul>;
    case "taskItem": return <li key={key} data-checked={n.attrs?.checked ? "true" : "false"}><label><input type="checkbox" readOnly tabIndex={-1} checked={!!n.attrs?.checked} /></label><div>{kids}</div></li>;
    case "listItem": return <li key={key}>{kids}</li>;
    case "blockquote": return <blockquote key={key}>{kids}</blockquote>;
    case "horizontalRule": return <hr key={key} />;
    case "table": return <div key={key} className="rich__table"><table><tbody>{kids}</tbody></table></div>;
    case "tableRow": return <tr key={key}>{kids}</tr>;
    case "tableHeader": case "tableCell": {
      const Tag = n.type === "tableHeader" ? "th" : "td";
      return <Tag key={key} colSpan={n.attrs?.colspan > 1 ? n.attrs.colspan : undefined} rowSpan={n.attrs?.rowspan > 1 ? n.attrs.rowspan : undefined}>{kids}</Tag>;
    }
    case "image": return n.attrs?.src?.startsWith("data:image/") ? <img key={key} src={n.attrs.src} alt={n.attrs.alt || ""} width={n.attrs.width || undefined} /> : null;
    default: return null;
  }
}

export default function RichView({ doc, links = false }) {
  return <div className="rich rich--view">{(doc?.content || []).map((n, i) => block(n, i, links))}</div>;
}
