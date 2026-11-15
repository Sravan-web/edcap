# ==============================================================================
# PIPELINE / MODEL COMPONENT: Enterprise Bulk Excel/CSV Ingestion & ML Classifier
# TECH STACK: Python / FastAPI / Pandas / Scikit-Learn / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import csv
import io
import re
import uuid
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from xml.sax.saxutils import escape as xml_escape

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.assessment import StudentDiagnosticRecord
from app.models.course import Course, Enrollment
from app.models.user import User, UserRole
from app.services.diagnostic_service import (
    ensure_remedial_quiz_set,
    evaluate_student_parameters,
)

logger = get_logger(__name__)

REQUIRED_COLUMNS = [
    "roll_number",
    "student_name",
    "mid1_marks",
    "mid2_marks",
    "internal_quiz_score",
    "assignment_score",
    "attendance_percentage",
]

ALL_TEMPLATE_COLUMNS = [
    "roll_number",
    "student_name",
    "mid1_marks",
    "mid2_marks",
    "internal_quiz_score",
    "assignment_score",
    "attendance_percentage",
    "lab_score",
    "participation_index",
]

COLUMN_ALIASES: Dict[str, str] = {
    "roll": "roll_number",
    "rollno": "roll_number",
    "roll_no": "roll_number",
    "rollnumber": "roll_number",
    "student_id": "roll_number",
    "usn": "roll_number",
    "reg_no": "roll_number",
    "name": "student_name",
    "studentname": "student_name",
    "full_name": "student_name",
    "mid1": "mid1_marks",
    "mid_1": "mid1_marks",
    "mid1marks": "mid1_marks",
    "midterm1": "mid1_marks",
    "mid2": "mid2_marks",
    "mid_2": "mid2_marks",
    "mid2marks": "mid2_marks",
    "midterm2": "mid2_marks",
    "quiz": "internal_quiz_score",
    "quiz_score": "internal_quiz_score",
    "internal_quiz": "internal_quiz_score",
    "internalquizscore": "internal_quiz_score",
    "assignment": "assignment_score",
    "assignment_marks": "assignment_score",
    "assignmentscore": "assignment_score",
    "attendance": "attendance_percentage",
    "attendance_pct": "attendance_percentage",
    "attendancepercentage": "attendance_percentage",
    "lab": "lab_score",
    "lab_marks": "lab_score",
    "labscore": "lab_score",
    "participation": "participation_index",
    "engagement": "participation_index",
    "participationindex": "participation_index",
}

SAMPLE_TEMPLATE_ROWS: List[Dict[str, Any]] = [
    {
        "roll_number": "CS24-101",
        "student_name": "Aarav Sharma",
        "mid1_marks": 11.0,
        "mid2_marks": 8.5,
        "internal_quiz_score": 3.5,
        "assignment_score": 4.0,
        "attendance_percentage": 64.0,
        "lab_score": 8.0,
        "participation_index": 1.8,
    },
    {
        "roll_number": "CS24-102",
        "student_name": "Diya Patel",
        "mid1_marks": 26.5,
        "mid2_marks": 28.0,
        "internal_quiz_score": 9.0,
        "assignment_score": 9.5,
        "attendance_percentage": 94.0,
        "lab_score": 18.5,
        "participation_index": 4.8,
    },
    {
        "roll_number": "CS24-103",
        "student_name": "Rohan Verma",
        "mid1_marks": 14.0,
        "mid2_marks": 10.0,
        "internal_quiz_score": 4.0,
        "assignment_score": 5.0,
        "attendance_percentage": 68.5,
        "lab_score": 9.0,
        "participation_index": 2.1,
    },
    {
        "roll_number": "CS24-104",
        "student_name": "Sneha Kulkarni",
        "mid1_marks": 20.0,
        "mid2_marks": 21.5,
        "internal_quiz_score": 7.0,
        "assignment_score": 7.5,
        "attendance_percentage": 83.0,
        "lab_score": 14.5,
        "participation_index": 3.6,
    },
    {
        "roll_number": "CS24-105",
        "student_name": "Karthik Nair",
        "mid1_marks": 9.5,
        "mid2_marks": 7.0,
        "internal_quiz_score": 3.0,
        "assignment_score": 3.5,
        "attendance_percentage": 59.0,
        "lab_score": 7.5,
        "participation_index": 1.5,
    },
    {
        "roll_number": "CS24-106",
        "student_name": "Ananya Iyer",
        "mid1_marks": 27.0,
        "mid2_marks": 29.0,
        "internal_quiz_score": 9.5,
        "assignment_score": 9.5,
        "attendance_percentage": 96.5,
        "lab_score": 19.0,
        "participation_index": 4.9,
    },
    {
        "roll_number": "CS24-107",
        "student_name": "Vikram Deshmukh",
        "mid1_marks": 18.5,
        "mid2_marks": 19.0,
        "internal_quiz_score": 6.5,
        "assignment_score": 7.0,
        "attendance_percentage": 79.0,
        "lab_score": 13.5,
        "participation_index": 3.2,
    },
    {
        "roll_number": "CS24-108",
        "student_name": "Meera Joshi",
        "mid1_marks": 15.0,
        "mid2_marks": 11.0,
        "internal_quiz_score": 4.5,
        "assignment_score": 4.5,
        "attendance_percentage": 71.0,
        "lab_score": 9.5,
        "participation_index": 2.2,
    },
    {
        "roll_number": "CS24-109",
        "student_name": "Aditya Rao",
        "mid1_marks": 22.0,
        "mid2_marks": 23.0,
        "internal_quiz_score": 7.5,
        "assignment_score": 8.0,
        "attendance_percentage": 86.0,
        "lab_score": 15.5,
        "participation_index": 3.9,
    },
    {
        "roll_number": "CS24-110",
        "student_name": "Pooja Reddy",
        "mid1_marks": 10.0,
        "mid2_marks": 9.0,
        "internal_quiz_score": 3.0,
        "assignment_score": 4.0,
        "attendance_percentage": 62.0,
        "lab_score": 8.0,
        "participation_index": 1.7,
    },
]


def _col_letter(col_idx_zero_based: int) -> str:
    """Convert 0-based column index to Excel column letter (A, B, ..., Z, AA)."""
    result = ""
    n = col_idx_zero_based + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result


def generate_xlsx_template_bytes() -> bytes:
    """
    Generates a standards-compliant Office Open XML (.xlsx) workbook in-memory.
    Uses openpyxl if installed, or a clean OpenXML ZIP builder fallback so it never fails.
    """
    try:
        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Student_Assessment_Template"

        ws.append(ALL_TEMPLATE_COLUMNS)
        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        for col_idx in range(1, len(ALL_TEMPLATE_COLUMNS) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")

        for row in SAMPLE_TEMPLATE_ROWS:
            ws.append([row[col] for col in ALL_TEMPLATE_COLUMNS])

        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = col[0].column_letter
            ws.column_dimensions[col_letter].width = max(max_len + 4, 16)

        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()
    except Exception:
        # Pure-Python standards-compliant OpenXML (.xlsx) builder
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(
                "[Content_Types].xml",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                '<Default Extension="xml" ContentType="application/xml"/>'
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                "</Types>",
            )
            zf.writestr(
                "_rels/.rels",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                "</Relationships>",
            )
            zf.writestr(
                "xl/workbook.xml",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                '<sheets><sheet name="Student_Assessment_Template" sheetId="1" r:id="rId1"/></sheets>'
                "</workbook>",
            )
            zf.writestr(
                "xl/_rels/workbook.xml.rels",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
                "</Relationships>",
            )

            rows_xml = []
            # Row 1: Headers
            header_cells = []
            for c_idx, col_name in enumerate(ALL_TEMPLATE_COLUMNS):
                ref = f"{_col_letter(c_idx)}1"
                header_cells.append(
                    f'<c r="{ref}" t="inlineStr"><is><t>{xml_escape(col_name)}</t></is></c>'
                )
            rows_xml.append(f'<row r="1">{"".join(header_cells)}</row>')

            # Sample rows
            for r_idx, row_data in enumerate(SAMPLE_TEMPLATE_ROWS, start=2):
                cells = []
                for c_idx, col_name in enumerate(ALL_TEMPLATE_COLUMNS):
                    ref = f"{_col_letter(c_idx)}{r_idx}"
                    val = row_data[col_name]
                    if isinstance(val, (int, float)):
                        cells.append(f'<c r="{ref}" t="n"><v>{val}</v></c>')
                    else:
                        cells.append(
                            f'<c r="{ref}" t="inlineStr"><is><t>{xml_escape(str(val))}</t></is></c>'
                        )
                rows_xml.append(f'<row r="{r_idx}">{"".join(cells)}</row>')

            sheet_xml = (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f'<sheetData>{"".join(rows_xml)}</sheetData>'
                "</worksheet>"
            )
            zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)

        return buf.getvalue()


def generate_csv_template_str() -> str:
    """Generates a CSV string version of the student bulk template."""
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=ALL_TEMPLATE_COLUMNS)
    writer.writeheader()
    for row in SAMPLE_TEMPLATE_ROWS:
        writer.writerow(row)
    return out.getvalue()


def _parse_xlsx_fallback(content: bytes) -> pd.DataFrame:
    """
    Pure-Python OpenXML (.xlsx) parser using zipfile + xml.etree.ElementTree.
    Reads sharedStrings.xml and sheet1.xml so .xlsx uploads work even without openpyxl.
    """
    with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            ss_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in ss_root.iter():
                if si.tag.endswith("}si") or si.tag == "si":
                    texts = [
                        t.text or ""
                        for t in si.iter()
                        if t.tag.endswith("}t") or t.tag == "t"
                    ]
                    shared_strings.append("".join(texts))

        sheet_files = sorted(
            [n for n in zf.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
        )
        if not sheet_files:
            raise ValueError("No worksheet found inside .xlsx archive.")

        sheet_root = ET.fromstring(zf.read(sheet_files[0]))
        parsed_rows: List[List[Any]] = []

        def col_ref_to_idx(cell_ref: str) -> int:
            letters = "".join(ch for ch in cell_ref if ch.isalpha()).upper()
            idx = 0
            for ch in letters:
                idx = idx * 26 + (ord(ch) - 64)
            return max(0, idx - 1)

        for row_el in sheet_root.iter():
            if not (row_el.tag.endswith("}row") or row_el.tag == "row"):
                continue
            row_dict: Dict[int, Any] = {}
            next_col = 0
            for c_el in row_el:
                if not (c_el.tag.endswith("}c") or c_el.tag == "c"):
                    continue
                ref = c_el.attrib.get("r", "")
                c_idx = col_ref_to_idx(ref) if ref else next_col
                next_col = c_idx + 1
                c_type = c_el.attrib.get("t", "n")

                val_text = None
                if c_type == "inlineStr":
                    texts = [
                        t.text or ""
                        for t in c_el.iter()
                        if t.tag.endswith("}t") or t.tag == "t"
                    ]
                    val_text = "".join(texts)
                else:
                    for v_el in c_el:
                        if v_el.tag.endswith("}v") or v_el.tag == "v":
                            val_text = v_el.text
                            break
                    if c_type == "s" and val_text is not None:
                        try:
                            s_idx = int(val_text)
                            val_text = shared_strings[s_idx] if 0 <= s_idx < len(shared_strings) else val_text
                        except Exception:
                            pass

                row_dict[c_idx] = val_text

            if row_dict:
                max_c = max(row_dict.keys())
                parsed_rows.append([row_dict.get(i, None) for i in range(max_c + 1)])

        if not parsed_rows:
            return pd.DataFrame()

        headers = [str(h or f"col_{i}").strip() for i, h in enumerate(parsed_rows[0])]
        data_rows = parsed_rows[1:]
        return pd.DataFrame(data_rows, columns=headers)


def parse_uploaded_tabular_file(content: bytes, filename: str) -> pd.DataFrame:
    """Parses .csv, .xlsx, or .xls bytes into a normalized Pandas DataFrame."""
    lower_name = (filename or "").lower()
    if lower_name.endswith(".csv"):
        try:
            df = pd.read_csv(io.BytesIO(content))
        except UnicodeDecodeError:
            df = pd.read_csv(io.BytesIO(content), encoding="latin-1")
    elif lower_name.endswith(".xlsx") or lower_name.endswith(".xls"):
        try:
            df = pd.read_excel(io.BytesIO(content))
        except Exception:
            df = _parse_xlsx_fallback(content)
    else:
        raise ValueError("Unsupported file format. Please upload a .xlsx, .xls, or .csv file.")

    # Normalize column headers
    normalized_cols: Dict[str, str] = {}
    for col in df.columns:
        clean = re.sub(r"[^a-z0-9_]", "_", str(col).strip().lower()).strip("_")
        clean = re.sub(r"_+", "_", clean)
        mapped = COLUMN_ALIASES.get(clean, clean)
        normalized_cols[col] = mapped

    df = df.rename(columns=normalized_cols)
    return df


def compute_classroom_metrics_and_mapping(
    *,
    mid1_marks: float,
    mid2_marks: float,
    internal_quiz_score: float,
    assignment_score: float,
    attendance_percentage: float,
    lab_score: Optional[float],
    participation_index: Optional[float],
) -> Dict[str, Any]:
    """
    Computes derived classroom metrics (`aggregate_percentage`, `risk_score`, `category`, `tier`)
    and maps classroom scores into the 9 cognitive/academic dimensions for the ML ensemble.
    """
    has_lab = lab_score is not None and not np.isnan(lab_score)
    clean_lab = float(lab_score) if has_lab else 10.0
    clean_part = float(participation_index) if (participation_index is not None and not np.isnan(participation_index)) else 3.0
    clean_part = max(1.0, min(5.0, clean_part))

    # Calculate Aggregate Percentage (out of 100)
    raw_without_lab = mid1_marks + mid2_marks + internal_quiz_score + assignment_score  # max 80
    if has_lab:
        aggregate_pct = raw_without_lab + clean_lab  # max 100 (30 + 30 + 10 + 10 + 20)
    else:
        aggregate_pct = (raw_without_lab / 80.0) * 100.0

    aggregate_pct = round(max(0.0, min(100.0, aggregate_pct)), 1)

    # Mid-term trend: negative when Mid-2 drops compared to Mid-1
    mid_trend = mid2_marks - mid1_marks
    declining_mid_trend = mid_trend < -2.0 or (mid2_marks < 12.0 and mid2_marks <= mid1_marks)

    # Weighted Composite Competency Score (0 - 100)
    # 55% Academic Aggregate + 25% Attendance + 20% Participation
    participation_pct = (clean_part / 5.0) * 100.0
    trend_adjustment = max(-8.0, min(5.0, mid_trend * 0.5))
    composite_competency = (
        0.55 * aggregate_pct
        + 0.25 * attendance_percentage
        + 0.20 * participation_pct
        + trend_adjustment
    )
    composite_competency = round(max(5.0, min(99.0, composite_competency)), 1)

    # Risk score (0 - 100 scale where higher means higher risk of falling behind)
    risk_score_100 = round(max(1.0, min(99.0, 100.0 - composite_competency)), 1)

    # Map classroom components to 1-5 cognitive parameters and 0-10 CGPA
    mid_pct = ((mid1_marks + mid2_marks) / 60.0) * 100.0
    quiz_pct = (internal_quiz_score / 10.0) * 100.0
    assign_pct = (assignment_score / 10.0) * 100.0
    lab_pct = (clean_lab / 20.0) * 100.0

    cgpa = round(max(2.0, min(10.0, (aggregate_pct / 10.0) * 0.95 + 0.3)), 2)
    analytical_thinking = round(max(1.0, min(5.0, 1.0 + (mid_pct / 100.0) * 4.0)), 1)
    knowledge_level = round(max(1.0, min(5.0, 1.0 + (quiz_pct / 100.0) * 4.0)), 1)
    problem_solving_skills = round(max(1.0, min(5.0, 1.0 + (lab_pct / 100.0) * 4.0)), 1)
    decision_making = round(max(1.0, min(5.0, 1.0 + (assign_pct / 100.0) * 4.0)), 1)
    errors = round(
        max(
            1.0,
            min(
                5.0,
                1.0 + ((0.5 * quiz_pct + 0.5 * lab_pct) / 100.0) * 4.0 + (0.3 if mid_trend >= 0 else -0.4),
            ),
        ),
        1,
    )

    # Deterministic + ML threshold rules for Slow Learner vs Moderate vs Advanced
    is_slow = (
        aggregate_pct < 45.0
        or (attendance_percentage < 75.0 and (declining_mid_trend or aggregate_pct < 58.0))
        or composite_competency < 55.0
    )

    if is_slow:
        category = "Slow Learner"
        tier = "Developing"
    elif aggregate_pct >= 75.0 and attendance_percentage >= 75.0 and composite_competency >= 75.0:
        category = "Advanced Learner"
        tier = "Advanced"
    else:
        category = "Moderate Learner"
        tier = "Proficient"

    return {
        "mid1_marks": round(mid1_marks, 1),
        "mid2_marks": round(mid2_marks, 1),
        "internal_quiz_score": round(internal_quiz_score, 1),
        "assignment_score": round(assignment_score, 1),
        "attendance_percentage": round(attendance_percentage, 1),
        "lab_score": round(clean_lab, 1),
        "participation_index": round(clean_part, 1),
        "aggregate_percentage": aggregate_pct,
        "risk_score": risk_score_100,
        "composite_competency": composite_competency,
        "declining_mid_trend": declining_mid_trend,
        "category": category,
        "tier": tier,
        "marks": aggregate_pct,
        "class_performance": clean_part,
        "cgpa": cgpa,
        "analytical_thinking": analytical_thinking,
        "knowledge_level": knowledge_level,
        "problem_solving_skills": problem_solving_skills,
        "decision_making": decision_making,
        "errors": errors,
    }


def _apply_sklearn_batch_clustering(valid_items: List[Dict[str, Any]]) -> None:
    """
    Runs Scikit-Learn StandardScaler + KMeans clustering across the uploaded batch
    to refine cluster boundaries and detect borderline Slow Learners in large cohorts.
    """
    if len(valid_items) < 4:
        return

    try:
        features = np.array(
            [
                [
                    item["metrics"]["aggregate_percentage"],
                    item["metrics"]["attendance_percentage"],
                    item["metrics"]["mid2_marks"] - item["metrics"]["mid1_marks"],
                    item["metrics"]["participation_index"],
                    item["metrics"]["internal_quiz_score"],
                ]
                for item in valid_items
            ],
            dtype=float,
        )
        scaler = StandardScaler()
        scaled = scaler.fit_transform(features)

        n_clusters = min(3, len(valid_items))
        kmeans = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
        labels = kmeans.fit_predict(scaled)

        # Rank clusters by mean aggregate_percentage
        cluster_means = {}
        for c_id in range(n_clusters):
            mask = labels == c_id
            cluster_means[c_id] = float(np.mean(features[mask, 0])) if np.any(mask) else 50.0

        sorted_clusters = sorted(cluster_means.keys(), key=lambda c: cluster_means[c])
        lowest_cluster = sorted_clusters[0]

        for idx, item in enumerate(valid_items):
            m = item["metrics"]
            # If Scikit-Learn places a borderline student in the lowest cluster and aggregate < 55%, flag as Slow Learner
            if int(labels[idx]) == lowest_cluster and m["aggregate_percentage"] < 55.0:
                m["category"] = "Slow Learner"
                m["tier"] = "Developing"
                m["risk_score"] = max(m["risk_score"], 52.0)
    except Exception as exc:
        logger.warning("sklearn_batch_clustering_fallback", error=str(exc))


async def process_bulk_student_upload(
    db: AsyncSession,
    *,
    content: bytes,
    filename: str,
    faculty_id: uuid.UUID,
    course_id: Optional[uuid.UUID] = None,
) -> Dict[str, Any]:
    """
    Parses, validates, classifies, and upserts a bulk Excel/CSV student batch.
    Flags malformed rows without crashing the batch and assigns remedial quizzes to Slow Learners.
    """
    # Resolve target course if not explicitly passed
    if not course_id:
        c_res = await db.execute(select(Course).where(Course.is_active == True).limit(1))
        first_course = c_res.scalar_one_or_none()
        if not first_course:
            raise ValueError("No active course found in database.")
        course_id = first_course.id

    df = parse_uploaded_tabular_file(content, filename)
    if df.empty:
        raise ValueError("The uploaded file contains no student rows.")

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        raise ValueError(
            f"Missing required columns: {', '.join(missing_cols)}. "
            f"Required columns are: {', '.join(REQUIRED_COLUMNS)}"
        )

    total_processed = len(df)
    skipped_rows: List[Dict[str, Any]] = []
    valid_items: List[Dict[str, Any]] = []
    seen_rolls: set[str] = set()

    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # 1-based + header row
        raw_roll = str(row.get("roll_number", "") if pd.notna(row.get("roll_number")) else "").strip()
        raw_name = str(row.get("student_name", "") if pd.notna(row.get("student_name")) else "").strip()

        if not raw_roll and not raw_name:
            # Completely blank row
            total_processed -= 1
            continue

        if not raw_roll:
            skipped_rows.append(
                {
                    "row_number": row_num,
                    "roll_number": "MISSING",
                    "student_name": raw_name or "Unknown",
                    "reason": "Missing roll_number identifier.",
                }
            )
            continue

        if not raw_name or len(raw_name) < 2:
            skipped_rows.append(
                {
                    "row_number": row_num,
                    "roll_number": raw_roll,
                    "student_name": raw_name or "MISSING",
                    "reason": "Student name is missing or shorter than 2 characters.",
                }
            )
            continue

        roll_key = raw_roll.upper()
        if roll_key in seen_rolls:
            skipped_rows.append(
                {
                    "row_number": row_num,
                    "roll_number": raw_roll,
                    "student_name": raw_name,
                    "reason": f"Duplicate roll_number '{raw_roll}' in uploaded file.",
                }
            )
            continue

        # Parse numeric fields with strict range validation
        try:
            mid1 = float(row["mid1_marks"])
            mid2 = float(row["mid2_marks"])
            quiz = float(row["internal_quiz_score"])
            assign = float(row["assignment_score"])
            attendance = float(row["attendance_percentage"])

            if any(np.isnan(x) for x in [mid1, mid2, quiz, assign, attendance]):
                raise ValueError("One or more required numeric marks/attendance cells are blank or NaN.")

            lab_val: Optional[float] = None
            if "lab_score" in df.columns and pd.notna(row.get("lab_score")) and str(row.get("lab_score")).strip() != "":
                lab_val = float(row["lab_score"])

            part_val: Optional[float] = None
            if (
                "participation_index" in df.columns
                and pd.notna(row.get("participation_index"))
                and str(row.get("participation_index")).strip() != ""
            ):
                part_val = float(row["participation_index"])
        except Exception as exc:
            skipped_rows.append(
                {
                    "row_number": row_num,
                    "roll_number": raw_roll,
                    "student_name": raw_name,
                    "reason": f"Invalid numeric format: {str(exc)}",
                }
            )
            continue

        # Validate score boundaries
        range_errors = []
        if not (0.0 <= mid1 <= 30.0):
            range_errors.append(f"mid1_marks ({mid1}) must be between 0 and 30")
        if not (0.0 <= mid2 <= 30.0):
            range_errors.append(f"mid2_marks ({mid2}) must be between 0 and 30")
        if not (0.0 <= quiz <= 10.0):
            range_errors.append(f"internal_quiz_score ({quiz}) must be between 0 and 10")
        if not (0.0 <= assign <= 10.0):
            range_errors.append(f"assignment_score ({assign}) must be between 0 and 10")
        if not (0.0 <= attendance <= 100.0):
            range_errors.append(f"attendance_percentage ({attendance}) must be between 0 and 100")
        if lab_val is not None and not (0.0 <= lab_val <= 20.0):
            range_errors.append(f"lab_score ({lab_val}) must be between 0 and 20")
        if part_val is not None and not (1.0 <= part_val <= 5.0):
            range_errors.append(f"participation_index ({part_val}) must be between 1.0 and 5.0")

        if range_errors:
            skipped_rows.append(
                {
                    "row_number": row_num,
                    "roll_number": raw_roll,
                    "student_name": raw_name,
                    "reason": "; ".join(range_errors),
                }
            )
            continue

        seen_rolls.add(roll_key)
        metrics = compute_classroom_metrics_and_mapping(
            mid1_marks=mid1,
            mid2_marks=mid2,
            internal_quiz_score=quiz,
            assignment_score=assign,
            attendance_percentage=attendance,
            lab_score=lab_val,
            participation_index=part_val,
        )
        valid_items.append(
            {
                "row_number": row_num,
                "roll_number": raw_roll,
                "student_name": raw_name,
                "metrics": metrics,
            }
        )

    # Run Scikit-Learn KMeans batch clustering across valid records
    _apply_sklearn_batch_clustering(valid_items)

    # Ensure course remedial quiz exists
    remedial_quiz = await ensure_remedial_quiz_set(db, course_id=course_id, creator_id=faculty_id)

    processed_students: List[Dict[str, Any]] = []
    slow_learners_count = 0
    moderate_learners_count = 0
    advanced_learners_count = 0

    for item in valid_items:
        roll_number = item["roll_number"]
        student_name = item["student_name"]
        m = item["metrics"]

        # Resolve or create Student User keyed by roll_number email
        clean_roll_slug = re.sub(r"[^a-z0-9]", "", roll_number.lower()) or "student"
        student_email = f"{clean_roll_slug}@edcap.demo"

        # Check if a diagnostic record with this roll_number already exists in this course
        existing_diag_res = await db.execute(
            select(StudentDiagnosticRecord, User)
            .join(User, User.id == StudentDiagnosticRecord.student_id)
            .where(
                StudentDiagnosticRecord.course_id == course_id,
                StudentDiagnosticRecord.roll_number == roll_number,
            )
            .limit(1)
        )
        existing_pair = existing_diag_res.first()

        if existing_pair:
            stu_user = existing_pair[1]
            parts = student_name.split()
            stu_user.first_name = parts[0] if parts else "Student"
            stu_user.last_name = " ".join(parts[1:]) if len(parts) > 1 else roll_number
        else:
            user_res = await db.execute(select(User).where(User.email == student_email).limit(1))
            stu_user = user_res.scalar_one_or_none()
            parts = student_name.split()
            first_name = parts[0] if parts else "Student"
            last_name = " ".join(parts[1:]) if len(parts) > 1 else roll_number
            if not stu_user:
                stu_user = User(
                    email=student_email,
                    first_name=first_name,
                    last_name=last_name,
                    password_hash=hash_password("Password123!"),
                    role=UserRole.STUDENT.value,
                )
                db.add(stu_user)
                await db.flush()
            else:
                stu_user.first_name = first_name
                stu_user.last_name = last_name

        record = await evaluate_student_parameters(
            db,
            faculty_id=faculty_id,
            course_id=course_id,
            student_id=stu_user.id,
            student_name=student_name,
            marks=m["marks"],
            class_performance=m["class_performance"],
            cgpa=m["cgpa"],
            urban_rural="Urban",
            analytical_thinking=m["analytical_thinking"],
            knowledge_level=m["knowledge_level"],
            problem_solving_skills=m["problem_solving_skills"],
            decision_making=m["decision_making"],
            errors=m["errors"],
            auto_assign_remedial=(m["tier"] == "Developing"),
            roll_number=roll_number,
            mid1_marks=m["mid1_marks"],
            mid2_marks=m["mid2_marks"],
            internal_quiz_score=m["internal_quiz_score"],
            assignment_score=m["assignment_score"],
            attendance_percentage=m["attendance_percentage"],
            lab_score=m["lab_score"],
            participation_index=m["participation_index"],
            aggregate_percentage=m["aggregate_percentage"],
            risk_score=m["risk_score"],
            category_override=m["category"],
            tier_override=m["tier"],
        )

        if record.tier == "Developing":
            slow_learners_count += 1
            if not record.remedial_assigned:
                record.remedial_quiz_id = remedial_quiz.id
                record.remedial_assigned = True
        elif record.tier == "Proficient":
            moderate_learners_count += 1
        else:
            advanced_learners_count += 1

        processed_students.append(
            {
                "id": str(record.id),
                "student_id": str(record.student_id),
                "roll_number": record.roll_number or roll_number,
                "student_name": student_name,
                "email": stu_user.email,
                "mid1_marks": record.mid1_marks,
                "mid2_marks": record.mid2_marks,
                "internal_quiz_score": record.internal_quiz_score,
                "assignment_score": record.assignment_score,
                "attendance_percentage": record.attendance_percentage,
                "lab_score": record.lab_score,
                "participation_index": record.participation_index,
                "aggregate_percentage": record.aggregate_percentage,
                "risk_score": record.risk_score,
                "category": record.category,
                "tier": record.tier,
                "learner_score": record.learner_score,
                "is_slow_learner": record.is_slow_learner,
                "remedial_assigned": record.remedial_assigned,
                "remedial_quiz_id": str(record.remedial_quiz_id) if record.remedial_quiz_id else None,
            }
        )

    await db.commit()

    return {
        "status": "success",
        "course_id": str(course_id),
        "total_processed": total_processed,
        "successful": len(processed_students),
        "skipped": len(skipped_rows),
        "slow_learners_count": slow_learners_count,
        "moderate_learners_count": moderate_learners_count,
        "advanced_learners_count": advanced_learners_count,
        "skipped_rows": skipped_rows,
        "students": processed_students,
    }
