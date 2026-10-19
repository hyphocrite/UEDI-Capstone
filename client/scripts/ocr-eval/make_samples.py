"""Makes SYNTHETIC sample documents (payslips, IDs, barangay certificates, signed forms)
with a labels.json, so the OCR evaluation can run before real documents are collected.

    pip install pillow
    python scripts/ocr-eval/make_samples.py --out ocr-samples/synthetic --count 8

Every image is fake: invented names, amounts and layouts, then degraded like a phone photo
(tilt, blur, shadow, noise, JPEG). Real UEDI documents are the real test; these only show
the pipeline works and catch regressions.
"""

from __future__ import annotations

import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

LAST = ["Dela Cruz", "Santos", "Reyes", "Garcia", "Mendoza", "Bautista", "Villanueva", "Ramos", "Aquino", "Castillo", "Navarro", "Torres", "Gonzales", "De Guzman", "Pascual"]
FIRST = ["Ana Marie", "Jose", "Maria Luisa", "Ramon", "Liza", "Miguel", "Grace", "Paolo", "Kristine Joy", "Mark Anthony", "Rowena", "Jericho", "Divina", "Arnel"]
BARANGAYS = ["New Visayas", "Gredu", "San Francisco", "Cagangohan", "J.P. Laurel", "Salvacion", "Southern Davao", "Kasilak", "Little Panay", "New Pandan", "Mabunao", "Santo Nino"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def font(size: int, bold: bool = False):
    for name in (["DejaVuSans-Bold.ttf", "arialbd.ttf"] if bold else ["DejaVuSans.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def person(rng: random.Random) -> dict:
    basic = rng.choice([14993, 18255, 22316, 27000, 30024, 36619, 43415, 51304, 61217, 70013])
    deductions = round(basic * rng.uniform(0.18, 0.45), 2)
    net_month = round(basic + 2000 - deductions, 2)
    return {
        "lastName": rng.choice(LAST),
        "firstName": rng.choice(FIRST),
        "middleInitial": rng.choice("ABCDEGLMRST"),
        "residenceAddress": f"Purok {rng.randint(1, 12)}, Brgy. {rng.choice(BARANGAYS)}, Panabo City, Davao del Norte",
        "employer": "Davao del Norte State College",
        "monthlySalary": basic,
        "netTakeHomePay": net_month,
    }


def money(n: float) -> str:
    return f"{n:,.2f}"


def page(lines: list[tuple[str, int, bool]], width=1240, margin=70) -> Image.Image:
    height = margin * 2 + sum(int(size * 1.9) for _, size, _ in lines)
    img = Image.new("RGB", (width, height), (250, 250, 247))
    d = ImageDraw.Draw(img)
    y = margin
    for text, size, bold in lines:
        d.text((margin, y), text, fill=(25, 25, 30), font=font(size, bold))
        y += int(size * 1.9)
    return img


def payslip(p: dict, rng: random.Random, today) -> Image.Image:
    basic = p["monthlySalary"]
    gross_half = (basic + 2000) / 2
    net_half = p["netTakeHomePay"] / 2
    ded = gross_half - net_half
    gsis, ph, hdmf = round(basic * 0.09 / 2, 2), round(basic * 0.025 / 2, 2), 100.0
    tax = round(max(ded - gsis - ph - hdmf, 0) * 0.4, 2)
    other = round(ded - gsis - ph - hdmf - tax, 2)
    # The latest pay period that has already ended, so the payslip is never dated in the future.
    if today["day"] >= 16:
        half, month_no, year = (1, 15), today["month"], today["year"]
    else:
        month_no = today["month"] - 1 or 12
        year = today["year"] - (1 if today["month"] == 1 else 0)
        half = (16, 30)
    month = MONTHS[month_no - 1]
    return page(
        [
            ("DAVAO DEL NORTE STATE COLLEGE", 34, True),
            ("New Visayas, Panabo City", 24, False),
            ("PAYSLIP", 30, True),
            (f"Pay Period: {month} {half[0]}-{half[1]}, {year}", 24, False),
            (f"Employee Name: {p['lastName'].upper()}, {p['firstName'].upper()} {p['middleInitial']}.", 24, False),
            (f"Employee No.: {rng.randint(2005, 2024)}-{rng.randint(1, 999):04d}", 24, False),
            (f"Basic Salary          {money(basic)}", 26, False),
            ("PERA                  2,000.00", 26, False),
            (f"Gross Pay             {money(gross_half)}", 26, False),
            ("Deductions:", 24, True),
            (f"GSIS Premium          {money(gsis)}", 24, False),
            (f"PhilHealth            {money(ph)}", 24, False),
            (f"Pag-IBIG              {money(hdmf)}", 24, False),
            (f"Withholding Tax       {money(tax)}", 24, False),
            (f"UEDI / Other Loans    {money(other)}", 24, False),
            (f"NET PAY               {money(net_half)}", 28, True),
        ]
    )


def national_id(p: dict, rng: random.Random, today) -> Image.Image:
    return page(
        [
            ("REPUBLIKA NG PILIPINAS", 26, True),
            ("PAMBANSANG PAGKAKAKILANLAN", 24, True),
            ("Philippine Identification Card", 24, False),
            (f"{rng.randint(1000, 9999)}-{rng.randint(1000, 9999)}-{rng.randint(1000, 9999)}-{rng.randint(1000, 9999)}", 30, True),
            ("Apelyido/Last Name", 20, False),
            (p["lastName"].upper(), 32, True),
            ("Mga Pangalan/Given Names", 20, False),
            (p["firstName"].upper(), 32, True),
            ("Gitnang Apelyido/Middle Name", 20, False),
            (rng.choice(LAST).upper(), 30, True),
            ("Petsa ng Kapanganakan/Date of Birth", 20, False),
            (f"{rng.choice(MONTHS).upper()} {rng.randint(1, 28)}, {rng.randint(1965, 2000)}", 28, True),
            ("Tirahan/Address", 20, False),
            (p["residenceAddress"].upper(), 22, False),
        ],
        width=1400,
    )


def barangay_cert(p: dict, rng: random.Random, today) -> Image.Image:
    brgy = p["residenceAddress"].split("Brgy. ")[1].split(",")[0]
    purok = p["residenceAddress"].split(",")[0]
    return page(
        [
            ("Republic of the Philippines", 24, False),
            ("Province of Davao del Norte", 24, False),
            ("City of Panabo", 24, False),
            (f"BARANGAY {brgy.upper()}", 28, True),
            ("OFFICE OF THE PUNONG BARANGAY", 26, True),
            ("CERTIFICATE OF RESIDENCY", 30, True),
            ("TO WHOM IT MAY CONCERN:", 24, False),
            (f"This is to certify that {p['firstName'].upper()} {p['middleInitial']}. {p['lastName'].upper()},", 24, False),
            (f"of legal age, is a bona fide resident of {purok}, Brgy. {brgy},", 24, False),
            ("Panabo City, Davao del Norte.", 24, False),
            (f"Issued this {today['day']}th day of {MONTHS[today['month'] - 1]}, {today['year']}.", 24, False),
            ("HON. PUNONG BARANGAY", 24, True),
        ]
    )


def signed_form(p: dict, rng: random.Random, today) -> Image.Image:
    return page(
        [
            ("UNITED DNSC EMPLOYEES, INC.", 32, True),
            ("New Visayas, Panabo City", 22, False),
            ("MUTUAL ASSISTANCE APPLICATION FORM", 30, True),
            (f"Name:   {p['lastName']}      {p['firstName']}      {p['middleInitial']}", 26, False),
            ("        Last Name         First Name      Middle Initial", 18, False),
            (f"Residence Address: {p['residenceAddress']}", 22, False),
            ("Employer: Davao del Norte State College", 22, False),
            (f"Monthly Salary: {money(p['monthlySalary'])}   Net take home pay: {money(p['netTakeHomePay'])}", 22, False),
            ("APPLICATION AGREEMENT", 26, True),
            ("I hereby authorize the Payroll Officer of my Employer, DNSC and/or the Treasurer", 20, False),
            ("of United DNSC Employees, Inc. to deduct the quincenal/monthly installment.", 20, False),
            ("Signature of the Applicant", 22, False),
        ]
    )


MAKERS = {"payslip": payslip, "valid_id": national_id, "proof_of_address": barangay_cert, "application_form": signed_form}


def degrade(img: Image.Image, level: str, rng: random.Random) -> Image.Image:
    """Makes a clean render look like a photo taken on a phone."""
    if level == "clean":
        return img
    strong = level == "poor"
    # Shadow: brightness falls off across the page.
    w, h = img.size
    shade = Image.linear_gradient("L").rotate(rng.choice([0, 90, 180, 270])).resize((w, h))
    dark = ImageEnhance.Brightness(img).enhance(0.55 if strong else 0.75)
    img = Image.composite(img, dark, shade)
    img = img.rotate(rng.uniform(-4, 4) if strong else rng.uniform(-2, 2), expand=True, fillcolor=(120, 115, 105))
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.8, 1.4) if strong else rng.uniform(0.3, 0.8)))
    scale = rng.uniform(0.55, 0.7) if strong else rng.uniform(0.75, 0.95)
    img = img.resize((int(img.width * scale), int(img.height * scale)))
    img = ImageEnhance.Contrast(img).enhance(0.7 if strong else 0.9)
    noise = Image.effect_noise(img.size, 18 if strong else 8).convert("RGB")
    return Image.blend(img, noise, 0.08 if strong else 0.04)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="ocr-samples/synthetic")
    ap.add_argument("--count", type=int, default=6, help="people; each gets one of every document type")
    ap.add_argument("--seed", type=int, default=7)
    checked = date.today()
    ap.add_argument("--date", default=(checked - timedelta(days=9)).isoformat(), help="date printed on payslips and certificates")
    ap.add_argument("--checked-on", default=checked.isoformat(), help="the day the documents are checked (labels.json 'today')")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    y, m, d = (int(x) for x in args.date.split("-"))
    today = {"year": y, "month": m, "day": d}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    labels = []
    for i in range(args.count):
        p = person(rng)
        for kind, make in MAKERS.items():
            level = ["clean", "phone", "poor"][i % 3]
            name = f"{i + 1:02d}-{kind}-{level}.jpg"
            degrade(make(p, rng, today), level, rng).save(out / name, quality=rng.randint(55, 85) if level != "clean" else 92)
            labels.append({"file": name, "type": kind, "applicant": p, "quality": level})
    (out / "labels.json").write_text(json.dumps({"today": args.checked_on, "samples": labels}, indent=2))
    print(f"Wrote {len(labels)} synthetic documents and labels.json to {out}")


if __name__ == "__main__":
    main()
