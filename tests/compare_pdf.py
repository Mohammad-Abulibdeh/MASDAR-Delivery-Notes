"""
Visual + structural comparison between the official PDF and a generated note.

  python tests/compare_pdf.py [generated.pdf]

Checks:
  * identical page size
  * every text span of the original is found at the same position (±0.6pt) in the
    generated file, except the intentionally changed items (QMS code, "رقم", header/entry date)
  * forbidden strings ("QMS", "Rev.01") absent from text AND raw streams
  * writes tests/output/compare-overlay.png (original=red, generated=blue, same=black)
"""
import os
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(ROOT, "documents", "original-template.pdf")
GEN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tests", "output", "sample-generated.pdf")
OUT = os.path.join(ROOT, "tests", "output")


def spans(page):
    res = []
    for b in page.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                for c in s["chars"]:
                    if c["c"].strip():
                        res.append((c["c"], round(c["origin"][0], 1), round(c["origin"][1], 1), s["font"]))
    return res


def main():
    o, g = pymupdf.open(ORIG), pymupdf.open(GEN)
    po, pg = o[0], g[0]
    ok = True
    print("page size  original", tuple(round(v, 2) for v in po.rect), " generated", tuple(round(v, 2) for v in pg.rect))
    if po.rect != pg.rect or len(g) != 1:
        print("FAIL: page size/count differs"); ok = False

    gtext = pg.get_text()
    raw = b"".join(g.xref_stream(x) or b"" for x in range(1, g.xref_length()) if g.xref_is_stream(x))
    for bad in ["QMS", "Rev.01", "BE-020"]:
        if bad in gtext or bad.encode() in raw:
            print("FAIL: forbidden text present:", bad); ok = False
    if "ﺳﻨﺪ ﺗﺴﻠﯿﻢ رﻗﻢ" in gtext or "رﻗﻢ" in gtext:
        print("FAIL: word 'رقم' still next to the serial"); ok = False

    # character-level position comparison
    gen_chars = spans(pg)
    gen_index = {}
    for ch, x, y, f in gen_chars:
        gen_index.setdefault(ch, []).append((x, y))
    skip_y = [(132, 149, 280.5, 298),  # removed "رقم"
              (740, 760, 0, 600),      # removed QMS footer
              (171, 188, 450, 512),    # header date (value depends on date)
              (601, 618, 380, 462)]    # entry date (value depends on date)
    missing = []
    for ch, x, y, f in spans(po):
        if any(y0 <= y <= y1 and x0 <= x <= x1 for y0, y1, x0, x1 in skip_y):
            continue
        cands = gen_index.get(ch, [])
        if not any(abs(cx - x) <= 0.6 and abs(cy - y) <= 0.6 for cx, cy in cands):
            missing.append((ch, x, y, f))
    print(f"characters compared: {len(spans(po))}, not at identical position: {len(missing)}")
    for m in missing[:40]:
        print("   ", m)
    if missing:
        ok = False

    # overlay image
    os.makedirs(OUT, exist_ok=True)
    zoom = pymupdf.Matrix(2, 2)
    a = po.get_pixmap(matrix=zoom, colorspace=pymupdf.csGRAY)
    b = pg.get_pixmap(matrix=zoom, colorspace=pymupdf.csGRAY)
    from PIL import Image, ImageChops
    ia = Image.frombytes("L", (a.width, a.height), a.samples)
    ib = Image.frombytes("L", (b.width, b.height), b.samples)
    diff = ImageChops.difference(ia, ib)
    changed = sum(1 for v in diff.getdata() if v > 64)
    over = Image.merge("RGB", (ib, ImageChops.multiply(ia, ib), ia))
    over.save(os.path.join(OUT, "compare-overlay.png"))
    pg.get_pixmap(dpi=110).save(os.path.join(OUT, "sample-generated.png"))
    print(f"pixels differing (2x render): {changed} of {ia.width * ia.height} ({100 * changed / (ia.width * ia.height):.2f}%)")
    print("overlay -> tests/output/compare-overlay.png")
    print("RESULT:", "PASS" if ok else "CHECK DIFFERENCES ABOVE")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
