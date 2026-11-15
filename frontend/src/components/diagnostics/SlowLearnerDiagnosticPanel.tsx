'use client';
// ==============================================================================
// EdCap — Enterprise Bulk Excel/CSV & Individual Student Performance Analytics
// Supports 60–100+ Student Classroom Batches, Pre-Upload Validation,
// Scikit-Learn + Threshold Slow Learner Detection & Remedial Quiz Assignment
// Zero Emojis · Pure SVG Icons & Charts · Complete Accessibility
// ==============================================================================
import { useEffect, useState, useMemo, useRef } from 'react';
import { Icon, IconTile } from '@/components/ui/Icon';
import {
  assessmentsApi,
  studentsApi,
  type Course,
  type DiagnosticSummaryResponse,
  type DiagnosticStudentRecord,
  type DiagnosticStudentInput,
  type BulkUploadResponse,
} from '@/lib/api';

interface Props {
  courses: Course[];
  activeCourseId: string;
  onCourseChange: (courseId: string) => void;
  showToast: (msg: string) => void;
  onSummaryLoaded?: (summary: DiagnosticSummaryResponse) => void;
}

interface PreUploadValidation {
  fileName: string;
  fileSizeKB: string;
  fileType: 'xlsx' | 'xls' | 'csv';
  isValid: boolean;
  totalRowsDetected: number;
  validPreviewRows: number;
  duplicateRolls: string[];
  missingColumns: string[];
  rowWarnings: string[];
}

type ActiveInputTab = 'bulk' | 'individual';
type RosterFilter = 'all' | 'slow_only' | 'critical_attendance';
type SortField = 'roll_number' | 'student_name' | 'aggregate_percentage' | 'attendance_percentage' | 'risk_score';

const REQUIRED_BULK_COLS = [
  'roll_number',
  'student_name',
  'mid1_marks',
  'mid2_marks',
  'internal_quiz_score',
  'assignment_score',
  'attendance_percentage',
];

export default function SlowLearnerDiagnosticPanel({
  courses,
  activeCourseId,
  onCourseChange,
  showToast,
  onSummaryLoaded,
}: Props) {
  const [summary, setSummary] = useState<DiagnosticSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveInputTab>('bulk');
  const [showQuizGenerator, setShowQuizGenerator] = useState(false);

  // Bulk Upload State
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preValidation, setPreValidation] = useState<PreUploadValidation | null>(null);
  const [uploadingBulk, setUploadingBulk] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [bulkResult, setBulkResult] = useState<BulkUploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Individual Student Entry State
  const [submittingEval, setSubmittingEval] = useState(false);
  const [individualErrors, setIndividualErrors] = useState<string[]>([]);
  const [form, setForm] = useState<DiagnosticStudentInput>({
    course_id: activeCourseId,
    roll_number: 'CS24-115',
    student_name: '',
    mid1_marks: 11.0,
    mid2_marks: 9.0,
    internal_quiz_score: 4.0,
    assignment_score: 4.5,
    attendance_percentage: 66.0,
    lab_score: 8.5,
    participation_index: 2.0,
    marks: 37.0,
    class_performance: 2.0,
    cgpa: 5.2,
    urban_rural: 'Urban',
    analytical_thinking: 2.0,
    knowledge_level: 2.2,
    problem_solving_skills: 1.8,
    decision_making: 2.0,
    errors: 1.9,
    auto_assign_remedial: true,
  });

  // Targeted Remedial Quiz Generator State
  const [assigningRemedial, setAssigningRemedial] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [quizForm, setQuizForm] = useState({
    topic_key: 'Pointers, Array Indexing & Loop Bounds',
    syllabus_unit: 'Unit II — Core Data Structures & Memory',
    difficulty: 'medium',
    key_notes:
      'Focus on off-by-one loop boundaries, base-case termination in recursion, and pointer dereferencing rules.',
  });

  // Interactive Data Grid State (Search, Filter, Sort, Pagination)
  const [selectedStudent, setSelectedStudent] = useState<DiagnosticStudentRecord | null>(null);
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('risk_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const loadSummary = (courseId: string) => {
    if (!courseId) return;
    setLoading(true);
    assessmentsApi
      .getDiagnosticSummary(courseId)
      .then(res => {
        setSummary(res);
        if (onSummaryLoaded) {
          onSummaryLoaded(res);
        }
        if (res.students.length > 0 && !selectedStudent) {
          const dev = res.students.find(s => s.tier === 'Developing') || res.students[0];
          setSelectedStudent(dev);
        }
      })
      .catch(() => {
        showToast('Failed to load diagnostic summary');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (activeCourseId) {
      setForm(prev => ({ ...prev, course_id: activeCourseId }));
      loadSummary(activeCourseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourseId]);

  // Live computed aggregate percentage for Individual Student Form
  const liveIndividualAggregate = useMemo(() => {
    const m1 = Number(form.mid1_marks ?? 0);
    const m2 = Number(form.mid2_marks ?? 0);
    const qz = Number(form.internal_quiz_score ?? 0);
    const asg = Number(form.assignment_score ?? 0);
    const lab = Number(form.lab_score ?? 0);
    return Math.min(100, Math.max(0, Number((m1 + m2 + qz + asg + lab).toFixed(1))));
  }, [form.mid1_marks, form.mid2_marks, form.internal_quiz_score, form.assignment_score, form.lab_score]);

  // Pre-validate CSV or Excel file on selection
  const runClientPreValidation = async (file: File) => {
    const lower = file.name.toLowerCase();
    const sizeKB = (file.size / 1024).toFixed(1);

    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setPreValidation({
        fileName: file.name,
        fileSizeKB: sizeKB,
        fileType: 'csv',
        isValid: false,
        totalRowsDetected: 0,
        validPreviewRows: 0,
        duplicateRolls: [],
        missingColumns: ['Unsupported file extension — upload .xlsx, .xls, or .csv'],
        rowWarnings: [],
      });
      return;
    }

    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      // Binary Excel workbook — server parses via Pandas/OpenXML engine
      setPreValidation({
        fileName: file.name,
        fileSizeKB: sizeKB,
        fileType: lower.endsWith('.xlsx') ? 'xlsx' : 'xls',
        isValid: true,
        totalRowsDetected: -1,
        validPreviewRows: -1,
        duplicateRolls: [],
        missingColumns: [],
        rowWarnings: [],
      });
      return;
    }

    // Client-side deep pre-validation for CSV files
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setPreValidation({
        fileName: file.name,
        fileSizeKB: sizeKB,
        fileType: 'csv',
        isValid: false,
        totalRowsDetected: 0,
        validPreviewRows: 0,
        duplicateRolls: [],
        missingColumns: ['File contains no data rows'],
        rowWarnings: [],
      });
      return;
    }

    const headers = lines[0]
      .split(',')
      .map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    const missing = REQUIRED_BULK_COLS.filter(req => !headers.includes(req));

    const rollIdx = headers.indexOf('roll_number');
    const nameIdx = headers.indexOf('student_name');
    const m1Idx = headers.indexOf('mid1_marks');
    const m2Idx = headers.indexOf('mid2_marks');
    const attIdx = headers.indexOf('attendance_percentage');

    const seenRolls = new Set<string>();
    const duplicates: string[] = [];
    const warnings: string[] = [];
    let validCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const roll = rollIdx >= 0 ? cols[rollIdx] : '';
      const name = nameIdx >= 0 ? cols[nameIdx] : '';
      if (!roll && !name) continue;

      if (roll) {
        const key = roll.toUpperCase();
        if (seenRolls.has(key)) {
          duplicates.push(`Row ${i + 1}: Duplicate roll_number (${roll})`);
          continue;
        }
        seenRolls.add(key);
      } else {
        warnings.push(`Row ${i + 1}: Missing roll_number`);
        continue;
      }

      const m1 = m1Idx >= 0 ? parseFloat(cols[m1Idx]) : 0;
      const m2 = m2Idx >= 0 ? parseFloat(cols[m2Idx]) : 0;
      const att = attIdx >= 0 ? parseFloat(cols[attIdx]) : 0;

      if (isNaN(m1) || m1 < 0 || m1 > 30) {
        warnings.push(`Row ${i + 1} (${roll}): mid1_marks (${cols[m1Idx]}) out of range 0–30`);
        continue;
      }
      if (isNaN(m2) || m2 < 0 || m2 > 30) {
        warnings.push(`Row ${i + 1} (${roll}): mid2_marks (${cols[m2Idx]}) out of range 0–30`);
        continue;
      }
      if (isNaN(att) || att < 0 || att > 100) {
        warnings.push(`Row ${i + 1} (${roll}): attendance_percentage (${cols[attIdx]}) out of range 0–100`);
        continue;
      }
      validCount++;
    }

    setPreValidation({
      fileName: file.name,
      fileSizeKB: sizeKB,
      fileType: 'csv',
      isValid: missing.length === 0 && validCount > 0,
      totalRowsDetected: lines.length - 1,
      validPreviewRows: validCount,
      duplicateRolls: duplicates,
      missingColumns: missing,
      rowWarnings: warnings,
    });
  };

  const handleFileChosen = (file: File | undefined | null) => {
    if (!file) return;
    setSelectedFile(file);
    setBulkResult(null);
    setUploadProgress(0);
    runClientPreValidation(file);
  };

  const handleBulkUploadExecute = async (fileToUpload?: File) => {
    const targetFile = fileToUpload || selectedFile;
    if (!targetFile) {
      showToast('Please select or drop an Excel (.xlsx) or CSV file first');
      return;
    }
    if (preValidation && !preValidation.isValid && !fileToUpload) {
      showToast('Please fix missing required columns before uploading');
      return;
    }

    setUploadingBulk(true);
    setUploadProgress(18);
    const timer1 = setTimeout(() => setUploadProgress(52), 180);
    const timer2 = setTimeout(() => setUploadProgress(84), 420);

    try {
      const res = await studentsApi.bulkUpload(targetFile, activeCourseId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      setUploadProgress(100);
      setBulkResult(res);
      showToast(
        `${res.successful} students imported (${res.slow_learners_count} Slow Learners tagged for remedial quiz${
          res.skipped > 0 ? `, ${res.skipped} skipped` : ''
        })`
      );
      loadSummary(activeCourseId);
    } catch (err: unknown) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setUploadProgress(0);
      const msg = err instanceof Error ? err.message : 'Bulk upload failed';
      showToast(msg);
    } finally {
      setUploadingBulk(false);
    }
  };

  // Generate & immediately upload a realistic 65-student classroom dataset (with 2 intentional invalid rows to demonstrate row-level validation!)
  const handleSimulateLargeClassroomBatch = async () => {
    const firstNames = [
      'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
      'Diya', 'Ananya', 'Aadhya', 'Pari', 'Saanvi', 'Myra', 'Ira', 'Navya', 'Riya', 'Kavya',
      'Rohan', 'Karthik', 'Vikram', 'Pranav', 'Darshan', 'Nikhil', 'Siddharth', 'Harsh', 'Yash', 'Varun',
      'Sneha', 'Meera', 'Pooja', 'Shruti', 'Neha', 'Tanvi', 'Bhavya', 'divya', 'Nandini', 'Swati',
    ];
    const lastNames = [
      'Sharma', 'Patel', 'Verma', 'Kulkarni', 'Nair', 'Iyer', 'Deshmukh', 'Joshi', 'Rao', 'Reddy',
      'Gupta', 'Mehta', 'Chatterjee', 'pillai', 'Menon', 'Bhat', 'Hegde', 'Shetty', 'Agarwal', 'Mishra',
    ];

    const header = REQUIRED_BULK_COLS.concat(['lab_score', 'participation_index']).join(',');
    const rows: string[] = [header];

    for (let i = 1; i <= 64; i++) {
      const roll = `CS24-${String(100 + i)}`;
      const fn = firstNames[(i * 3) % firstNames.length];
      const ln = lastNames[(i * 7) % lastNames.length];
      const name = `${fn.charAt(0).toUpperCase() + fn.slice(1)} ${ln.charAt(0).toUpperCase() + ln.slice(1)}`;

      // Distribute across Slow Learners (~30%), Moderate Learners (~45%), Advanced Learners (~25%)
      if (i % 3 === 0) {
        // Slow Learner: low aggregate or <75% attendance with declining mid2 < mid1
        const m1 = (10 + (i % 6)).toFixed(1);
        const m2 = (7 + (i % 5)).toFixed(1); // Declining mid2
        const qz = (3 + (i % 3)).toFixed(1);
        const asg = (3.5 + (i % 3)).toFixed(1);
        const att = (58 + (i % 15)).toFixed(1); // < 75%
        const lab = (7 + (i % 4)).toFixed(1);
        const part = (1.5 + (i % 10) * 0.1).toFixed(1);
        rows.push(`${roll},${name},${m1},${m2},${qz},${asg},${att},${lab},${part}`);
      } else if (i % 4 === 0) {
        // Advanced Learner
        const m1 = (25 + (i % 5)).toFixed(1);
        const m2 = (26 + (i % 4)).toFixed(1);
        const qz = (8.5 + (i % 2)).toFixed(1);
        const asg = (9.0).toFixed(1);
        const att = (88 + (i % 11)).toFixed(1);
        const lab = (17.5 + (i % 3)).toFixed(1);
        const part = (4.5 + (i % 5) * 0.1).toFixed(1);
        rows.push(`${roll},${name},${m1},${m2},${qz},${asg},${att},${lab},${part}`);
      } else {
        // Moderate Learner
        const m1 = (17 + (i % 6)).toFixed(1);
        const m2 = (18 + (i % 6)).toFixed(1);
        const qz = (6.0 + (i % 3)).toFixed(1);
        const asg = (6.5 + (i % 3)).toFixed(1);
        const att = (76 + (i % 14)).toFixed(1);
        const lab = (13.0 + (i % 4)).toFixed(1);
        const part = (3.2 + (i % 8) * 0.1).toFixed(1);
        rows.push(`${roll},${name},${m1},${m2},${qz},${asg},${att},${lab},${part}`);
      }
    }

    // Add 2 malformed rows to demonstrate enterprise validation & skip reporting
    rows.push('CS24-998,Invalid Marks Student,42.0,15.0,5.0,5.0,80.0,10.0,3.0'); // mid1 > 30
    rows.push('CS24-101,Duplicate Roll Student,20.0,20.0,7.0,7.0,85.0,14.0,3.5'); // duplicate CS24-101

    const csvContent = rows.join('\n');
    const simulatedFile = new File([csvContent], 'CS24_SectionA_66_Students_Batch.csv', {
      type: 'text/csv',
    });
    handleFileChosen(simulatedFile);
    await handleBulkUploadExecute(simulatedFile);
  };

  const loadArchetype = (archetype: 'developing' | 'proficient' | 'advanced') => {
    setIndividualErrors([]);
    if (archetype === 'developing') {
      setForm(prev => ({
        ...prev,
        roll_number: 'CS24-141',
        student_name: prev.student_name || 'Rahul Verma',
        mid1_marks: 11.5,
        mid2_marks: 8.0,
        internal_quiz_score: 3.5,
        assignment_score: 4.0,
        attendance_percentage: 63.5,
        lab_score: 8.0,
        participation_index: 1.8,
        marks: 35.0,
        class_performance: 1.8,
        cgpa: 5.1,
        urban_rural: 'Rural',
        analytical_thinking: 1.9,
        knowledge_level: 2.1,
        problem_solving_skills: 1.6,
        decision_making: 1.9,
        errors: 1.7,
      }));
    } else if (archetype === 'proficient') {
      setForm(prev => ({
        ...prev,
        roll_number: 'CS24-142',
        student_name: prev.student_name || 'Deepak Mehta',
        mid1_marks: 20.0,
        mid2_marks: 21.0,
        internal_quiz_score: 7.0,
        assignment_score: 7.5,
        attendance_percentage: 82.0,
        lab_score: 14.0,
        participation_index: 3.4,
        marks: 69.5,
        class_performance: 3.4,
        cgpa: 7.3,
        urban_rural: 'Urban',
        analytical_thinking: 3.5,
        knowledge_level: 3.6,
        problem_solving_skills: 3.3,
        decision_making: 3.4,
        errors: 3.5,
      }));
    } else {
      setForm(prev => ({
        ...prev,
        roll_number: 'CS24-143',
        student_name: prev.student_name || 'Aditi Rao',
        mid1_marks: 28.0,
        mid2_marks: 29.0,
        internal_quiz_score: 9.5,
        assignment_score: 9.5,
        attendance_percentage: 95.0,
        lab_score: 18.5,
        participation_index: 4.9,
        marks: 94.5,
        class_performance: 4.9,
        cgpa: 9.4,
        urban_rural: 'Urban',
        analytical_thinking: 4.8,
        knowledge_level: 4.9,
        problem_solving_skills: 4.7,
        decision_making: 4.8,
        errors: 4.8,
      }));
    }
  };

  const handleEvaluate = async () => {
    const errs: string[] = [];
    if (!form.roll_number?.trim()) errs.push('Roll Number is required.');
    if (!form.student_name.trim() || form.student_name.trim().length < 2) {
      errs.push('Student Full Name is required (min 2 chars).');
    }
    if ((form.mid1_marks ?? 0) < 0 || (form.mid1_marks ?? 0) > 30) {
      errs.push('Mid-1 Marks must be between 0 and 30.');
    }
    if ((form.mid2_marks ?? 0) < 0 || (form.mid2_marks ?? 0) > 30) {
      errs.push('Mid-2 Marks must be between 0 and 30.');
    }
    if ((form.internal_quiz_score ?? 0) < 0 || (form.internal_quiz_score ?? 0) > 10) {
      errs.push('Internal Quiz Score must be between 0 and 10.');
    }
    if ((form.assignment_score ?? 0) < 0 || (form.assignment_score ?? 0) > 10) {
      errs.push('Assignment Score must be between 0 and 10.');
    }
    if ((form.attendance_percentage ?? 0) < 0 || (form.attendance_percentage ?? 0) > 100) {
      errs.push('Attendance Percentage must be between 0% and 100%.');
    }
    if ((form.lab_score ?? 0) < 0 || (form.lab_score ?? 0) > 20) {
      errs.push('Lab Score must be between 0 and 20.');
    }

    if (errs.length > 0) {
      setIndividualErrors(errs);
      return;
    }

    setIndividualErrors([]);
    setSubmittingEval(true);
    try {
      const res = await assessmentsApi.evaluateDiagnostic({
        ...form,
        marks: liveIndividualAggregate,
        class_performance: form.participation_index ?? form.class_performance,
        course_id: activeCourseId,
      });
      showToast(
        `Classified ${form.student_name} (${form.roll_number}) as ${res.tier} (Score: ${res.learner_score})${
          res.is_slow_learner ? ' — Targeted 20-Q Remedial Quiz assigned!' : ''
        }`
      );
      setForm(prev => ({
        ...prev,
        roll_number: `CS24-${Math.floor(150 + Math.random() * 800)}`,
        student_name: '',
      }));
      loadSummary(activeCourseId);
    } catch {
      showToast('Failed to evaluate student parameters');
    } finally {
      setSubmittingEval(false);
    }
  };

  const handleAssignRemedialCohort = async () => {
    if (!activeCourseId) return;
    setAssigningRemedial(true);
    try {
      const res = await assessmentsApi.assignRemedial(activeCourseId);
      showToast(res.message);
      loadSummary(activeCourseId);
    } catch {
      showToast('Failed to assign remedial quizzes');
    } finally {
      setAssigningRemedial(false);
    }
  };

  const handleGenerateTopicQuiz = async () => {
    if (!activeCourseId) return;
    if (!quizForm.topic_key.trim()) {
      showToast('Please enter a topic key or concept focus');
      return;
    }
    setGeneratingQuiz(true);
    try {
      const res = await assessmentsApi.generateTopicQuiz({
        course_id: activeCourseId,
        topic_key: quizForm.topic_key.trim(),
        syllabus_unit: quizForm.syllabus_unit.trim(),
        difficulty: quizForm.difficulty,
        key_notes: quizForm.key_notes.trim(),
      });
      showToast(res.message);
      setShowQuizGenerator(false);
      loadSummary(activeCourseId);
    } catch {
      showToast('Failed to generate targeted remedial quiz');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // Filtered & Sorted Student Roster
  const filteredStudents = useMemo(() => {
    if (!summary) return [];
    const q = searchQuery.trim().toLowerCase();

    const list = summary.students.filter(s => {
      const att = s.attendance_percentage ?? 80;
      if (rosterFilter === 'slow_only' && s.tier !== 'Developing') return false;
      if (rosterFilter === 'critical_attendance' && att >= 75) return false;

      if (q) {
        const rollMatch = (s.roll_number || '').toLowerCase().includes(q);
        const nameMatch = s.student_name.toLowerCase().includes(q);
        const emailMatch = s.email.toLowerCase().includes(q);
        return rollMatch || nameMatch || emailMatch;
      }
      return true;
    });

    list.sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';
      if (sortField === 'roll_number') {
        valA = a.roll_number || '';
        valB = b.roll_number || '';
      } else if (sortField === 'student_name') {
        valA = a.student_name.toLowerCase();
        valB = b.student_name.toLowerCase();
      } else if (sortField === 'aggregate_percentage') {
        valA = a.aggregate_percentage ?? a.marks;
        valB = b.aggregate_percentage ?? b.marks;
      } else if (sortField === 'attendance_percentage') {
        valA = a.attendance_percentage ?? 80;
        valB = b.attendance_percentage ?? 80;
      } else {
        valA = a.risk_score ?? 100 - a.learner_score;
        valB = b.risk_score ?? 100 - b.learner_score;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [summary, rosterFilter, searchQuery, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(prev => !prev);
    } else {
      setSortField(field);
      setSortAsc(field === 'roll_number' || field === 'student_name');
    }
    setCurrentPage(1);
  };

  // Export Remedial Batch Report (CSV / Excel-compatible & Printable PDF view)
  const handleExportRemedialReport = (format: 'csv' | 'pdf') => {
    if (!summary || filteredStudents.length === 0) {
      showToast('No student records available to export');
      return;
    }

    if (format === 'csv') {
      const headers = [
        'Roll Number',
        'Student Name',
        'Mid-1 (30)',
        'Mid-2 (30)',
        'Quiz (10)',
        'Assignment (10)',
        'Lab (20)',
        'Aggregate (%)',
        'Attendance (%)',
        'Participation (1-5)',
        'Risk Score',
        'Classification Category',
        'Remedial Quiz Status',
      ];
      const csvRows = [headers.join(',')];
      filteredStudents.forEach(s => {
        const cat =
          s.category ||
          (s.tier === 'Developing'
            ? 'Slow Learner (Remedial Required)'
            : s.tier === 'Advanced'
            ? 'Advanced Learner'
            : 'Moderate Learner');
        const remStatus =
          s.tier === 'Developing'
            ? s.remedial_completed
              ? `Completed (${s.remedial_score?.toFixed(0)}%)`
              : s.remedial_assigned
              ? '20-Q Remedial Assigned'
              : 'Pending Assignment'
            : 'Standard Track';
        csvRows.push(
          [
            `"${s.roll_number || 'N/A'}"`,
            `"${s.student_name}"`,
            (s.mid1_marks ?? s.marks * 0.3).toFixed(1),
            (s.mid2_marks ?? s.marks * 0.3).toFixed(1),
            (s.internal_quiz_score ?? s.marks * 0.1).toFixed(1),
            (s.assignment_score ?? s.marks * 0.1).toFixed(1),
            (s.lab_score ?? s.marks * 0.2).toFixed(1),
            (s.aggregate_percentage ?? s.marks).toFixed(1),
            (s.attendance_percentage ?? 80).toFixed(1),
            (s.participation_index ?? s.class_performance).toFixed(1),
            (s.risk_score ?? 100 - s.learner_score).toFixed(1),
            `"${cat}"`,
            `"${remStatus}"`,
          ].join(',')
        );
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EdCap_Remedial_Batch_Report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${filteredStudents.length} student records to Excel/CSV report`);
    } else {
      window.print();
    }
  };

  // SVG Radar Chart calculations
  const renderRadarChart = () => {
    if (!summary) return null;
    const metrics = [
      { key: 'Academic Marks', label: 'Marks' },
      { key: 'Problem Solving', label: 'Problem Solving' },
      { key: 'Analytical Thinking', label: 'Analytical' },
      { key: 'Error Control', label: 'Error Control' },
      { key: 'Concept Knowledge', label: 'Concepts' },
      { key: 'Class Engagement', label: 'Engagement' },
    ];
    const total = metrics.length;
    const cx = 150;
    const cy = 135;
    const radius = 95;

    const getCoord = (index: number, val: number) => {
      const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
      const r = (val / 100) * radius;
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    };

    const avgPoints = metrics
      .map((m, idx) => {
        const val = summary.radar_averages[m.key] || 50;
        const pt = getCoord(idx, val);
        return `${pt.x},${pt.y}`;
      })
      .join(' ');

    const stuPoints = selectedStudent
      ? metrics
          .map((m, idx) => {
            const val = selectedStudent.radar_data?.[m.key] ?? 50;
            const pt = getCoord(idx, val);
            return `${pt.x},${pt.y}`;
          })
          .join(' ')
      : null;

    const benchPoints = metrics
      .map((_, idx) => {
        const pt = getCoord(idx, 70);
        return `${pt.x},${pt.y}`;
      })
      .join(' ');

    return (
      <svg viewBox="0 0 300 280" className="w-full" style={{ maxHeight: 270 }}>
        {[25, 50, 75, 100].map(level => {
          const pts = metrics
            .map((_, idx) => {
              const pt = getCoord(idx, level);
              return `${pt.x},${pt.y}`;
            })
            .join(' ');
          return (
            <polygon
              key={level}
              points={pts}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="1"
              strokeDasharray={level === 100 ? undefined : '2,2'}
            />
          );
        })}

        {metrics.map((m, idx) => {
          const pt = getCoord(idx, 100);
          const labelPt = getCoord(idx, 118);
          return (
            <g key={m.key}>
              <line
                x1={cx}
                y1={cy}
                x2={pt.x}
                y2={pt.y}
                stroke="var(--border-subtle)"
                strokeWidth="1"
              />
              <text
                x={labelPt.x}
                y={labelPt.y}
                fontSize="10"
                fontWeight="500"
                fill="var(--text-secondary)"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        <polygon
          points={benchPoints}
          fill="rgba(99, 102, 241, 0.05)"
          stroke="rgba(99, 102, 241, 0.35)"
          strokeWidth="1.5"
          strokeDasharray="4,4"
        />

        <polygon
          points={avgPoints}
          fill="rgba(56, 189, 248, 0.15)"
          stroke="#38bdf8"
          strokeWidth="2"
        />

        {stuPoints && (
          <polygon
            points={stuPoints}
            fill={
              selectedStudent?.tier === 'Developing'
                ? 'rgba(244, 63, 94, 0.22)'
                : 'rgba(16, 185, 129, 0.22)'
            }
            stroke={selectedStudent?.tier === 'Developing' ? '#f43f5e' : '#10b981'}
            strokeWidth="2.5"
          />
        )}
      </svg>
    );
  };

  // SVG Correlation Scatter Graph
  const renderScatterChart = () => {
    if (!summary || summary.correlation_scatter.length === 0) return null;
    const width = 360;
    const height = 210;
    const padL = 40;
    const padB = 30;
    const padT = 15;
    const padR = 15;

    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const toX = (marks: number) => padL + (Math.max(0, Math.min(100, marks)) / 100) * plotW;
    const toY = (score: number) => padT + (1 - Math.max(0, Math.min(100, score)) / 100) * plotH;

    const developingCutoffY = toY(55);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 220 }}>
        {[20, 40, 60, 80, 100].map(val => (
          <g key={val}>
            <line
              x1={padL}
              y1={toY(val)}
              x2={width - padR}
              y2={toY(val)}
              stroke="var(--border-subtle)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x={padL - 6}
              y={toY(val)}
              fontSize="9"
              fill="var(--text-tertiary)"
              textAnchor="end"
              dominantBaseline="central"
            >
              {val}
            </text>
          </g>
        ))}

        {[20, 40, 60, 80, 100].map(val => (
          <g key={val}>
            <line
              x1={toX(val)}
              y1={padT}
              x2={toX(val)}
              y2={height - padB}
              stroke="var(--border-subtle)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x={toX(val)}
              y={height - padB + 12}
              fontSize="9"
              fill="var(--text-tertiary)"
              textAnchor="middle"
            >
              {val}%
            </text>
          </g>
        ))}

        <line
          x1={padL}
          y1={developingCutoffY}
          x2={width - padR}
          y2={developingCutoffY}
          stroke="#f43f5e"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
        <text
          x={width - padR - 5}
          y={developingCutoffY - 5}
          fontSize="8.5"
          fill="#f43f5e"
          textAnchor="end"
          fontWeight="600"
        >
          Slow Learner Cut-off (Score &lt; 55)
        </text>

        <text
          x={padL + plotW / 2}
          y={height - 5}
          fontSize="10"
          fill="var(--text-secondary)"
          textAnchor="middle"
          fontWeight="500"
        >
          Aggregate Marks (%)
        </text>

        {summary.correlation_scatter.map((pt, i) => {
          const cx = toX(pt.marks);
          const cy = toY(pt.score);
          const isSelected = selectedStudent?.student_name === pt.name;
          const color =
            pt.tier === 'Developing' ? '#f43f5e' : pt.tier === 'Proficient' ? '#38bdf8' : '#10b981';

          return (
            <g
              key={i}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                const found = summary.students.find(s => s.student_name === pt.name);
                if (found) setSelectedStudent(found);
              }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 6.5 : 4.5}
                fill={color}
                stroke={isSelected ? '#ffffff' : 'none'}
                strokeWidth={isSelected ? 2 : 0}
                opacity={0.85}
              />
            </g>
          );
        })}
      </svg>
    );
  };

  const criticalAttendanceCount = useMemo(() => {
    if (!summary) return 0;
    return summary.students.filter(s => (s.attendance_percentage ?? 80) < 75).length;
  }, [summary]);

  return (
    <div>
      {/* Course Selector & Mode Switcher Bar */}
      <div className="card card-padding mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <IconTile name="analytics" size="md" tone="indigo" />
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Classroom Assessment Ingestion &amp; Slow-Learner Detection Engine
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                High-volume Bulk Excel/CSV Pipeline &amp; Individual Entry with Scikit-Learn Classification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              id="diagnostic-course-select"
              className="form-input"
              value={activeCourseId}
              onChange={e => onCourseChange(e.target.value)}
              style={{ minWidth: 210, fontSize: 13, padding: '7px 12px' }}
              aria-label="Select course"
            >
              {courses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowQuizGenerator(v => !v)}
            >
              <Icon name="sparkles" size={14} />
              <span>Generate 20-Q Remedial Quiz</span>
            </button>
          </div>
        </div>

        {/* Primary Toggle/Tab Navigation: Tab A (Bulk Excel/CSV Upload) vs Tab B (Individual Student Entry) */}
        <div
          role="tablist"
          aria-label="Student Data Ingestion Mode"
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 18,
            paddingTop: 16,
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bulk'}
            className={`btn btn-sm ${activeTab === 'bulk' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('bulk')}
          >
            <Icon name="upload" size={14} />
            <span>Tab A: Bulk Excel / CSV Upload (60–100+ Students)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'individual'}
            className={`btn btn-sm ${activeTab === 'individual' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('individual')}
          >
            <Icon name="edit" size={14} />
            <span>Tab B: Individual Student Entry (Quick Add / Edit)</span>
          </button>
        </div>
      </div>

      {/* Targeted Remedial Quiz Generator Drawer */}
      {showQuizGenerator && summary && (
        <div
          className="card card-padding mb-6"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--brand-500)' }}
        >
          <div className="section-header">
            <div>
              <div className="section-title">
                <Icon name="sparkles" size={16} /> Generate Targeted 20-Question Remedial Quiz
              </div>
              <div className="section-subtitle">
                Configure topic keys, syllabus unit, difficulty target, and faculty answer key notes to assign a 20-question remedial test to all detected Slow Learners
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Topic Presets:</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setQuizForm({
                    topic_key: 'Pointers, Array Indexing & Loop Bounds',
                    syllabus_unit: 'Unit II — Core Data Structures & Memory',
                    difficulty: 'medium',
                    key_notes:
                      'Focus on off-by-one loop boundaries, array index validation, and pointer dereferencing rules.',
                  })
                }
              >
                Pointers &amp; Loops
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setQuizForm({
                    topic_key: 'Recursion, Base Cases & Call Stack Frames',
                    syllabus_unit: 'Unit III — Algorithmic Problem Solving',
                    difficulty: 'medium',
                    key_notes:
                      'Emphasize base-case termination conditions, stack overflow prevention, and recursive state tracing.',
                  })
                }
              >
                Recursion &amp; Stack
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setQuizForm({
                    topic_key: 'Sorting Complexity, Hashing & Search Trees',
                    syllabus_unit: 'Unit IV — Complexity & Search Structures',
                    difficulty: 'hard',
                    key_notes:
                      'Compare O(n log n) divide-and-conquer recurrences, hash collision resolution, and BST invariants.',
                  })
                }
              >
                Complexity &amp; Trees
              </button>
            </div>
          </div>

          <div className="grid-3 gap-4" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="quiz-topic-key">
                Target Topic Key / Concept Focus
              </label>
              <input
                id="quiz-topic-key"
                className="form-input"
                placeholder="e.g. Pointers & Dynamic Memory"
                value={quizForm.topic_key}
                onChange={e => setQuizForm(v => ({ ...v, topic_key: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="quiz-syllabus-unit">
                Syllabus Unit
              </label>
              <input
                id="quiz-syllabus-unit"
                className="form-input"
                placeholder="e.g. Unit II — Data Structures"
                value={quizForm.syllabus_unit}
                onChange={e => setQuizForm(v => ({ ...v, syllabus_unit: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="quiz-difficulty">
                Difficulty Target
              </label>
              <select
                id="quiz-difficulty"
                className="form-input"
                value={quizForm.difficulty}
                onChange={e => setQuizForm(v => ({ ...v, difficulty: e.target.value }))}
              >
                <option value="easy">Easy — Foundational Concept Checks</option>
                <option value="medium">Medium — Guided Code Tracing &amp; Debugging</option>
                <option value="hard">Hard — Intensive Edge-Case &amp; Complexity Analysis</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label" htmlFor="quiz-key-notes">
              Faculty Answer Key Notes &amp; Remediation Guidelines
            </label>
            <textarea
              id="quiz-key-notes"
              className="form-input"
              rows={2}
              placeholder="Enter key answer notes, common misconceptions to test, or rubric points..."
              value={quizForm.key_notes}
              onChange={e => setQuizForm(v => ({ ...v, key_notes: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateTopicQuiz}
              disabled={generatingQuiz || !quizForm.topic_key.trim()}
            >
              <Icon name="sparkles" size={15} />
              <span>
                {generatingQuiz
                  ? 'Generating 20-Question Quiz…'
                  : `Generate & Assign 20-Question Quiz (${summary.tier_distribution.developing.count} Slow Learners)`}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowQuizGenerator(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB A: BULK EXCEL / CSV UPLOAD & PRE-VALIDATION PIPELINE              */}
      {/* ===================================================================== */}
      {activeTab === 'bulk' && (
        <div className="card card-padding mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                Enterprise Bulk Classroom Upload (.xlsx, .xls, .csv)
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Standardized schema: <code>roll_number</code>, <code>student_name</code>, <code>mid1_marks</code> (/30), <code>mid2_marks</code> (/30), <code>internal_quiz_score</code> (/10), <code>assignment_score</code> (/10), <code>attendance_percentage</code> (%), <code>lab_score</code> (/20), <code>participation_index</code> (1–5)
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={studentsApi.templateUrl('xlsx')}
                download="EdCap_Student_Bulk_Template.xlsx"
                className="btn btn-secondary btn-sm"
              >
                <Icon name="download" size={14} />
                <span>Download Sample Excel Template (.xlsx)</span>
              </a>
              <a
                href={studentsApi.templateUrl('csv')}
                download="EdCap_Student_Bulk_Template.csv"
                className="btn btn-secondary btn-sm"
              >
                <Icon name="file" size={14} />
                <span>Sample CSV</span>
              </a>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSimulateLargeClassroomBatch}
                disabled={uploadingBulk}
              >
                <Icon name="zap" size={14} />
                <span>Demo 65-Student Classroom Batch</span>
              </button>
            </div>
          </div>

          {/* Interactive Drag & Drop Zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop Excel or CSV file here or click to browse"
            onDragOver={e => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={e => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              handleFileChosen(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            style={{
              border: `2px dashed ${isDragging ? '#6366f1' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '28px 20px',
              textAlign: 'center',
              background: isDragging ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface-elevated)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => handleFileChosen(e.target.files?.[0])}
            />
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <IconTile name="upload" size="md" tone="indigo" />
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              {selectedFile
                ? `Selected File: ${selectedFile.name}`
                : 'Drag & drop your classroom Excel (.xlsx, .xls) or CSV (.csv) file here'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
              Supports 60–500+ students per section · Automatic row sanitization, duplicate Roll Number detection &amp; Scikit-Learn classification
            </div>
          </div>

          {/* Pre-Upload Validation Summary Card */}
          {preValidation && (
            <div
              className="subcard mt-4"
              style={{
                padding: 16,
                borderLeft: `4px solid ${preValidation.isValid ? '#10b981' : '#f43f5e'}`,
              }}
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${preValidation.isValid ? 'badge-teal' : 'badge-rose'}`}>
                      <Icon name={preValidation.isValid ? 'checkCircle' : 'alert'} size={12} />
                      <span>
                        {preValidation.isValid ? 'Pre-Upload Validation Passed' : 'Validation Issues Detected'}
                      </span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {preValidation.fileName} ({preValidation.fileSizeKB} KB)
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
                    {preValidation.fileType === 'csv' ? (
                      <>
                        Detected <strong>{preValidation.totalRowsDetected}</strong> total rows ·{' '}
                        <strong style={{ color: '#10b981' }}>{preValidation.validPreviewRows}</strong> valid rows ready for ingestion
                        {preValidation.duplicateRolls.length > 0 && (
                          <span style={{ color: '#f59e0b', marginLeft: 8 }}>
                            · {preValidation.duplicateRolls.length} duplicate roll numbers will be skipped
                          </span>
                        )}
                        {preValidation.rowWarnings.length > 0 && (
                          <span style={{ color: '#f43f5e', marginLeft: 8 }}>
                            · {preValidation.rowWarnings.length} malformed rows flagged
                          </span>
                        )}
                      </>
                    ) : (
                      <span>
                        Excel workbook ready — server-side OpenXML/Pandas validator will inspect all rows and flag any out-of-range marks automatically.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!preValidation.isValid || uploadingBulk}
                    onClick={() => handleBulkUploadExecute()}
                  >
                    <Icon name="checkCircle" size={14} />
                    <span>
                      {uploadingBulk ? 'Processing Batch…' : 'Upload & Run ML Classification'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreValidation(null);
                      setBulkResult(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {preValidation.missingColumns.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#f43f5e' }}>
                  <strong>Missing Required Columns:</strong> {preValidation.missingColumns.join(', ')}
                </div>
              )}

              {(preValidation.duplicateRolls.length > 0 || preValidation.rowWarnings.length > 0) && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {[...preValidation.duplicateRolls, ...preValidation.rowWarnings].slice(0, 4).map((w, idx) => (
                    <div key={idx}>• {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live Upload Progress Bar */}
          {(uploadingBulk || uploadProgress > 0) && (
            <div style={{ marginTop: 16 }}>
              <div className="flex items-center justify-between" style={{ fontSize: 12, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {uploadingBulk
                    ? 'Parsing spreadsheet, validating marks, and executing Scikit-Learn batch classification…'
                    : 'Batch Ingestion & Classification Complete'}
                </span>
                <span className="font-mono" style={{ fontWeight: 700 }}>
                  {uploadProgress}%
                </span>
              </div>
              <div className="progress-bar" style={{ height: 8 }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${uploadProgress}%`,
                    background: uploadProgress === 100 ? '#10b981' : '#6366f1',
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Detailed Batch Ingestion Status Banner */}
          {bulkResult && (
            <div
              className="subcard mt-4"
              style={{
                padding: 16,
                borderLeft: '4px solid #6366f1',
                background: 'rgba(99, 102, 241, 0.06)',
              }}
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {bulkResult.successful} of {bulkResult.total_processed} students imported successfully
                    {bulkResult.skipped > 0
                      ? `, ${bulkResult.skipped} skipped due to invalid marks or duplicate roll numbers`
                      : ' (Zero validation errors)'}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Batch Classification Breakdown:{' '}
                    <strong style={{ color: '#f43f5e' }}>
                      {bulkResult.slow_learners_count} Slow Learners (Remedial Assigned)
                    </strong>{' '}
                    ·{' '}
                    <strong style={{ color: '#38bdf8' }}>
                      {bulkResult.moderate_learners_count} Moderate Learners
                    </strong>{' '}
                    ·{' '}
                    <strong style={{ color: '#10b981' }}>
                      {bulkResult.advanced_learners_count} Advanced Learners
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRosterFilter('slow_only')}
                >
                  <Icon name="flag" size={13} />
                  <span>Filter Slow Learners ({bulkResult.slow_learners_count})</span>
                </button>
              </div>

              {bulkResult.skipped_rows.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>
                    Skipped Rows Log ({bulkResult.skipped_rows.length} rows excluded without halting batch):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    {bulkResult.skipped_rows.slice(0, 5).map((sr, i) => (
                      <div key={i} style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-mono" style={{ fontWeight: 700 }}>
                          Row {sr.row_number} ({sr.roll_number} — {sr.student_name}):
                        </span>{' '}
                        {sr.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB B: INDIVIDUAL STUDENT ENTRY MODAL / FORM                          */}
      {/* ===================================================================== */}
      {activeTab === 'individual' && (
        <div className="card card-padding mb-6" style={{ background: 'var(--surface-elevated)' }}>
          <div className="section-header">
            <div>
              <div className="section-title">
                <Icon name="edit" size={16} /> Individual Student Assessment Entry
              </div>
              <div className="section-subtitle">
                Enter standardized classroom marks, attendance, and engagement parameters for instant classification
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Quick Presets:</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadArchetype('developing')}
              >
                Slow Learner Sample
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadArchetype('proficient')}
              >
                Moderate Learner
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadArchetype('advanced')}
              >
                Advanced Learner
              </button>
            </div>
          </div>

          {individualErrors.length > 0 && (
            <div className="callout callout-danger mb-4" role="alert">
              <Icon name="alert" size={16} />
              <div>
                {individualErrors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            </div>
          )}

          <div className="grid-3 gap-4" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="param-roll">
                Roll Number (Unique ID)
              </label>
              <input
                id="param-roll"
                className="form-input font-mono"
                placeholder="e.g. CS24-101"
                value={form.roll_number || ''}
                onChange={e => setForm(v => ({ ...v, roll_number: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="param-name">
                Student Full Name
              </label>
              <input
                id="param-name"
                className="form-input"
                placeholder="e.g. Aarav Sharma"
                value={form.student_name}
                onChange={e => setForm(v => ({ ...v, student_name: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="param-attendance">
                Attendance Percentage (0 – 100%)
              </label>
              <input
                id="param-attendance"
                type="number"
                step="0.5"
                min="0"
                max="100"
                className="form-input"
                value={form.attendance_percentage ?? 80}
                onChange={e =>
                  setForm(v => ({ ...v, attendance_percentage: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="param-mid1">
                Mid-Term 1 Marks (Out of 30)
              </label>
              <input
                id="param-mid1"
                type="number"
                step="0.5"
                min="0"
                max="30"
                className="form-input"
                value={form.mid1_marks ?? 15}
                onChange={e => setForm(v => ({ ...v, mid1_marks: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="param-mid2">
                Mid-Term 2 Marks (Out of 30)
              </label>
              <input
                id="param-mid2"
                type="number"
                step="0.5"
                min="0"
                max="30"
                className="form-input"
                value={form.mid2_marks ?? 15}
                onChange={e => setForm(v => ({ ...v, mid2_marks: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="param-quiz">
                Internal Quiz Score (Out of 10)
              </label>
              <input
                id="param-quiz"
                type="number"
                step="0.5"
                min="0"
                max="10"
                className="form-input"
                value={form.internal_quiz_score ?? 5}
                onChange={e =>
                  setForm(v => ({ ...v, internal_quiz_score: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="param-assign">
                Assignment Score (Out of 10)
              </label>
              <input
                id="param-assign"
                type="number"
                step="0.5"
                min="0"
                max="10"
                className="form-input"
                value={form.assignment_score ?? 5}
                onChange={e =>
                  setForm(v => ({ ...v, assignment_score: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="param-lab">
                Lab Score (Out of 20)
              </label>
              <input
                id="param-lab"
                type="number"
                step="0.5"
                min="0"
                max="20"
                className="form-input"
                value={form.lab_score ?? 10}
                onChange={e => setForm(v => ({ ...v, lab_score: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="param-part">
                Participation Index (Scale 1.0 – 5.0)
              </label>
              <input
                id="param-part"
                type="number"
                step="0.1"
                min="1"
                max="5"
                className="form-input"
                value={form.participation_index ?? 3.0}
                onChange={e =>
                  setForm(v => ({
                    ...v,
                    participation_index: parseFloat(e.target.value) || 1,
                    class_performance: parseFloat(e.target.value) || 1,
                  }))
                }
              />
            </div>
          </div>

          <div
            className="subcard mt-4 flex items-center justify-between flex-wrap gap-3"
            style={{ padding: '12px 16px' }}
          >
            <div style={{ fontSize: 13 }}>
              Computed Aggregate Percentage:{' '}
              <strong className="font-mono" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
                {liveIndividualAggregate}%
              </strong>{' '}
              · Attendance:{' '}
              <strong
                className="font-mono"
                style={{
                  color: (form.attendance_percentage ?? 80) < 75 ? '#f43f5e' : '#10b981',
                }}
              >
                {form.attendance_percentage ?? 80}%
              </strong>{' '}
              · Mid-Term Trend:{' '}
              <strong>
                {(form.mid2_marks ?? 0) < (form.mid1_marks ?? 0)
                  ? `Declining (${((form.mid2_marks ?? 0) - (form.mid1_marks ?? 0)).toFixed(1)} pts)`
                  : `Improving (+${((form.mid2_marks ?? 0) - (form.mid1_marks ?? 0)).toFixed(1)} pts)`}
              </strong>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleEvaluate}
                disabled={submittingEval}
              >
                <Icon name="checkCircle" size={15} />
                <span>{submittingEval ? 'Classifying…' : 'Save & Classify Student'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-center">
          <div className="spinner" role="status" aria-label="Loading diagnostic intelligence" />
        </div>
      ) : summary ? (
        <>
          {/* Summary Metric Cards (Slow Learner / Developing, Moderate / Proficient, Advanced) */}
          <div className="grid-3 mb-6">
            <div className="card card-padding" style={{ borderLeft: '4px solid var(--rose-500, #f43f5e)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="badge badge-rose" style={{ fontSize: 11, fontWeight: 700 }}>
                  Slow Learner (Remedial Required)
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {summary.tier_distribution.developing.percentage}% of cohort
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>
                {summary.tier_distribution.developing.count} Students
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 12 }}>
                Tier: <strong>Developing</strong> · Aggregate &lt;45% or attendance &lt;75% with declining mid-term trend.
              </p>
              <button
                className="btn btn-secondary btn-sm w-full"
                onClick={handleAssignRemedialCohort}
                disabled={assigningRemedial || summary.tier_distribution.developing.count === 0}
                style={{ fontSize: 12 }}
              >
                <Icon name="checkCircle" size={13} />
                <span>
                  {assigningRemedial ? 'Assigning…' : 'Assign 20-Q Remedial Quiz to Batch'}
                </span>
              </button>
            </div>

            <div className="card card-padding" style={{ borderLeft: '4px solid var(--blue-500, #38bdf8)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="badge badge-blue" style={{ fontSize: 11, fontWeight: 700 }}>
                  Moderate Learner (Proficient)
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {summary.tier_distribution.proficient.percentage}% of cohort
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>
                {summary.tier_distribution.proficient.count} Students
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Tier: <strong>Proficient</strong> · Solid conceptual baseline. Standard continuous assessments recommended.
              </p>
            </div>

            <div className="card card-padding" style={{ borderLeft: '4px solid var(--emerald-500, #10b981)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="badge badge-teal" style={{ fontSize: 11, fontWeight: 700 }}>
                  Advanced Learner (Fast)
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {summary.tier_distribution.advanced.percentage}% of cohort
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>
                {summary.tier_distribution.advanced.count} Students
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Tier: <strong>Advanced</strong> · High aggregate mastery (≥75%) and strong classroom participation.
              </p>
            </div>
          </div>

          {/* Interactive Visual Graphs */}
          <div className="grid-2 mb-6">
            <div className="card card-padding">
              <div className="section-header">
                <div>
                  <div className="section-title">
                    <Icon name="radar" size={16} /> Multi-Axis Competency Radar
                  </div>
                  <div className="section-subtitle">
                    {selectedStudent ? (
                      <span>
                        Inspecting:{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {selectedStudent.roll_number ? `${selectedStudent.roll_number} — ` : ''}
                          {selectedStudent.student_name}
                        </strong>{' '}
                        ({selectedStudent.category || selectedStudent.tier})
                      </span>
                    ) : (
                      'Class-wide vs Benchmark distribution'
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#38bdf8' }} /> Class Avg
                  </span>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f43f5e' }} /> Student
                  </span>
                </div>
              </div>

              <div className="flex justify-center items-center py-2">{renderRadarChart()}</div>

              {selectedStudent && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Identified Deficit Dimensions for {selectedStudent.student_name}:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedStudent.weak_dimensions.length === 0 ? (
                      <span className="badge badge-teal">No critical deficits detected</span>
                    ) : (
                      selectedStudent.weak_dimensions.map((d, i) => (
                        <span key={i} className="badge badge-rose" style={{ fontSize: 11 }}>
                          {d}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="card card-padding">
              <div className="section-header">
                <div>
                  <div className="section-title">
                    <Icon name="trendingDown" size={16} /> Aggregate Marks vs. Competency Distribution
                  </div>
                  <div className="section-subtitle">Click any student point to inspect their radar profile</div>
                </div>
                <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f43f5e' }} /> Slow
                  </span>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#38bdf8' }} /> Moderate
                  </span>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981' }} /> Advanced
                  </span>
                </div>
              </div>

              <div className="flex justify-center items-center py-2">{renderScatterChart()}</div>

              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 12,
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                <strong>Classification Rule:</strong> Students with Aggregate &lt;45%, or Attendance &lt;75% paired with declining Mid-2 vs. Mid-1 marks, are automatically flagged for remedial intervention.
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* TOPIC-LEVEL WEAKNESS HEATMAP & BEFORE-VS-AFTER REMEDIAL TRACKING  */}
          {/* ================================================================= */}
          <div className="grid-2 mb-6">
            {/* Topic-Level Conceptual Weakness Heatmap */}
            <div className="card card-padding">
              <div className="section-header">
                <div>
                  <div className="section-title">
                    <Icon name="layers" size={16} /> Topic-Level Conceptual Weakness Heatmap
                  </div>
                  <div className="section-subtitle">
                    Pinpoints syllabus units where students exhibit specific conceptual deficits
                  </div>
                </div>
                <span className="badge badge-indigo" style={{ fontSize: 11 }}>
                  5 Syllabus Units
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {(summary.topic_weakness_breakdown || []).map((t, idx) => {
                  const sevLower = (t.severity || '').toLowerCase();
                  const barColor =
                    sevLower === 'critical'
                      ? '#f43f5e'
                      : sevLower === 'moderate'
                      ? '#f59e0b'
                      : '#10b981';
                  const affectedPct = summary.total_evaluated
                    ? Math.round((t.affected_students / summary.total_evaluated) * 100)
                    : 0;
                  return (
                    <div
                      key={idx}
                      className="subcard"
                      style={{
                        padding: '10px 14px',
                        borderLeft: `3px solid ${barColor}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {t.topic}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {t.unit} · Severity: {t.severity}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span
                            className={`badge ${
                              sevLower === 'critical'
                                ? 'badge-rose'
                                : sevLower === 'moderate'
                                ? 'badge-amber'
                                : 'badge-teal'
                            }`}
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {t.affected_students} Students Weak ({affectedPct}%)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="progress-bar" style={{ flex: 1, height: 7 }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${t.avg_mastery_pct}%`,
                              background: barColor,
                            }}
                          />
                        </div>
                        <span className="font-mono" style={{ fontSize: 11.5, fontWeight: 700, minWidth: 78, textAlign: 'right' }}>
                          {t.avg_mastery_pct}% Mastery
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Before-vs-After Remedial Progress Tracker */}
            <div className="card card-padding">
              <div className="section-header">
                <div>
                  <div className="section-title">
                    <Icon name="trendingUp" size={16} /> Before-vs-After Remedial Progress Tracking
                  </div>
                  <div className="section-subtitle">
                    Pre-remedial baseline score vs. post-remedial micro-test reassessment
                  </div>
                </div>
                <span className="badge badge-teal" style={{ fontSize: 11, fontWeight: 700 }}>
                  {(() => {
                    const completedList = (summary.remedial_progress_tracking || []).filter(
                      r => r.improvement_delta !== null
                    );
                    const avgDelta =
                      completedList.length > 0
                        ? (
                            completedList.reduce((acc, r) => acc + (r.improvement_delta ?? 0), 0) /
                            completedList.length
                          ).toFixed(1)
                        : '0.0';
                    return `Avg Gain: +${avgDelta}%`;
                  })()}
                </span>
              </div>

              <div className="grid-3 gap-3 my-3">
                <div className="subcard" style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Assigned</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {(summary.remedial_progress_tracking || []).length}
                  </div>
                </div>
                <div className="subcard" style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Completed</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>
                    {(summary.remedial_progress_tracking || []).filter(r => r.is_completed).length}
                  </div>
                </div>
                <div className="subcard" style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Post-Test Avg</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>
                    {(() => {
                      const comp = (summary.remedial_progress_tracking || []).filter(
                        r => r.after_remedial_pct !== null
                      );
                      return comp.length > 0
                        ? `${(
                            comp.reduce((acc, r) => acc + (r.after_remedial_pct ?? 0), 0) /
                            comp.length
                          ).toFixed(1)}%`
                        : '—';
                    })()}
                  </div>
                </div>
              </div>

              <div className="table-wrapper" style={{ maxHeight: 270, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Pre-Test</th>
                      <th>Post-Test</th>
                      <th>Improvement</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.remedial_progress_tracking || []).slice(0, 10).map((rp, i) => (
                      <tr key={i}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 12.5 }}>{rp.student_name}</div>
                          <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                            {rp.roll_number} · {rp.weak_topic}
                          </div>
                        </td>
                        <td className="font-mono" style={{ fontSize: 12, color: '#f43f5e', fontWeight: 700 }}>
                          {rp.before_score_pct.toFixed(1)}%
                        </td>
                        <td className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>
                          {rp.after_remedial_pct !== null ? (
                            <span style={{ color: '#10b981' }}>{rp.after_remedial_pct.toFixed(1)}%</span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>Pending</span>
                          )}
                        </td>
                        <td className="font-mono" style={{ fontSize: 12 }}>
                          {rp.improvement_delta !== null ? (
                            <span className="badge badge-teal" style={{ fontSize: 11, fontWeight: 700 }}>
                              +{rp.improvement_delta.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="badge badge-gray" style={{ fontSize: 10.5 }}>
                              In Progress
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              rp.status.includes('Mastery') || rp.is_completed
                                ? 'badge-teal'
                                : 'badge-amber'
                            }`}
                            style={{ fontSize: 10.5 }}
                          >
                            {rp.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* INTERACTIVE RESULTS & ANALYSIS DATA GRID                          */}
          {/* ================================================================= */}
          <div className="card">
            <div className="card-padding" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                    Interactive Classroom Results &amp; Remedial Analysis Grid ({filteredStudents.length} of{' '}
                    {summary.students.length} Students)
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                    Click column headers to sort · Filter by Slow Learners or Critical Attendance (&lt;75%) · Export Remedial Batch Report
                  </p>
                </div>

                {/* Export Remedial Batch Report Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleExportRemedialReport('csv')}
                  >
                    <Icon name="download" size={14} />
                    <span>Export Remedial Batch Report (Excel/CSV)</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleExportRemedialReport('pdf')}
                  >
                    <Icon name="file" size={14} />
                    <span>Export PDF / Print</span>
                  </button>
                </div>
              </div>

              {/* Filter Pills & Search Input */}
              <div
                className="flex items-center justify-between flex-wrap gap-3"
                style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Quick student filters">
                  <button
                    type="button"
                    className={`btn btn-sm ${rosterFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setRosterFilter('all');
                      setCurrentPage(1);
                    }}
                  >
                    <span>Show All ({summary.students.length})</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${rosterFilter === 'slow_only' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setRosterFilter('slow_only');
                      setCurrentPage(1);
                    }}
                  >
                    <Icon name="flag" size={13} />
                    <span>Slow Learners Only ({summary.tier_distribution.developing.count})</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      rosterFilter === 'critical_attendance' ? 'btn-primary' : 'btn-secondary'
                    }`}
                    onClick={() => {
                      setRosterFilter('critical_attendance');
                      setCurrentPage(1);
                    }}
                  >
                    <Icon name="alert" size={13} />
                    <span>Critical Attendance &lt;75% ({criticalAttendanceCount})</span>
                  </button>
                </div>

                <div className="flex items-center gap-2" style={{ minWidth: 260 }}>
                  <input
                    type="search"
                    className="form-input"
                    placeholder="Search roll no or student name…"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    style={{ fontSize: 12.5, padding: '6px 12px' }}
                    aria-label="Search students by roll number or name"
                  />
                </div>
              </div>
            </div>

            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleSort('roll_number')}
                      title="Sort by Roll Number"
                    >
                      Roll No {sortField === 'roll_number' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleSort('student_name')}
                      title="Sort by Student Name"
                    >
                      Student Name {sortField === 'student_name' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th>Mid 1 / Mid 2</th>
                    <th>Quiz / Assign / Lab</th>
                    <th
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleSort('aggregate_percentage')}
                      title="Sort by Aggregate Percentage"
                    >
                      Aggregate % {sortField === 'aggregate_percentage' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleSort('attendance_percentage')}
                      title="Sort by Attendance Percentage"
                    >
                      Attendance {sortField === 'attendance_percentage' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th>Engagement</th>
                    <th
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleSort('risk_score')}
                      title="Sort by Risk Score"
                    >
                      Risk Score {sortField === 'risk_score' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th>Category Badge</th>
                    <th>Remedial Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map(s => {
                    const isSelected = selectedStudent?.id === s.id;
                    const mid1 = s.mid1_marks ?? Number((s.marks * 0.3).toFixed(1));
                    const mid2 = s.mid2_marks ?? Number((s.marks * 0.3).toFixed(1));
                    const quiz = s.internal_quiz_score ?? Number((s.marks * 0.1).toFixed(1));
                    const assign = s.assignment_score ?? Number((s.marks * 0.1).toFixed(1));
                    const lab = s.lab_score ?? Number((s.marks * 0.2).toFixed(1));
                    const agg = s.aggregate_percentage ?? s.marks;
                    const att = s.attendance_percentage ?? 80;
                    const part = s.participation_index ?? s.class_performance;
                    const risk = s.risk_score ?? Number((100 - s.learner_score).toFixed(1));
                    const midDeclining = mid2 < mid1;

                    return (
                      <tr
                        key={s.id}
                        style={{
                          background: isSelected ? 'var(--surface-hover)' : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedStudent(s)}
                      >
                        <td className="font-mono" style={{ fontWeight: 700, fontSize: 12.5 }}>
                          {s.roll_number || 'CS24-101'}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {s.student_name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.email}</div>
                        </td>
                        <td className="font-mono" style={{ fontSize: 12 }}>
                          <span>{mid1.toFixed(1)}</span> /{' '}
                          <span style={{ color: midDeclining ? '#f43f5e' : 'var(--text-primary)', fontWeight: midDeclining ? 700 : 400 }}>
                            {mid2.toFixed(1)}
                          </span>
                          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', display: 'block' }}>
                            out of 30 · {midDeclining ? 'Declining' : 'Steady'}
                          </span>
                        </td>
                        <td className="font-mono" style={{ fontSize: 12 }}>
                          {quiz.toFixed(1)} / {assign.toFixed(1)} / {lab.toFixed(1)}
                          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', display: 'block' }}>
                            (/10 · /10 · /20)
                          </span>
                        </td>
                        <td>
                          <strong
                            className="font-mono"
                            style={{
                              fontSize: 13,
                              color: agg < 45 ? '#f43f5e' : agg >= 75 ? '#10b981' : 'var(--text-primary)',
                            }}
                          >
                            {agg.toFixed(1)}%
                          </strong>
                        </td>
                        <td>
                          <span
                            className={`badge ${att < 75 ? 'badge-rose' : 'badge-teal'}`}
                            style={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {att.toFixed(1)}%
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-gray" style={{ fontSize: 11 }}>
                            {part.toFixed(1)} / 5.0
                          </span>
                        </td>
                        <td>
                          <strong
                            className="font-mono"
                            style={{
                              fontSize: 12.5,
                              color: risk >= 45 ? '#f43f5e' : risk >= 25 ? '#f59e0b' : '#10b981',
                            }}
                          >
                            {risk.toFixed(1)}
                          </strong>
                        </td>
                        <td>
                          {s.tier === 'Developing' ? (
                            <span className="badge badge-rose" style={{ fontWeight: 700 }}>
                              Slow Learner (Remedial Required)
                            </span>
                          ) : s.tier === 'Proficient' ? (
                            <span className="badge badge-blue" style={{ fontWeight: 600 }}>
                              Moderate Learner
                            </span>
                          ) : (
                            <span className="badge badge-teal" style={{ fontWeight: 600 }}>
                              Advanced Learner
                            </span>
                          )}
                        </td>
                        <td>
                          {s.tier === 'Developing' ? (
                            s.remedial_completed ? (
                              <span className="badge badge-teal" style={{ fontSize: 11 }}>
                                <Icon name="checkCircle" size={11} /> Mastery ({s.remedial_score?.toFixed(0)}%)
                              </span>
                            ) : s.remedial_assigned ? (
                              <span className="badge badge-rose" style={{ fontSize: 11 }}>
                                <Icon name="clock" size={11} /> 20-Q Quiz Assigned
                              </span>
                            ) : (
                              <span className="badge badge-gray" style={{ fontSize: 11 }}>
                                Unassigned
                              </span>
                            )
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Standard Track</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div
              className="card-padding flex items-center justify-between flex-wrap gap-3"
              style={{ borderTop: '1px solid var(--border-subtle)', padding: '12px 20px' }}
            >
              <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <span>
                  Showing {filteredStudents.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filteredStudents.length)} of {filteredStudents.length} students
                </span>
                <span>·</span>
                <label htmlFor="roster-page-size" style={{ fontSize: 12 }}>
                  Rows per page:
                </label>
                <select
                  id="roster-page-size"
                  className="form-input"
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{ width: 72, padding: '3px 8px', fontSize: 12 }}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ fontSize: 12.5, fontWeight: 600, padding: '0 8px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
