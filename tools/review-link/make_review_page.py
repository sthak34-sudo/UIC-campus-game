"""Package the current game for a PRIVATE review link (a claude.ai artifact).

Usage:  python3 tools/review-link/make_review_page.py <out_dir> [label]
  1. builds the game (vite, relative paths) into <out_dir>/build
  2. copies it into <out_dir>/pub, renaming file types the artifact host refuses to serve
     (.glb, .ktx2, .hdr -> <name>.<ext>.wasm; the bytes are unchanged)
  3. writes <out_dir>/pub/play.html: the single page the artifact serves. A tiny shim at the top of
     the page maps requests for .glb/.ktx2/.hdr to the renamed files, so the game code is untouched.
  4. writes <out_dir>/files.json: the list of files to publish next to the page.

The Project Lead then publishes <out_dir>/pub/play.html with the Artifact tool, passing files.json
as `files` and <out_dir>/pub as `root`. Nothing here touches GitHub or the public Pages site.
"""
import json, os, re, shutil, subprocess, sys

top = os.path.abspath(sys.argv[1])
out = os.path.join(top, "build")
pub = os.path.join(top, "pub")
label = sys.argv[2] if len(sys.argv) > 2 else ""
root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
subprocess.run(["npx", "vite", "build", "--base=./", "--outDir", out, "--emptyOutDir"], cwd=os.path.join(root, "client"), check=True)

html = open(os.path.join(out, "index.html")).read()
script = re.search(r'<script type="module"[^>]*src="(\./assets/[^"]+)"', html).group(1)
css_href = re.search(r'<link rel="stylesheet"[^>]*href="\./(assets/[^"]+)"', html).group(1)
css = open(os.path.join(out, css_href)).read()
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = re.sub(r'<div id="credits">', '<div id="credits">', body)
SHIM = """<script>
/* Review-link shim: the host does not serve .glb/.ktx2/.hdr, so those files are published as <name>.<ext>.wasm. */
(() => {
  const fix = (u) => (typeof u === "string" ? u.replace(/\.(glb|ktx2|hdr)(?=$|[?#])/, ".$1.wasm") : u);
  const f = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string") return f(fix(input), init);
    if (input instanceof URL) return f(fix(input.href), init);
    if (input && input.url) return f(new Request(fix(input.url), input), init);
    return f(input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...r) { return open.call(this, m, fix(String(u)), ...r); };
})();
</script>"""
page = f"""<title>UIC Campus Game</title>
<style>
/* Single dark look: full-screen 3D game canvas with a thin HUD overlay. */
:root {{ --bg: #0b0d10; --fg: #f2f4f6; --link: #b9d4ee; color-scheme: dark; }}
html, body {{ height: 100%; }}
body {{ background: var(--bg); color: var(--fg); }}
{css}
#loading {{ padding-inline: 16px; box-sizing: border-box; }}
#credits a {{ color: var(--link); }}
</style>
{SHIM}
{body}
<script type="module" src="{script}"></script>
"""
shutil.rmtree(pub, ignore_errors=True)
files = []
for d, _, names in os.walk(out):
    for n in names:
        rel = os.path.relpath(os.path.join(d, n), out)
        if rel == "index.html":
            continue
        dest = rel + ".wasm" if re.search(r"\.(glb|ktx2|hdr)$", rel) else rel
        os.makedirs(os.path.dirname(os.path.join(pub, dest)) or pub, exist_ok=True)
        shutil.copyfile(os.path.join(out, rel), os.path.join(pub, dest))
        files.append({"path": dest})
open(os.path.join(pub, "play.html"), "w").write(page)
files.sort(key=lambda f: f["path"])
json.dump(files, open(os.path.join(top, "files.json"), "w"))
size = sum(os.path.getsize(os.path.join(pub, f["path"])) for f in files)
print(f"{len(files)} files, {size/1e6:.1f} MB; page {os.path.getsize(os.path.join(pub,'play.html'))//1024} KB; {label}")
