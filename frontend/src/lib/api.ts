// ============================================================
// EdCap — API Client
// Centralised fetch wrapper for the FastAPI backend
// ============================================================
const API_BASE = '/api/v1';

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    });
    const str = qs.toString();
    if (str) url += '?' + str;
  }

  const savedEmail = typeof window !== 'undefined' ? window.localStorage.getItem('edcap_user_email') : null;
  const extraHeaders: Record<string, string> = savedEmail ? { 'X-EdCap-Email': savedEmail } : {};

  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...extraHeaders, ...(fetchOptions.headers as Record<string, string> | undefined) },
    ...fetchOptions,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw { status: res.status, message: err.detail || 'Request failed' };
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string, captcha_token?: string) =>
    request<{ message: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, captcha_token }),
    }),

  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),

  signup: (data: { email: string; password: string; first_name: string; last_name: string }) =>
    request<{ message: string }>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),

  verifyEmail: (token: string) =>
    request<{ message: string }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),

  passwordResetRequest: (email: string) =>
    request<{ message: string }>('/auth/password-reset/request', {
      method: 'POST', body: JSON.stringify({ email }),
    }),

  passwordResetConfirm: (token: string, new_password: string) =>
    request<{ message: string }>('/auth/password-reset/confirm', {
      method: 'POST', body: JSON.stringify({ token, new_password }),
    }),

  mfaSetup: () => request<{ provisioning_uri: string; recovery_codes: string[] }>('/auth/mfa/setup', { method: 'POST' }),
  mfaVerify: (otp: string) => request<{ message: string }>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ otp }) }),
};

// ── Users ─────────────────────────────────────────────────────
export const usersApi = {
  me: () => request<UserProfile>('/users/me'),
  updateMe: (data: Partial<UserProfile>) =>
    request<UserProfile>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  sessions: () => request<Session[]>('/users/me/sessions'),
  revokeAllSessions: () => request<{ message: string }>('/users/me/sessions', { method: 'DELETE' }),
};

// ── Courses ───────────────────────────────────────────────────
export const coursesApi = {
  list: () => request<Course[]>('/courses'),
  get: (id: string) => request<Course>(`/courses/${id}`),
  create: (data: { code: string; name: string; description?: string }) =>
    request<Course>('/courses', { method: 'POST', body: JSON.stringify(data) }),
  students: (id: string) => request<UserProfile[]>(`/courses/${id}/students`),
};

// ── Analytics ──────────────────────────────────────────────────
export const analyticsApi = {
  class: (course_id?: string) =>
    request<{ courses: CourseAnalytics[] }>('/analytics/class', { params: { course_id } }),
  course: (id: string) => request<CourseDetailAnalytics>(`/analytics/course/${id}`),
};

// ── Flags ──────────────────────────────────────────────────────
export const flagsApi = {
  list: (params?: { course_id?: string; status?: string; track?: string }) =>
    request<SupportFlag[]>('/flags', { params }),
  update: (id: string, data: { status?: string; override_track?: string; override_note?: string }) =>
    request<SupportFlag>(`/flags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Assessments ────────────────────────────────────────────────
export interface DiagnosticStudentInput {
  course_id: string;
  student_id?: string;
  roll_number?: string;
  student_name: string;
  mid1_marks?: number;
  mid2_marks?: number;
  internal_quiz_score?: number;
  assignment_score?: number;
  attendance_percentage?: number;
  lab_score?: number;
  participation_index?: number;
  marks: number;
  class_performance: number;
  cgpa: number;
  urban_rural: 'Urban' | 'Rural';
  analytical_thinking: number;
  knowledge_level: number;
  problem_solving_skills: number;
  decision_making: number;
  errors: number;
  auto_assign_remedial?: boolean;
}

export interface DiagnosticStudentRecord {
  id: string;
  student_id: string;
  roll_number?: string;
  student_name: string;
  email: string;
  mid1_marks?: number;
  mid2_marks?: number;
  internal_quiz_score?: number;
  assignment_score?: number;
  attendance_percentage?: number;
  lab_score?: number;
  participation_index?: number;
  aggregate_percentage?: number;
  risk_score?: number;
  category?: 'Slow Learner' | 'Moderate Learner' | 'Advanced Learner' | string;
  marks: number;
  class_performance: number;
  cgpa: number;
  urban_rural: string;
  analytical_thinking: number;
  knowledge_level: number;
  problem_solving_skills: number;
  decision_making: number;
  errors: number;
  tier: 'Developing' | 'Proficient' | 'Advanced';
  learner_score: number;
  is_slow_learner: boolean;
  confidence: number;
  weak_dimensions: string[];
  model_votes: Record<string, string>;
  radar_data: Record<string, number>;
  remedial_assigned: boolean;
  remedial_quiz_id?: string | null;
  remedial_completed: boolean;
  remedial_score?: number | null;
}

export interface BulkUploadSkippedRow {
  row_number: number;
  roll_number: string;
  student_name: string;
  reason: string;
}

export interface BulkUploadResponse {
  status: string;
  course_id: string;
  total_processed: number;
  successful: number;
  skipped: number;
  slow_learners_count: number;
  moderate_learners_count: number;
  advanced_learners_count: number;
  skipped_rows: BulkUploadSkippedRow[];
  students: Array<{
    id: string;
    student_id: string;
    roll_number: string;
    student_name: string;
    email: string;
    mid1_marks: number;
    mid2_marks: number;
    internal_quiz_score: number;
    assignment_score: number;
    attendance_percentage: number;
    lab_score: number;
    participation_index: number;
    aggregate_percentage: number;
    risk_score: number;
    category: string;
    tier: string;
    learner_score: number;
    is_slow_learner: boolean;
    remedial_assigned: boolean;
    remedial_quiz_id?: string | null;
  }>;
}

export interface DiagnosticSummaryResponse {
  course_id: string;
  total_evaluated: number;
  tier_distribution: {
    developing: { label: string; sublabel: string; count: number; percentage: number };
    proficient: { label: string; sublabel: string; count: number; percentage: number };
    advanced: { label: string; sublabel: string; count: number; percentage: number };
  };
  radar_averages: Record<string, number>;
  averages: {
    marks: number;
    cgpa: number;
    analytical_thinking: number;
    knowledge_level: number;
    problem_solving_skills: number;
    decision_making: number;
    errors: number;
  };
  topic_weakness_breakdown?: Array<{
    topic: string;
    unit: string;
    affected_students: number;
    avg_mastery_pct: number;
    severity: 'Critical' | 'Moderate' | 'Healthy' | string;
  }>;
  remedial_progress_tracking?: Array<{
    student_id: string;
    roll_number: string;
    student_name: string;
    weak_topic: string;
    before_score_pct: number;
    after_remedial_pct: number | null;
    improvement_delta: number | null;
    is_completed: boolean;
    status: string;
  }>;
  correlation_scatter: Array<{
    name: string;
    marks: number;
    cgpa: number;
    score: number;
    tier: string;
    problem_solving: number;
    errors: number;
  }>;
  students: DiagnosticStudentRecord[];
}

export interface AssignedRemedialResponse {
  has_remedial: boolean;
  is_completed: boolean;
  score_pct?: number | null;
  quiz?: {
    id: string;
    course_id: string;
    title: string;
    scheduled_date: string;
    questions: Array<{
      id: string;
      stem: string;
      question_text: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
      correct_option: string;
      explanation: string;
      difficulty: string;
      source_section: string;
    }>;
  } | null;
  diagnostic?: {
    tier: 'Developing' | 'Proficient' | 'Advanced' | string;
    learner_score: number;
    marks: number;
    cgpa: number;
    class_performance?: number;
    analytical_thinking?: number;
    knowledge_level?: number;
    problem_solving_skills?: number;
    decision_making?: number;
    errors?: number;
    weak_dimensions: string[];
    radar_data?: Record<string, number>;
    model_votes?: Record<string, string>;
  } | null;
}

export const assessmentsApi = {
  list: (course_id?: string) => request<Assessment[]>('/assessments', { params: { course_id } }),
  create: (data: { course_id: string; assessment_date: string; topic_tag: string; title: string }) =>
    request<Assessment>('/assessments', { method: 'POST', body: JSON.stringify(data) }),
  getDiagnosticSummary: (course_id: string) =>
    request<DiagnosticSummaryResponse>('/assessments/diagnostic/summary', { params: { course_id } }),
  evaluateDiagnostic: (data: DiagnosticStudentInput) =>
    request<{
      status: string;
      student_id: string;
      student_name: string;
      tier: 'Developing' | 'Proficient' | 'Advanced';
      learner_score: number;
      is_slow_learner: boolean;
      confidence: number;
      remedial_assigned: boolean;
      remedial_quiz_id?: string | null;
    }>('/assessments/diagnostic/evaluate', { method: 'POST', body: JSON.stringify(data) }),
  assignRemedial: (course_id: string) =>
    request<{ status: string; assigned_count: number; message: string }>(
      `/assessments/diagnostic/assign-remedial?course_id=${course_id}`,
      { method: 'POST' }
    ),
  generateTopicQuiz: (data: {
    course_id: string;
    topic_key: string;
    syllabus_unit?: string;
    difficulty?: string;
    key_notes?: string;
  }) =>
    request<{
      status: string;
      quiz_id: string;
      topic_key: string;
      syllabus_unit: string;
      difficulty: string;
      question_count: number;
      assigned_count: number;
      message: string;
    }>('/assessments/diagnostic/generate-quiz', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ── Modules ────────────────────────────────────────────────────
export const modulesApi = {
  list: (course_id?: string) => request<LessonModule[]>('/modules', { params: { course_id } }),
  createJson: (data: { course_id: string; title: string; content: string; taught_on?: string }) =>
    request<LessonModule>('/modules/json', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Quizzes ────────────────────────────────────────────────────
export const quizzesApi = {
  today: (course_id?: string) =>
    request<QuizSet>('/quizzes/today', { params: { course_id } }),
  getAssignedRemedial: () =>
    request<AssignedRemedialResponse>('/quizzes/assigned-remedial'),
  get: (id: string) => request<QuizSet>(`/quizzes/${id}`),
  generate: (data: { course_id: string; module_id: string }) =>
    request<QuizSet>('/quizzes/generate', { method: 'POST', body: JSON.stringify(data) }),
  approve: (id: string) =>
    request<QuizSet>(`/quizzes/${id}/approve`, { method: 'POST' }),
};

// ── Attempts ───────────────────────────────────────────────────
export const attemptsApi = {
  start: (quiz_set_id: string) =>
    request<QuizAttempt>('/attempts', { method: 'POST', body: JSON.stringify({ quiz_set_id }) }),
  complete: (id: string) =>
    request<QuizAttempt>(`/attempts/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'complete' }) }),
  submitAnswer: (attempt_id: string, data: { question_id: string; chosen_option: string }) =>
    request('/attempts/answers', { method: 'POST', body: JSON.stringify({ attempt_id, ...data }) }),
};

// ── Students ───────────────────────────────────────────────────
export const studentsApi = {
  profile: (id: string) => request<StudentProfile>(`/students/${id}/profile`),
  flags: (id: string, status?: string) =>
    request<SupportFlag[]>(`/students/${id}/flags`, { params: { status_filter: status } }),
  assessmentHistory: (id: string, course_id: string) =>
    request<AssessmentHistory[]>(`/students/${id}/assessment-history`, { params: { course_id } }),
  templateUrl: (format: 'xlsx' | 'csv' = 'xlsx') => `/api/v1/students/template?format=${format}`,
  bulkUpload: async (file: File, courseId?: string): Promise<BulkUploadResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    if (courseId) fd.append('form_course_id', courseId);

    const savedEmail = typeof window !== 'undefined' ? window.localStorage.getItem('edcap_user_email') : null;
    const extraHeaders: Record<string, string> = savedEmail ? { 'X-EdCap-Email': savedEmail } : {};
    const query = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';

    const res = await fetch(`/api/v1/students/bulk-upload${query}`, {
      method: 'POST',
      credentials: 'include',
      headers: extraHeaders,
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Bulk file upload failed');
    }
    return res.json();
  },
};

// ── Playbooks ──────────────────────────────────────────────────
export const playbooksApi = {
  list: (flag_id?: string) => request<Playbook[]>('/playbooks', { params: { flag_id } }),
  create: (flag_id: string) =>
    request<Playbook>('/playbooks', { method: 'POST', body: JSON.stringify({ flag_id }) }),
};

// ── Remedial queue ─────────────────────────────────────────────
export const remedialApi = {
  list: () => request<RemedialItem[]>('/remedial-queue'),
  complete: (id: string) =>
    request<{ message: string }>(`/remedial-queue/${id}/complete`, { method: 'POST' }),
};

// ── Admin ──────────────────────────────────────────────────────
export const adminApi = {
  users: () => request<UserProfile[]>('/admin/users'),
  auditLogs: (params?: { limit?: number; offset?: number }) =>
    request<AuditLog[]>('/admin/audit-logs', { params }),
  settings: () => request<Setting[]>('/admin/settings'),
  updateSetting: (key: string, value: string) =>
    request<Setting>(`/admin/settings/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) }),
};

// ── Health ─────────────────────────────────────────────────────
export const healthApi = {
  check: () => request<{ status: string }>('/healthz'),
};

// ── Types ──────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'faculty' | 'student';
  status: string;
  mfa_enabled: boolean;
  created_at?: string;
}

export interface Session {
  id: string;
  created_at: string;
  last_active_at: string;
  device_hash: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface CourseAnalytics {
  course_id: string;
  student_count: number;
  open_support_flags: number;
  flag_by_track: Record<string, number>;
  last_assessment_avg_pct: number | null;
}

export interface CourseDetailAnalytics {
  course_id: string;
  total_students: number;
  student_profiles: StudentSummary[];
  topic_accuracy: TopicAccuracy[];
}

export interface StudentSummary {
  student_id: string;
  name: string;
  tier?: 'Developing' | 'Proficient' | 'Advanced' | string;
  learner_score?: number | null;
  marks?: number | null;
  cgpa?: number | null;
  remedial_assigned?: boolean;
  remedial_completed?: boolean;
  remedial_score?: number | null;
  recent_scores: { assessment_date: string; topic_tag: string; pct: number }[];
  open_flags: number;
  current_streak: number;
  retention_points: number;
}

export interface TopicAccuracy {
  topic_id: string;
  topic_name: string;
  tag: string;
  avg_accuracy_pct: number;
}

export interface SupportFlag {
  id: string;
  course_id: string;
  topic_id?: string;
  track: string;
  risk_score: number;
  reasons: string[];
  top_features?: Record<string, number>;
  status: string;
  override_track?: string;
  override_note?: string;
  created_at: string;
  updated_at: string;
}

export interface Assessment {
  id: string;
  course_id: string;
  title: string;
  assessment_date: string;
  topic_tag: string;
  source?: string;
}

export interface LessonModule {
  id: string;
  course_id: string;
  taught_on: string;
  original_filename: string;
  parse_status: string;
  file_type: string;
}

export interface QuizSet {
  id: string;
  course_id: string;
  date: string;
  status: 'draft' | 'approved' | 'live';
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  difficulty: string;
  explanation?: string;
}

export interface QuizAttempt {
  id: string;
  quiz_set_id: string;
  started_at: string;
  completed_at?: string;
  score?: number;
}

export interface StudentProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  enrolled_courses: string[];
  current_streak: number;
  retention_points: number;
  open_support_flags: number;
}

export interface AssessmentHistory {
  assessment_id: string;
  assessment_title: string;
  assessment_date: string;
  topic_tag: string;
  score: number;
  max_score: number;
  percentage: number;
}

export interface Playbook {
  id: string;
  flag_id: string;
  content: Record<string, unknown>;
  approved_by?: string;
  created_at: string;
}

export interface RemedialItem {
  id: string;
  topic_id: string;
  topic_name?: string;
  course_id: string;
  course_code?: string;
  next_review_at: string;
  interval_days: number;
  repetition_count: number;
  last_result?: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  target: string;
  ip_prefix: string;
  timestamp: string;
  outcome: string;
}

export interface Setting {
  key: string;
  value: string;
  updated_by?: string;
}
