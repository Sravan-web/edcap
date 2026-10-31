# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — __init__ registrar
# All models must be imported here so that Base.metadata is fully populated
# before Alembic or create_tables() runs.
# ==============================================================================
from app.models.user import User, Session, OneTimeToken, MFARecoveryCode  # noqa: F401
from app.models.course import Course, Enrollment, CourseFaculty, SyllabusTopic  # noqa: F401
from app.models.assessment import Assessment, AssessmentScore  # noqa: F401
from app.models.module import LessonModule  # noqa: F401
from app.models.quiz import QuizSet, QuizQuestion, QuizAttempt, QuizAnswer  # noqa: F401
from app.models.telemetry import TelemetryEvent, StudentFeatures  # noqa: F401
from app.models.flag import SupportFlag, Playbook, RemedialQueueItem, EngagementStats  # noqa: F401
from app.models.audit import AuditLog, Setting  # noqa: F401
