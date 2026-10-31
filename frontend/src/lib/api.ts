// ============================================================
// EdCap AI — API Client
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

  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
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
export const assessmentsApi = {
  list: (course_id?: string) => request<Assessment[]>('/assessments', { params: { course_id } }),
  create: (data: { course_id: string; assessment_date: string; topic_tag: string; title: string }) =>
    request<Assessment>('/assessments', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Quizzes ────────────────────────────────────────────────────
export const quizzesApi = {
  today: (course_id?: string) =>
    request<QuizSet>('/quizzes/today', { params: { course_id } }),
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
  course_id: string;
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
