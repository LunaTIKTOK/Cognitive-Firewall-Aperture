#!/usr/bin/env python3
"""Bundle the app into one HTML page for hosting (e.g. as a Claude artifact).

Usage: python3 build.py [output_path]

The output has no <html>/<head>/<body> wrapper (the host supplies one), inlines
styles.css and app.js, loads Chart.js from cdnjs instead of the vendored copy,
and sets window.CLEARSPEND_HOSTED so the app hides file download/import controls
that hosted viewers block.
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
CHART_CDN = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"


def build() -> str:
    html = (HERE / "index.html").read_text(encoding="utf-8")
    css = (HERE / "styles.css").read_text(encoding="utf-8")
    js = (HERE / "app.js").read_text(encoding="utf-8")

    body = html.split("<body>", 1)[1].split("</body>", 1)[0]
    scripts = '  <script src="vendor-chart.umd.js"></script>\n  <script src="app.js"></script>'
    if scripts not in body:
        raise SystemExit("index.html script tags changed; update build.py")
    body = body.replace(scripts, "").rstrip()

    return (
        "<title>Clearspend</title>\n"
        f"<style>\n{css}\n</style>\n"
        f"{body}\n"
        "<script>window.CLEARSPEND_HOSTED = true;</script>\n"
        f'<script src="{CHART_CDN}"></script>\n'
        f"<script>\n{js}\n</script>\n"
    )


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "dist" / "clearspend.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    page = build()
    out.write_text(page, encoding="utf-8")
    print(f"wrote {out} ({len(page.encode('utf-8'))} bytes)")
