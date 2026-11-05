"""Plain text from a resume PDF, for resume intake (agents get the text, not the PDF).

Usage: python extract_pdf.py <file.pdf>  → text on stdout. Exit 2 when the PDF has no text layer (a scan).
"""
import sys

from pypdf import PdfReader


def main():
    reader = PdfReader(sys.argv[1])
    if len(reader.pages) > 20:
        sys.exit("too many pages for a resume")
    text = "\n\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
    if len(text) < 200:
        sys.exit(2)
    print(text)


if __name__ == "__main__":
    main()
