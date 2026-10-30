import JSZip from "jszip";

/** 塞进 prompt 的字数上限，再多会挤掉生成空间 */
const MAX_CHARS = 30000;

export const SUPPORTED_BRIEF = "docx / pptx / xlsx / txt / md / html";

function decodeXml(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&middot;/g, "·")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/**
 * 从 Office 的 XML 里捞正文。
 *
 * docx 是 word/document.xml 里的 w:t，pptx 是每页 slide 里的 a:t。
 * 先按段落标签切开，再逐段拼文字，这样段落之间不会粘成一坨。
 */
function pickText(xml: string, textTag: string, paraTag: string) {
  const paras = xml.split(`</${paraTag}>`);
  const out: string[] = [];
  const re = new RegExp(
    `<${textTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${textTag}>`,
    "g",
  );
  for (const p of paras) {
    let line = "";
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(p))) line += decodeXml(m[1]);
    if (line.trim()) out.push(line.trim());
  }
  return out.join("\n");
}

function slideIndex(name: string) {
  const m = name.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}

export async function extractBriefText(
  buf: Buffer,
  filename: string,
): Promise<string> {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (["txt", "md", "markdown", "csv"].includes(ext)) {
    return buf.toString("utf8").slice(0, MAX_CHARS);
  }

  if (ext === "html" || ext === "htm") {
    const html = buf.toString("utf8");
    // 脚本和样式里的内容不是正文，先整段扔掉，避免把 JS 当资料喂给模型
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    // 块级标签结尾当换行，否则段落会粘成一行
    text = text
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|td)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    text = decodeXml(text)
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text.slice(0, MAX_CHARS);
  }

  if (ext === "docx") {
    const zip = await JSZip.loadAsync(buf);
    const f = zip.file("word/document.xml");
    if (!f) throw new Error("这个 docx 里读不到正文");
    return pickText(await f.async("string"), "w:t", "w:p").slice(0, MAX_CHARS);
  }

  if (ext === "pptx") {
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => slideIndex(a) - slideIndex(b));
    const parts: string[] = [];
    for (const s of slides) {
      const xml = await zip.file(s)?.async("string");
      if (!xml) continue;
      const text = pickText(xml, "a:t", "a:p");
      if (text.trim()) parts.push(`第 ${slideIndex(s)} 页\n${text}`);
    }
    return parts.join("\n\n").slice(0, MAX_CHARS);
  }

  if (ext === "xlsx") {
    const zip = await JSZip.loadAsync(buf);
    const f = zip.file("xl/sharedStrings.xml");
    if (!f) return "";
    return pickText(await f.async("string"), "t", "si").slice(0, MAX_CHARS);
  }

  if (ext === "pdf") {
    throw new Error("PDF 暂时读不了，请另存为 Word，或者把正文复制成 txt");
  }

  throw new Error(`暂不支持 .${ext}，可以上传 ${SUPPORTED_BRIEF}`);
}
