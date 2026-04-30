export interface ArticleHtmlOpts {
  title: string;
  intro: string;
  body: string;
  closing: string;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderParagraphs(content: string): string {
  if (!content?.trim()) return "";
  return content
    .split(/\n\n+/)
    .map((p) => `<p>${escHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function buildEmailBodyHtml(opts: ArticleHtmlOpts): string {
  const { title, intro, body, closing } = opts;
  const paragraphs = [intro, body, closing]
    .filter((s) => s?.trim())
    .join("\n\n")
    .split(/\n\n+/)
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.9;color:#1a1a1a;margin:0 0 16px 0;direction:rtl;text-align:right;">${escHtml(p.trim()).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  return (
    `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:680px;direction:rtl;text-align:right;">` +
    `<h2 style="font-size:20px;font-weight:700;color:#1e293b;margin:0 0 20px 0;line-height:1.4;direction:rtl;">${escHtml(title)}</h2>` +
    paragraphs +
    `<p style="font-size:11px;color:#94a3b8;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:10px;direction:rtl;">Intelligence Hub · Triple-T</p>` +
    `</div>`
  );
}

export function buildEmlFile(opts: ArticleHtmlOpts): string {
  const plain = buildPlainText(opts);
  const htmlBody = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"></head><body>${buildEmailBodyHtml(opts)}</body></html>`;
  const boundary = `=_Part_${Math.random().toString(36).slice(2, 10)}`;

  // RFC 2047 base64 subject for Hebrew characters
  const subjectB64 = btoa(unescape(encodeURIComponent(opts.title)));
  const subject = `=?UTF-8?B?${subjectB64}?=`;

  // base64-encode the HTML body
  const htmlB64 = btoa(unescape(encodeURIComponent(htmlBody)));

  return [
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `Subject: ${subject}`,
    "X-Unsent: 1",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    plain,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    htmlB64,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

function buildPlainText(opts: ArticleHtmlOpts): string {
  const parts = [opts.title, "", opts.intro, opts.body, opts.closing]
    .filter((s) => s?.trim())
    .join("\n\n");
  return parts;
}

export function buildArticleHtml(opts: ArticleHtmlOpts): string {
  const { title, intro, body, closing } = opts;
  const plain = buildPlainText(opts);
  const emailBodyHtml = buildEmailBodyHtml(opts);
  const mailtoHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(plain)}`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #f0f0f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    color: #1a1a1a;
    padding: 32px 16px;
    direction: rtl;
  }
  .toolbar {
    max-width: 680px;
    margin: 0 auto 12px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    border: none;
  }
  .btn-primary { background: #1e293b; color: #fff; }
  .btn-primary:hover { background: #334155; }
  .btn-ghost { background: #fff; color: #334155; border: 1px solid #e2e8f0; }
  .btn-ghost:hover { background: #f8fafc; }
  .wrapper {
    max-width: 680px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12);
    overflow: hidden;
  }
  .article-header {
    background: #1e293b;
    color: #f8fafc;
    padding: 32px 36px 28px;
  }
  .article-header h1 {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.4;
    margin: 0;
  }
  .content {
    padding: 32px 36px 36px;
  }
  p {
    font-size: 15px;
    line-height: 1.9;
    color: #334155;
    margin-bottom: 18px;
  }
  p:last-child { margin-bottom: 0; }
  .footer {
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    padding: 14px 36px;
    font-size: 11px;
    color: #94a3b8;
    text-align: center;
  }
  #copy-msg { font-size: 12px; color: #22c55e; display: none; }
  @media print {
    body { background: white; padding: 0; }
    .toolbar { display: none; }
    .wrapper { box-shadow: none; border-radius: 0; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <a href="${mailtoHref}" class="btn btn-ghost">✉ שלח במייל (טקסט)</a>
  <button class="btn btn-primary" onclick="copyForEmail()">📋 העתק לאיימייל (מעוצב)</button>
  <span id="copy-msg"></span>
</div>
<div class="wrapper">
  <div class="article-header">
    <h1>${escHtml(title)}</h1>
  </div>
  <div class="content">
    ${renderParagraphs([intro, body, closing].filter((s) => s?.trim()).join("\n\n"))}
  </div>
  <div class="footer">Intelligence Hub · Triple-T</div>
</div>
<div id="email-preview" style="position:absolute;left:-9999px;top:0;width:680px;" dir="rtl" aria-hidden="true">${emailBodyHtml}</div>
<script>
async function copyForEmail() {
  var msg = document.getElementById('copy-msg');
  function showOk() {
    msg.textContent = 'הועתק! פתח Gmail → חדש → הדבק (Ctrl+V)';
    msg.style.color = '#22c55e';
    msg.style.display = 'inline';
    setTimeout(function() { msg.style.display = 'none'; }, 4000);
  }
  function showErr(t) {
    msg.textContent = t || 'שגיאה — נסה Ctrl+A, Ctrl+C';
    msg.style.color = '#ef4444';
    msg.style.display = 'inline';
    setTimeout(function() { msg.style.display = 'none'; }, 5000);
  }
  // Primary: ClipboardItem API (Chrome 76+)
  try {
    var html = ${JSON.stringify(emailBodyHtml)};
    var plain = ${JSON.stringify(plain)};
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], {type:'text/html'}),
      'text/plain': new Blob([plain], {type:'text/plain'})
    })]);
    showOk(); return;
  } catch(e1) {}
  // Fallback: select rendered DOM node + execCommand (works in all browsers incl. Safari)
  try {
    var el = document.getElementById('email-preview');
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = document.execCommand('copy');
    sel.removeAllRanges();
    if (ok) { showOk(); return; }
  } catch(e2) {}
  showErr('לא ניתן להעתיק — בחר הכל (Ctrl+A) והעתק ידנית');
}
</script>
</body>
</html>`;
}
