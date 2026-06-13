#!/usr/bin/env python3
"""Generate minimalist CV PDF for Grigore Teodoru."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

MILK = colors.HexColor("#F8F6F2")
INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#444444")

EMAIL = "grigore.teodoru97@gmail.com"
GITHUB = "https://github.com/grig-teo"
LINKEDIN = "https://www.linkedin.com/in/grigore-teodoru-228103287/"

EXPERIENCE = [
    {
        "company": "Vecin2Vecin",
        "role": "Founder / Full-Stack Developer",
        "period": "2025 — Present",
        "summary": "Hyperlocal P2P grocery delivery marketplace.",
        "bullets": [
            "End-to-end product: auth, catalog, checkout, courier flows, chat, push notifications.",
            "Payments, maps/geo, NestJS REST API, MongoDB, MinIO, multi-language UI.",
            "Production deployment on VPS with Docker Compose, HTTPS, and SMS integration.",
        ],
        "stack": "Next.js, React, TypeScript, Tailwind CSS, NestJS, MongoDB, Docker, Stripe",
    },
    {
        "company": "Debate Zone",
        "role": "Founder / Full-Stack Developer",
        "period": "2023 — Present",
        "summary": "Cross-platform live debate platform (iOS, Android, web).",
        "bullets": [
            "Native iOS/Android apps with WebRTC, SMS and Google Sign-In, push notifications.",
            "Dockerized backend: REST API, Socket.IO + mediasoup, recording and AI workers.",
            "Real-time debate mechanics, server-side recording, Whisper/Ollama AI pipeline.",
            "Next.js marketing site, admin dashboard, OpenAPI docs, observability tooling.",
        ],
        "stack": "TypeScript, Swift, Kotlin, Express, Socket.IO, mediasoup, FFmpeg, Docker",
    },
    {
        "company": "FeelIT",
        "role": "Back End Developer",
        "period": "2022 — 2023",
        "summary": "",
        "bullets": [
            "Implemented features, maintained legacy code, bug fixes, and code reviews.",
            "Task planning, estimation, and allocation.",
        ],
        "stack": "",
    },
    {
        "company": "Amdaris",
        "role": "Back End Developer",
        "period": "2021 — 2022",
        "summary": "",
        "bullets": [
            "Feature development, legacy maintenance, bug fixing, and code reviews.",
            "Task creation, estimation, and distribution; Azure deployment on internal project.",
        ],
        "stack": "",
    },
    {
        "company": "Crossinx GmbH",
        "role": "Back End & Android Developer",
        "period": "2018 — 2021",
        "summary": "",
        "bullets": [
            "Server-side development with Java, Hibernate, and Oracle database.",
            "Refactored monolith into Java/Spring Boot microservices.",
            "Android development with Java and Kotlin multiplatform library for iOS reuse.",
        ],
        "stack": "",
    },
]

LANGUAGES = [
    "Russian — Native or Bilingual",
    "Romanian — Native or Bilingual",
    "English — Professional Working",
]


class ContactRow(Flowable):
    def __init__(self, width: float):
        super().__init__()
        self.width = width
        self.height = 58

    def draw(self):
        c = self.canv
        block_w = self.width / 3
        items = [
            ("GitHub", "github.com/grig-teo", GITHUB, self._github),
            ("LinkedIn", "grigore-teodoru-228103287", LINKEDIN, self._linkedin),
            ("Email", EMAIL, f"mailto:{EMAIL}", self._mail),
        ]
        y_top = self.height - 18
        for i, (label, text, url, drawer) in enumerate(items):
            cx = block_w * i + block_w / 2
            drawer(c, cx, y_top, 7)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 8)
            c.drawCentredString(cx, y_top - 14, label)
            c.setFillColor(INK)
            c.setFont("Helvetica", 7.5)
            link_y = y_top - 28
            c.drawCentredString(cx, link_y, text)
            c.linkURL(
                url,
                (block_w * i + 6, link_y - 4, block_w * (i + 1) - 6, link_y + 12),
                relative=1,
            )

    @staticmethod
    def _github(c, cx, cy, r):
        c.setStrokeColor(INK)
        c.setLineWidth(0.8)
        c.circle(cx, cy, r, stroke=1, fill=0)
        c.line(cx - r * 0.55, cy + r * 0.15, cx + r * 0.55, cy + r * 0.15)

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


def generate(output_path: Path) -> None:
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

    story = [
        Paragraph("Grigore Teodoru", styles["name"]),
        Paragraph("Full-Stack Developer", styles["title"]),
        ContactRow(doc.width),
        Spacer(1, 8),
        Paragraph("EXPERIENCE", styles["section"]),
    ]

    for job in EXPERIENCE:
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
        if job["summary"]:
            block.append(Spacer(1, 4))
            block.append(Paragraph(job["summary"], styles["body"]))
        block.append(Spacer(1, 4))
        for bullet in job["bullets"]:
            block.append(Paragraph(f"• {bullet}", styles["bullet"]))
        if job["stack"]:
            block.append(Spacer(1, 3))
            block.append(Paragraph(job["stack"], styles["stack"]))
        block.append(Spacer(1, 4))
        story.append(KeepTogether(block))

    story.append(Paragraph("LANGUAGES", styles["section"]))
    for lang in LANGUAGES:
        story.append(Paragraph(lang, styles["lang"]))

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "assets" / "grigore_teodoru_cv.pdf"
    generate(out)
    print(f"Generated {out}")
