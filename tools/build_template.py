"""
Build step: turns the official delivery-note PDF into a clean template.

What it does (run once, or again whenever the source PDF / fonts change):
  1. Copies the official PDF to documents/original-template.pdf (reference copy, never modified).
  2. Removes ONLY the variable text (serial, dates, driver, plate, weights, quantity),
     the word "رقم" next to the serial, and the "QMS-F-BE-020,Rev.01" footer code.
     Lines, boxes, the Cementra logo and every fixed label stay byte-identical in
     position, font and colour. Text is truly deleted from the content stream
     (not covered with white boxes) so the removed strings do not exist in the file.
  3. Writes js/generated/embedded-assets.js containing the template + fonts as base64,
     so the web app works by simply double-clicking index.html (no server needed).

Usage:  python tools/build_template.py
Requires: pip install pymupdf
"""
import base64
import json
import os
import shutil
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "test.pdf")
ORIGINAL_COPY = os.path.join(ROOT, "documents", "original-template.pdf")
TEMPLATE_OUT = os.path.join(ROOT, "assets", "template", "delivery-note-template.pdf")
FONT_DIR = os.path.join(ROOT, "assets", "fonts")
JS_OUT = os.path.join(ROOT, "js", "generated", "embedded-assets.js")

# Regions (PyMuPDF top-left coordinates, points) whose text must be removed.
# Rects are kept inside each glyph row so neighbouring labels/lines are untouched.
REDACTIONS = {
    "serial_number":        (231.0, 136.0, 280.5, 145.0),
    "word_raqm_and_space":  (281.2, 136.0, 297.1, 145.0),   # "رقم" + the space before it
    "header_date":          (458.5, 175.0, 507.5, 185.0),
    "driver_name":          (359.9, 329.0, 459.6, 338.5),
    "plate_number":         (413.4, 354.0, 459.8, 363.5),
    "tare_value_and_unit":  (175.4, 304.0, 221.8, 313.0),
    "gross_value_and_unit": (175.4, 330.0, 221.8, 338.5),
    "net_value_and_unit":   (175.4, 355.0, 221.8, 364.5),
    "quantity_value":       (427.4, 573.0, 457.0, 583.0),
    "entry_date":           (386.6, 605.0, 459.8, 614.0),
    "driver_signature":     (346.6, 692.0, 446.2, 701.5),
    "form_code_footer":     (436.0, 746.0, 559.8, 756.0),
}

# Strings that must NOT survive in the template text layer.
MUST_BE_GONE = ["QMS", "1126001", "6088385", "22.78", "11/11/26", "NOV-2026"]
# Fixed text that MUST survive.
MUST_REMAIN = ["016602242", "Export", "Masdar for Cement Trading and", "Construction Material",
               "BY SYSTEM", "CEM I 52.5N", "Bulk"]


def build_template():
    os.makedirs(os.path.dirname(ORIGINAL_COPY), exist_ok=True)
    os.makedirs(os.path.dirname(TEMPLATE_OUT), exist_ok=True)
    if not os.path.exists(ORIGINAL_COPY):
        shutil.copyfile(SRC, ORIGINAL_COPY)

    doc = pymupdf.open(ORIGINAL_COPY)
    page = doc[0]
    for rect in REDACTIONS.values():
        # fill=False -> no rectangle painted; text is removed, nothing else.
        page.add_redact_annot(pymupdf.Rect(*rect), fill=False)
    page.apply_redactions(
        images=pymupdf.PDF_REDACT_IMAGE_NONE,
        graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
        text=pymupdf.PDF_REDACT_TEXT_REMOVE,
    )
    doc.set_metadata({"producer": "MASDAR Delivery Notes", "creator": "MASDAR Delivery Notes",
                      "title": "Delivery Note Template"})
    doc.save(TEMPLATE_OUT, garbage=3, deflate=True, clean=True)
    doc.close()

    # ---- verification ----
    check = pymupdf.open(TEMPLATE_OUT)
    text = check[0].get_text()
    raw = b"".join(check.xref_stream(x) or b"" for x in range(1, check.xref_length())
                   if check.xref_is_stream(x))
    errors = []
    for s in MUST_BE_GONE:
        if s in text:
            errors.append(f"still present: {s!r}")
    if "رقم" in text.replace("رﻗﻢ", "") and "ﺭﻗﻢ" not in text:  # only the plate/order-label "رقم" allowed
        pass
    for s in MUST_REMAIN:
        if s not in text:
            errors.append(f"fixed text lost: {s!r}")
    if b"QMS-F-BE" in raw:
        errors.append("QMS code still in a raw stream")
    fonts = {f[4]: f[3] for f in check[0].get_fonts(full=True)}
    check.close()
    if errors:
        print("TEMPLATE VERIFICATION FAILED:\n  " + "\n  ".join(errors))
        sys.exit(1)
    print("template OK ->", TEMPLATE_OUT)
    print("fonts kept:", fonts)
    return fonts


def extract_albany_subset():
    """Map {presentation-form char: [cid, width/1000]} of the original embedded
    Albany WT J subset, plus its resource name, so names can be written with
    the original glyphs whenever all needed letter-forms are present."""
    import re
    doc = pymupdf.open(TEMPLATE_OUT)
    page = doc[0]
    result = None
    for xref, ext, ftype, basefont, resname, enc, *_ in page.get_fonts(full=True):
        if "Albany" not in basefont:
            continue
        desc_xref = int(doc.xref_get_key(xref, "DescendantFonts")[1].strip("[]").split()[0])
        tu_xref = int(doc.xref_get_key(xref, "ToUnicode")[1].split()[0])
        w_src = doc.xref_get_key(desc_xref, "W")[1]
        widths = {}
        for cid, w in re.findall(r"(\d+)\s*\[\s*([\d.]+)\s*\]", w_src):
            widths[int(cid)] = float(w)
        cmap = doc.xref_stream(tu_xref).decode("latin1")
        glyphs = {}
        for cid, uni in re.findall(r"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>", cmap.split("beginbfchar", 1)[1]):
            ch = chr(int(uni, 16))
            if 0xFE70 <= ord(ch) <= 0xFEFF:
                glyphs[ch] = [int(cid, 16), widths.get(int(cid, 16), 1000) / 1000.0]
        result = {"resource": resname, "glyphs": glyphs}
    doc.close()
    print("Albany subset letter-forms available:", len(result["glyphs"]) if result else 0)
    return result


def b64(path):
    with open(path, "rb") as fh:
        return base64.b64encode(fh.read()).decode("ascii")


def build_js(fonts):
    os.makedirs(os.path.dirname(JS_OUT), exist_ok=True)
    os.makedirs(FONT_DIR, exist_ok=True)
    arial = os.path.join(FONT_DIR, "arial.ttf")
    if not os.path.exists(arial):
        win = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf")
        shutil.copyfile(win, arial)
    # Optional: the original Arabic font. Drop AlbanyWTJ.ttf into assets/fonts and rebuild.
    albany = None
    for name in os.listdir(FONT_DIR):
        if name.lower().startswith("albany") and name.lower().endswith(".ttf"):
            albany = os.path.join(FONT_DIR, name)
    data = {
        "template": b64(TEMPLATE_OUT),
        "arial": b64(arial),
        "albany": b64(albany) if albany else None,
        "templateFonts": fonts,
        "albanySubset": extract_albany_subset(),
    }
    with open(JS_OUT, "w", encoding="utf-8") as fh:
        fh.write("/* AUTO-GENERATED by tools/build_template.py - do not edit by hand. */\n")
        fh.write("window.MASDAR_ASSETS = ")
        json.dump(data, fh)
        fh.write(";\n")
    print("assets ->", JS_OUT, f"({os.path.getsize(JS_OUT)//1024} KB)",
          "| Arabic font:", "Albany WT J" if albany else "Arial (fallback)")


if __name__ == "__main__":
    build_js(build_template())
