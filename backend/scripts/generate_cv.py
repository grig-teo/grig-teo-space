#!/usr/bin/env python3
"""Generate minimalist CV PDF for Grigore Teodoru."""

import argparse
import json
from pathlib import Path

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Flowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

MILK = colors.HexColor("#F8F6F2")
INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#444444")

DEFAULT_LANGUAGES = [
    "Russian — Native or Bilingual",
    "Romanian — Native or Bilingual",
    "English — Professional Working",
]

_GITHUB_LOGO: ImageReader | None = None


def github_logo_reader() -> ImageReader:
    global _GITHUB_LOGO
    if _GITHUB_LOGO is not None:
        return _GITHUB_LOGO

    from PIL import Image, ImageDraw

    size = 96
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ink = (17, 17, 17, 255)

    draw.ellipse((10, 18, 86, 88), fill=ink)
    draw.ellipse((8, 4, 34, 34), fill=ink)
    draw.ellipse((62, 4, 88, 34), fill=ink)
    draw.rounded_rectangle((72, 52, 90, 88), radius=6, fill=ink)
    draw.ellipse((18, 10, 28, 20), fill=(248, 246, 242, 255))
    draw.ellipse((68, 10, 78, 20), fill=(248, 246, 242, 255))

    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    _GITHUB_LOGO = ImageReader(buf)
    return _GITHUB_LOGO


class ContactRow(Flowable):
    def __init__(self, width: float, contact: dict):
        super().__init__()
        self.width = width
        self.contact = contact
        self.height = 62

    def draw(self):
        c = self.canv
        block_w = self.width / 4
        email = self.contact["email"]
        website = self.contact.get("website", "https://grig-teo.space")
        github = self.contact["github"]
        linkedin = self.contact["linkedin"]
        website_label = website.replace("https://", "").replace("http://", "").rstrip("/")
        github_label = github.replace("https://github.com/", "github.com/")
        linkedin_label = linkedin.rstrip("/").split("/")[-1]
        contact_labels = self.contact.get("labels") or {}

        items = [
            (contact_labels.get("website", "Website"), website_label, website, self._website),
            (contact_labels.get("github", "GitHub"), github_label, github, self._github),
            (contact_labels.get("linkedin", "LinkedIn"), linkedin_label, linkedin, self._linkedin),
            (contact_labels.get("email", "Email"), email, f"mailto:{email}", self._mail),
        ]
        y_top = self.height - 18
        for i, (label, text, url, drawer) in enumerate(items):
            cx = block_w * i + block_w / 2
            drawer(c, cx, y_top, 7)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 7.5)
            c.drawCentredString(cx, y_top - 14, label)
            c.setFillColor(INK)
            c.setFont("Helvetica", 7)
            link_y = y_top - 28
            c.drawCentredString(cx, link_y, text)
            c.linkURL(
                url,
                (block_w * i + 4, link_y - 4, block_w * (i + 1) - 4, link_y + 12),
                relative=1,
            )

    @staticmethod
    def _website(c, cx, cy, r):
        c.setStrokeColor(INK)
        c.setLineWidth(0.8)
        c.circle(cx, cy, r, stroke=1, fill=0)
        c.line(cx - r * 0.65, cy, cx + r * 0.65, cy)
        c.line(cx, cy - r * 0.65, cx, cy + r * 0.65)
        c.circle(cx, cy, r * 0.35, stroke=1, fill=0)

    @staticmethod
    def _github(c, cx, cy, r):
        logo = github_logo_reader()
        side = r * 2.2
        c.drawImage(logo, cx - side / 2, cy - side / 2, side, side, mask="auto")

    @staticmethod
    def _linkedin(c, cx, cy, r):
        c.setStrokeColor(INK)
        c.setLineWidth(0.8)
        c.roundRect(cx - r, cy - r, r * 2, r * 2, 1.5, stroke=1, fill=0)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(cx, cy - 2.5, "in")

    @staticmethod
    def _mail(c, cx, cy, r):
        c.setStrokeColor(INK)
        c.setLineWidth(0.8)
        c.roundRect(cx - r, cy - r * 0.65, r * 2, r * 1.3, 1.2, stroke=1, fill=0)
        c.line(cx - r, cy + r * 0.65, cx, cy)
        c.line(cx + r, cy + r * 0.65, cx, cy)


def build_styles():
    base = getSampleStyleSheet()
    return {
        "name": ParagraphStyle(
            "Name",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=INK,
            spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=14,
            textColor=MUTED,
            spaceAfter=6,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=INK,
            spaceBefore=12,
            spaceAfter=8,
        ),
        "job_title": ParagraphStyle(
            "JobTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=INK,
        ),
        "job_meta": ParagraphStyle(
            "JobMeta",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=MUTED,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=INK,
            alignment=TA_LEFT,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=INK,
            leftIndent=10,
            spaceAfter=2,
        ),
        "stack": ParagraphStyle(
            "Stack",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            spaceAfter=6,
        ),
        "lang": ParagraphStyle(
            "Lang",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=INK,
            spaceAfter=2,
        ),
        "period": ParagraphStyle(
            "Period",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=MUTED,
            alignment=TA_RIGHT,
        ),
    }


def on_page(canvas_obj, _doc):
    canvas_obj.saveState()
    canvas_obj.setFillColor(MILK)
    canvas_obj.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas_obj.restoreState()


def generate(output_path: Path, data: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )

    languages = data.get("languages") or DEFAULT_LANGUAGES
    projects = data.get("projects") or []
    experience = data.get("experience") or []
    labels = data.get("labels") or {}

    story = [
        Paragraph(data["name"], styles["name"]),
        Paragraph(data["title"], styles["title"]),
        ContactRow(doc.width, data["contact"]),
        Spacer(1, 8),
    ]

    if projects:
        story.append(Paragraph(labels.get("projects", "PROJECTS"), styles["section"]))
        for project in projects:
            block = []
            title = project["title"]
            if project.get("inDevelopment"):
                in_dev = labels.get("inDevelopment", "(in development)")
                title = f'{title} <font color="#444444">{in_dev}</font>'
            block.append(Paragraph(title, styles["job_title"]))
            summary = project.get("overview") or project.get("description") or ""
            if summary:
                block.append(Spacer(1, 4))
                block.append(Paragraph(summary, styles["body"]))
            block.append(Spacer(1, 4))
            for bullet in project.get("highlights") or []:
                block.append(Paragraph(f"• {bullet}", styles["bullet"]))
            if project.get("tags"):
                block.append(Spacer(1, 3))
                tech = labels.get("techStack", "Tech stack:")
                block.append(Paragraph(f"{tech} {project['tags']}", styles["stack"]))
            block.append(Spacer(1, 4))
            story.extend(block)

    story.append(Paragraph(labels.get("experience", "EXPERIENCE"), styles["section"]))

    for job in experience:
        block = []
        header = Table(
            [
                [
                    Paragraph(job["company"], styles["job_title"]),
                    Paragraph(job["period"], styles["period"]),
                ]
            ],
            colWidths=[doc.width * 0.72, doc.width * 0.28],
        )
        header.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ]
            )
        )
        block.append(header)
        block.append(Paragraph(job["role"], styles["job_meta"]))
        if job.get("summary"):
            block.append(Spacer(1, 4))
            block.append(Paragraph(job["summary"], styles["body"]))
        block.append(Spacer(1, 4))
        for bullet in job.get("bullets") or []:
            block.append(Paragraph(f"• {bullet}", styles["bullet"]))
        if job.get("stack"):
            block.append(Spacer(1, 3))
            tech = labels.get("techStack", "Tech stack:")
            block.append(Paragraph(f"{tech} {job['stack']}", styles["stack"]))
        block.append(Spacer(1, 4))
        story.extend(block)

    story.append(Paragraph(labels.get("languages", "LANGUAGES"), styles["section"]))
    for lang in languages:
        story.append(Paragraph(lang, styles["lang"]))

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)


def load_data(input_path: Path | None) -> dict:
    if input_path is None:
        raise SystemExit("Missing --input JSON file with CV content")

    with input_path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CV PDF")
    parser.add_argument("--input", type=Path, help="JSON file with CV content")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "generated" / "grigore_teodoru_cv.en.pdf",
    )
    args = parser.parse_args()

    data = load_data(args.input)
    generate(args.output, data)
    print(f"Generated {args.output}")


if __name__ == "__main__":
    main()
