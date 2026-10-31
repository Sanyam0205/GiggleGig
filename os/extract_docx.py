#!/usr/bin/env python3
"""Extract plain text from a DOCX without extracting archive members to disk."""
import sys
import zipfile
import xml.etree.ElementTree as ET

MAX_ENTRIES = 2_000
MAX_XML_BYTES = 20 * 1024 * 1024
MAX_TEXT_CHARS = 1_000_000
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

with zipfile.ZipFile(sys.argv[1]) as archive:
    entries = archive.infolist()
    if len(entries) > MAX_ENTRIES:
        raise SystemExit('DOCX has too many archive entries.')
    doc = next((item for item in entries if item.filename == 'word/document.xml'), None)
    if doc is None or doc.file_size > MAX_XML_BYTES:
        raise SystemExit('DOCX document part is missing or too large.')
    with archive.open(doc) as stream:
        xml = stream.read(MAX_XML_BYTES + 1)
    if len(xml) > MAX_XML_BYTES:
        raise SystemExit('DOCX document part is too large.')

root = ET.fromstring(xml)
paragraphs = []
for paragraph in root.findall('.//w:p', NS):
    text = ''.join(node.text or '' for node in paragraph.findall('.//w:t', NS)).strip()
    if text:
        paragraphs.append(text)
result = '\n'.join(paragraphs)
if len(result) > MAX_TEXT_CHARS:
    raise SystemExit('Extracted resume text exceeds the size limit.')
sys.stdout.write(result)
