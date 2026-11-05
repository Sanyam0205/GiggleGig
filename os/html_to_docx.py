"""A Word copy of a tailored CV, from the same HTML the PDF is printed from (some ATS parse DOCX better than PDF).

Usage: python html_to_docx.py <cv.html> <cv.docx>
Single column, real headings, real bullets, no tables or text boxes: the shape ATS parsers read reliably.
"""
import sys
from html.parser import HTMLParser

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt

BLOCKS = {"h1", "h2", "h3", "h4", "p", "li", "div", "section", "header"}
SKIP = {"style", "script", "head", "title", "svg"}


class Converter(HTMLParser):
    def __init__(self, doc):
        super().__init__(convert_charrefs=True)
        self.doc = doc
        self.para = None
        self.kind = None
        self.bold = 0
        self.skip = 0

    def start_block(self, tag):
        if tag == "h1":
            self.para = self.doc.add_paragraph()
            self.para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif tag in ("h2", "h3", "h4"):
            self.para = self.doc.add_heading(level=1 if tag == "h2" else 2)
        elif tag == "li":
            self.para = self.doc.add_paragraph(style="List Bullet")
        else:
            self.para = None  # created on first text, so empty wrappers leave no blank lines
        self.kind = tag

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        elif tag in BLOCKS:
            self.start_block(tag)
        elif tag in ("b", "strong"):
            self.bold += 1
        elif tag == "br" and self.para is not None:
            self.para.add_run().add_break()

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in ("b", "strong"):
            self.bold = max(0, self.bold - 1)
        elif tag in BLOCKS:
            self.para = None

    def handle_data(self, data):
        if self.skip:
            return
        text = " ".join(data.split())
        if not text:
            return
        if self.para is None:
            self.para = self.doc.add_paragraph()
        if self.para.runs and not self.para.runs[-1].text.endswith(" ") and not text.startswith((",", ".", ";", ":")):
            text = " " + text
        run = self.para.add_run(text)
        run.bold = bool(self.bold) or self.kind == "h1"
        if self.kind == "h1":
            run.font.size = Pt(18)


def main():
    src, out = sys.argv[1], sys.argv[2]
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Arial"
    style.font.size = Pt(10)
    for section in doc.sections:
        section.top_margin = section.bottom_margin = Pt(36)
        section.left_margin = section.right_margin = Pt(40)
    Converter(doc).feed(open(src, encoding="utf-8").read())
    doc.save(out)


if __name__ == "__main__":
    main()
