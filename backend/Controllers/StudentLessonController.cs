using backend.Data;
using backend.Models;
using backend.Models.DTOs;
using backend.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/student/lessons")]
    [Authorize(Roles = "Student")]
    public class StudentLessonController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly ICorrectionClient _correctionClient;

        public StudentLessonController(AppDbContext db, ICorrectionClient correctionClient)
        {
            _db = db;
            _correctionClient = correctionClient;
        }

        private int GetUserId()
            => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        private async Task<Student?> GetStudentAsync()
        {
            var userId = GetUserId();
            return await _db.Students.FirstOrDefaultAsync(s => s.UserId == userId);
        }

        // ---------------------------------------------------------
        // 1) List lessons assigned to the student's class
        // ---------------------------------------------------------
        [HttpGet]
        public async Task<IActionResult> GetMyLessons()
        {
            var student = await GetStudentAsync();
            if (student == null)
                return Unauthorized("Student profile not found.");

            if (student.ClassId == null)
                return Ok(new List<object>());

            var classId = student.ClassId.Value;

            var lessons = await _db.Lessons
                .Where(l =>
                    l.Status == LessonStatus.Published &&
                    l.Assignments.Any(a => a.ClassId == classId))
                .OrderByDescending(l => l.UpdatedAt)
                .Select(l => new
                {
                    l.Id,
                    l.Title,
                    Status = l.Status.ToString(),
                    l.DueDate,
                    l.UpdatedAt
                })
                .ToListAsync();

            var lessonIds = lessons.Select(l => l.Id).ToList();

            var attempts = await _db.LessonAttempts
                .Where(a => a.StudentId == student.Id && lessonIds.Contains(a.LessonId))
                .Include(a => a.Responses)
                    .ThenInclude(r => r.LessonQuestion)
                .Include(a => a.Responses)
                    .ThenInclude(r => r.FeedbackReview)
                .ToListAsync();

            var payload = lessons.Select(lesson =>
            {
                var perLesson = attempts.Where(a => a.LessonId == lesson.Id).ToList();
                var active = perLesson.FirstOrDefault(a => a.SubmittedAt == null);
                var hasSubmitted = perLesson.Any(a => a.SubmittedAt != null);
                var hasRetried = perLesson.Any(a => a.IsRetry && a.SubmittedAt != null);
                var submitted = perLesson
                    .Where(a => a.SubmittedAt != null)
                    .OrderBy(a => a.SubmittedAt)
                    .ToList();

                var latestSubmitted = submitted.LastOrDefault();
                var originalSubmitted = submitted.FirstOrDefault(a => !a.IsRetry) ?? submitted.FirstOrDefault();
                var retrySubmitted = submitted.FirstOrDefault(a => a.IsRetry);

                LessonAttemptSummaryDto? summary = null;
                if (latestSubmitted != null)
                    summary = BuildAttemptSummary(latestSubmitted);

                LessonAttemptSummaryDto? original = null;
                if (originalSubmitted != null)
                    original = BuildAttemptSummary(originalSubmitted);

                LessonAttemptSummaryDto? retry = null;
                if (retrySubmitted != null)
                    retry = BuildAttemptSummary(retrySubmitted);

                return new
                {
                    lesson.Id,
                    lesson.Title,
                    lesson.Status,
                    lesson.DueDate,
                    lesson.UpdatedAt,
                    ActiveAttempt = active != null ? new { AttemptId = active.Id, active.StartedAt } : null,
                    LatestAttempt = summary,
                    OriginalAttempt = original,
                    RetryAttempt = retry,
                    RetryAllowed = hasSubmitted && !hasRetried && active == null,
                    ScoreOutOf = 22
                };
            }).ToList();

            return Ok(payload);
        }

        // ---------------------------------------------------------
        // 2) Get a lesson (content for attempting)
        //    - Includes MCQ options BUT does not expose IsCorrect
        // ---------------------------------------------------------
        [HttpGet("{lessonId:int}")]
        public async Task<IActionResult> GetLesson(int lessonId)
        {
            var student = await GetStudentAsync();
            if (student == null)
                return Unauthorized("Student profile not found.");

            if (student.ClassId == null)
                return Unauthorized("Student is not assigned to a class.");

            var classId = student.ClassId.Value;

            var lesson = await _db.Lessons
                .Include(l => l.Questions)
                    .ThenInclude(q => q.AnswerOptions)
                .Include(l => l.Assignments)
                .FirstOrDefaultAsync(l =>
                    l.Id == lessonId &&
                    l.Status == LessonStatus.Published &&
                    l.Assignments.Any(a => a.ClassId == classId));

            if (lesson == null)
                return NotFound("Lesson not found or not assigned to your class.");

            return Ok(new
            {
                lesson.Id,
                lesson.Title,
                lesson.DueDate,
                Questions = lesson.Questions
                    .OrderBy(q => q.Order)
                    .Select(q => new
                    {
                        q.Id,
                        Type = q.Type.ToString(),
                        q.Order,
                        q.ReadingSnippet,
                        q.Prompt,
                        AnswerOptions = q.Type == QuestionType.Reading
                            ? q.AnswerOptions
                                .Select(o => new AnswerOptionPublicDto { Id = o.Id, Text = o.Text })
                                .ToList()
                            : new List<AnswerOptionPublicDto>()
                    })
            });
        }

        // ---------------------------------------------------------
        // 3) Start a lesson attempt
        // ---------------------------------------------------------
        [HttpPost("{lessonId:int}/start")]
        public async Task<IActionResult> StartAttempt(int lessonId)
        {
            var student = await GetStudentAsync();
            if (student == null)
                return Unauthorized("Student profile not found.");

            if (student.ClassId == null)
                return Unauthorized("Student is not assigned to a class.");

            var classId = student.ClassId.Value;

            var lessonExists = await _db.Lessons.AnyAsync(l =>
                l.Id == lessonId &&
                l.Status == LessonStatus.Published &&
                l.Assignments.Any(a => a.ClassId == classId));

            if (!lessonExists)
                return NotFound("Lesson not found or not assigned to your class.");

            var hasRetriedAlready = await _db.LessonAttempts.AnyAsync(a =>
                a.LessonId == lessonId &&
                a.StudentId == student.Id &&
                a.IsRetry &&
                a.SubmittedAt != null);

            if (hasRetriedAlready)
                return BadRequest("Retry limit reached for this lesson.");

            var existingActive = await _db.LessonAttempts.FirstOrDefaultAsync(a =>
                a.LessonId == lessonId &&
                a.StudentId == student.Id &&
                a.SubmittedAt == null);

            if (existingActive != null)
            {
                return Ok(new
                {
                    AttemptId = existingActive.Id,
                    existingActive.LessonId,
                    existingActive.StartedAt,
                    existingActive.IsRetry,
                    ReusedExisting = true
                });
            }

            var hasSubmittedBefore = await _db.LessonAttempts.AnyAsync(a =>
                a.LessonId == lessonId &&
                a.StudentId == student.Id &&
                a.SubmittedAt != null);

            var attempt = new LessonAttempt
            {
                LessonId = lessonId,
                StudentId = student.Id,
                IsRetry = hasSubmittedBefore,
                StartedAt = DateTime.UtcNow,
                NeedsTeacherReview = true,
                TeacherReviewCompleted = false
            };

            _db.LessonAttempts.Add(attempt);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                AttemptId = attempt.Id,
                attempt.LessonId,
                attempt.StartedAt,
                attempt.IsRetry,
                ReusedExisting = false
            });
        }

        // ---------------------------------------------------------
        // 3b) Save an in-progress attempt (draft)
        // ---------------------------------------------------------
        [HttpPost("{lessonId:int}/progress")]
        public async Task<IActionResult> SaveProgress(int lessonId, [FromBody] SaveLessonProgressRequest dto)
        {
            if (dto == null || dto.AttemptId <= 0)
                return BadRequest("Invalid save payload.");

            var student = await GetStudentAsync();
            if (student == null)
                return Unauthorized("Student profile not found.");

            var attempt = await _db.LessonAttempts
                .Include(a => a.Responses)
                .FirstOrDefaultAsync(a =>
                    a.Id == dto.AttemptId &&
                    a.LessonId == lessonId &&
                    a.StudentId == student.Id &&
                    a.SubmittedAt == null);

            if (attempt == null)
                return NotFound("Active attempt not found.");

            var lesson = await _db.Lessons
                .Include(l => l.Questions)
                .FirstOrDefaultAsync(l => l.Id == lessonId);

            if (lesson == null)
                return NotFound("Lesson not found.");

            var questionIds = lesson.Questions.Select(q => q.Id).ToHashSet();
            var responses = dto.Responses ?? new List<SubmitQuestionResponseDto>();

            foreach (var incoming in responses)
            {
                if (!questionIds.Contains(incoming.LessonQuestionId))
                    continue;

                var question = lesson.Questions.First(q => q.Id == incoming.LessonQuestionId);
                var existing = attempt.Responses.FirstOrDefault(r => r.LessonQuestionId == question.Id);
                if (existing == null)
                {
                    existing = new QuestionResponse
                    {
                        LessonAttemptId = attempt.Id,
                        LessonQuestionId = question.Id,
                        NeedsReview = question.Type != QuestionType.Reading
                    };
                    attempt.Responses.Add(existing);
                }

                if (question.Type == QuestionType.Reading)
                {
                    existing.SelectedOptionId = incoming.SelectedOptionId;
                    existing.IsCorrect = null;
                    existing.Score = 0;
                    existing.AiScore = null;
                }
                else
                {
                    existing.ResponseText = (incoming.ResponseText ?? string.Empty).Trim();
                    existing.Score = 0;
                    existing.AiScore = null;
                    existing.NeedsReview = true;
                }
            }

            await _db.SaveChangesAsync();

            return Ok(new
            {
                attempt.Id,
                attempt.LessonId,
                SavedResponses = attempt.Responses.Count,
                SavedAt = DateTime.UtcNow
            });
        }

        // ---------------------------------------------------------
        // 3c) Fetch attempt with responses/feedback
        // ---------------------------------------------------------
        [HttpGet("{lessonId:int}/attempts/{attemptId:int}")]
        public async Task<IActionResult> GetAttempt(int lessonId, int attemptId)
        {
            var student = await GetStudentAsync();
            if (student == null)
                return Unauthorized("Student profile not found.");

            var attempt = await GetAttemptWithDetailsAsync(attemptId);
            if (attempt == null || attempt.StudentId != student.Id || attempt.LessonId != lessonId)
                return NotFound("Attempt not found.");

            return Ok(BuildAttemptDetail(attempt));
        }

        // ---------------------------------------------------------
        // 4) Submit an attempt
        //    - Reading auto marked (1 point each)
        //    - Writing/Speaking marked by FastAPI (/correct)
        //    - Creates FeedbackReview rows for writing/speaking
        //    - Tags StudentErrors
        // ---------------------------------------------------------
        [HttpPost("{lessonId:int}/submit")]
        public async Task<IActionResult> SubmitAttempt(int lessonId, [FromBody] SubmitLessonRequest dto)
        {
            if (dto == null || dto.AttemptId <= 0 || dto.Responses == null)
                return BadRequest("Invalid submission payload.");

            var student = await GetStudentAsync();
            if (student == null)
                return Unauthorized("Student profile not found.");

            var attempt = await _db.LessonAttempts
                .Include(a => a.Responses)
                .FirstOrDefaultAsync(a =>
                    a.Id == dto.AttemptId &&
                    a.LessonId == lessonId &&
                    a.StudentId == student.Id);

            if (attempt == null)
                return NotFound("Attempt not found.");

            if (attempt.SubmittedAt != null)
                return BadRequest("Attempt already submitted.");

            var lesson = await _db.Lessons
                .Include(l => l.Questions)
                    .ThenInclude(q => q.AnswerOptions)
                .FirstOrDefaultAsync(l => l.Id == lessonId);

            if (lesson == null)
                return NotFound("Lesson not found.");

            // Validate response question IDs
            var questionIds = lesson.Questions.Select(q => q.Id).ToHashSet();
            foreach (var r in dto.Responses)
            {
                if (!questionIds.Contains(r.LessonQuestionId))
                    return BadRequest($"Response includes invalid LessonQuestionId: {r.LessonQuestionId}");
            }

            // If anything existed (shouldn't), clear it
            if (attempt.Responses.Count > 0)
            {
                _db.QuestionResponses.RemoveRange(attempt.Responses);
                attempt.Responses.Clear();
            }

            int readingScore = 0;
            int provisionalWriting = 0;
            int provisionalSpeaking = 0;
            bool needsTeacherReview = false;

            foreach (var q in lesson.Questions.OrderBy(q => q.Order))
            {
                var submitted = dto.Responses.FirstOrDefault(x => x.LessonQuestionId == q.Id);
                if (submitted == null)
                    return BadRequest($"Missing response for questionId={q.Id}");

                if (q.Type == QuestionType.Reading)
                {
                    if (submitted.SelectedOptionId == null)
                        return BadRequest($"Reading question {q.Id} requires SelectedOptionId.");

                    var selectedOptionId = submitted.SelectedOptionId.Value;

                    var correct = q.AnswerOptions.Any(o => o.Id == selectedOptionId && o.IsCorrect);
                    var score = correct ? 1 : 0;
                    readingScore += score;

                    var resp = new QuestionResponse
                    {
                        LessonAttemptId = attempt.Id,
                        LessonQuestionId = q.Id,
                        SelectedOptionId = selectedOptionId,
                        IsCorrect = correct,
                        Score = score,
                        NeedsReview = false
                    };

                    attempt.Responses.Add(resp);

                    if (!correct)
                    {
                        _db.StudentErrors.Add(new StudentError
                        {
                            StudentId = student.Id,
                            QuestionResponse = resp,
                            ErrorType = "Reading",
                            CreatedAt = DateTime.UtcNow,
                            Resolved = false
                        });
                    }
                }
                else if (q.Type == QuestionType.Writing || q.Type == QuestionType.Speaking)
                {
                    var text = (submitted.ResponseText ?? string.Empty).Trim();
                    if (string.IsNullOrWhiteSpace(text))
                        return BadRequest($"{q.Type} question {q.Id} requires ResponseText.");

                    needsTeacherReview = true;

                    // ---- Call your FastAPI NLP model ----
                    CorrectionResponse nlp;
                    try
                    {
                        // prompt is optional; you can pass q.Prompt if you want more context in logs
                        nlp = await _correctionClient.CorrectAsync(studentInput: text, prompt: q.Prompt ?? string.Empty, maxLength: 256);
                    }
                    catch (Exception ex)
                    {
                        // Fail-safe: still store response; mark for review;
                        // but AI score will be null so teacher can handle it.
                        nlp = new CorrectionResponse
                        {
                            Original = text,
                            Corrected = text,
                            Prompt = q.Prompt ?? "",
                            NumErrors = 0,
                            Score = 0,
                            Changes = new List<CorrectionChange>(),
                            HasErrors = false
                        };

                        // OPTIONAL: you could log ex.Message to console
                        Console.WriteLine($"[NLP] Failed: {ex.Message}");
                    }

                    int aiScore = Math.Clamp(nlp.Score, 0, 10);
                    bool hasErrors = nlp.HasErrors || aiScore < 10;

                    var resp = new QuestionResponse
                    {
                        LessonAttemptId = attempt.Id,
                        LessonQuestionId = q.Id,
                        ResponseText = text,

                        // Final score set after teacher review
                        Score = 0,

                        // Provisional AI score
                        AiScore = aiScore,
                        NeedsReview = true
                    };

                    // Store corrected + simple feedback now.
                    // If you want, you can later run Gemini to turn changes into nicer feedback.
                    var changesJson = nlp.Changes != null && nlp.Changes.Count > 0
                        ? JsonSerializer.Serialize(nlp.Changes)
                        : null;

                    resp.FeedbackReview = new FeedbackReview
                    {
                        AiCorrections = nlp.Corrected,
                        AiFeedback = $"Errors: {nlp.NumErrors}. Provisional score: {aiScore}/10.",
                        TeacherFeedback = null,
                        TeacherScore = null,
                        ApprovedByTeacher = false,
                        CreatedAt = DateTime.UtcNow
                    };

                    // If you want to store changes JSON, simplest is append it to AiFeedback for now:
                    if (!string.IsNullOrWhiteSpace(changesJson))
                        resp.FeedbackReview.AiFeedback += $" Changes: {changesJson}";

                    attempt.Responses.Add(resp);

                    // Tag as a practice error if not perfect
                    if (hasErrors)
                    {
                        _db.StudentErrors.Add(new StudentError
                        {
                            StudentId = student.Id,
                            QuestionResponse = resp,
                            ErrorType = q.Type.ToString(), // "Writing" / "Speaking"
                            CreatedAt = DateTime.UtcNow,
                            Resolved = false
                        });
                    }
                    if (q.Type == QuestionType.Writing)
                        provisionalWriting = aiScore;
                    else if (q.Type == QuestionType.Speaking)
                        provisionalSpeaking = aiScore;
                }
            }

            attempt.ReadingScore = Math.Clamp(readingScore, 0, 2);

            // Use provisional AI scores as the working score until a teacher reviews.
            attempt.WritingScore = provisionalWriting;
            attempt.SpeakingScore = provisionalSpeaking;

            // Provisional total
            attempt.TotalScore = attempt.ReadingScore + attempt.WritingScore + attempt.SpeakingScore;

            attempt.NeedsTeacherReview = needsTeacherReview;
            attempt.TeacherReviewCompleted = false;
            attempt.SubmittedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            var hydrated = await GetAttemptWithDetailsAsync(attempt.Id);
            if (hydrated == null)
                return Ok(new { attempt.Id, attempt.LessonId, attempt.SubmittedAt });

            return Ok(BuildAttemptDetail(hydrated));
        }

        private async Task<LessonAttempt?> GetAttemptWithDetailsAsync(int attemptId)
        {
            return await _db.LessonAttempts
                .Include(a => a.Lesson)
                    .ThenInclude(l => l.Questions)
                        .ThenInclude(q => q.AnswerOptions)
                .Include(a => a.Responses)
                    .ThenInclude(r => r.FeedbackReview)
                .Include(a => a.Responses)
                    .ThenInclude(r => r.LessonQuestion)
                .FirstOrDefaultAsync(a => a.Id == attemptId);
        }

        private LessonAttemptSummaryDto BuildAttemptSummary(LessonAttempt attempt)
        {
            var writing = attempt.Responses.FirstOrDefault(r => r.LessonQuestion.Type == QuestionType.Writing)?.AiScore
                          ?? attempt.WritingScore;
            var speaking = attempt.Responses.FirstOrDefault(r => r.LessonQuestion.Type == QuestionType.Speaking)?.AiScore
                           ?? attempt.SpeakingScore;
            var total = attempt.ReadingScore + writing + speaking;

            return new LessonAttemptSummaryDto
            {
                AttemptId = attempt.Id,
                SubmittedAt = attempt.SubmittedAt,
                ReadingScore = attempt.ReadingScore,
                WritingScore = writing,
                SpeakingScore = speaking,
                TotalScore = total,
                NeedsTeacherReview = attempt.NeedsTeacherReview,
                TeacherReviewCompleted = attempt.TeacherReviewCompleted,
                ReviewStatus = attempt.TeacherReviewCompleted
                    ? "Reviewed"
                    : attempt.NeedsTeacherReview ? "Pending" : "Reviewed"
            };
        }

        private object BuildAttemptDetail(LessonAttempt attempt)
        {
            var includeCorrectAnswers = attempt.SubmittedAt != null;
            var summary = BuildAttemptSummary(attempt);

            var questions = attempt.Lesson.Questions
                .OrderBy(q => q.Order)
                .Select(q =>
                {
                    var resp = attempt.Responses.FirstOrDefault(r => r.LessonQuestionId == q.Id);
                    return new
                    {
                        q.Id,
                        Type = q.Type.ToString(),
                        q.Order,
                        q.ReadingSnippet,
                        q.Prompt,
                        AnswerOptions = q.Type == QuestionType.Reading
                            ? q.AnswerOptions
                                .Select(o => new AnswerOptionPublicDto { Id = o.Id, Text = o.Text })
                                .ToList()
                            : new List<AnswerOptionPublicDto>(),
                        CorrectOptionId = includeCorrectAnswers && q.Type == QuestionType.Reading
                            ? q.AnswerOptions.FirstOrDefault(o => o.IsCorrect)?.Id
                            : null,
                        Response = resp == null
                            ? null
                            : new
                            {
                                resp.Id,
                                resp.SelectedOptionId,
                                resp.ResponseText,
                                resp.IsCorrect,
                                resp.AiScore,
                                resp.Score,
                                Feedback = resp.FeedbackReview == null
                                    ? null
                                    : new
                                    {
                                        resp.FeedbackReview.AiCorrections,
                                        resp.FeedbackReview.AiFeedback,
                                        resp.FeedbackReview.TeacherFeedback,
                                        resp.FeedbackReview.TeacherScore,
                                        resp.FeedbackReview.ApprovedByTeacher,
                                        Changes = ExtractChangesFromFeedback(resp.FeedbackReview.AiFeedback)
                                    }
                            }
                    };
                })
                .ToList();

            return new
            {
                Attempt = new
                {
                    summary.AttemptId,
                    attempt.LessonId,
                    summary.SubmittedAt,
                    attempt.StartedAt,
                    summary.TotalScore,
                    ScoreOutOf = 22,
                    summary.ReviewStatus,
                    summary.ReadingScore,
                    summary.WritingScore,
                    summary.SpeakingScore,
                    attempt.NeedsTeacherReview,
                    attempt.TeacherReviewCompleted
                },
                Lesson = new
                {
                    attempt.Lesson.Id,
                    attempt.Lesson.Title,
                    attempt.Lesson.DueDate
                },
                Questions = questions
            };
        }

        private List<CorrectionChange> ExtractChangesFromFeedback(string? aiFeedback)
        {
            if (string.IsNullOrWhiteSpace(aiFeedback))
                return new List<CorrectionChange>();

            const string marker = "Changes:";
            var idx = aiFeedback.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (idx < 0)
                return new List<CorrectionChange>();

            var json = aiFeedback[(idx + marker.Length)..].Trim();
            try
            {
                var parsed = JsonSerializer.Deserialize<List<CorrectionChange>>(json);
                return parsed ?? new List<CorrectionChange>();
            }
            catch
            {
                return new List<CorrectionChange>();
            }
        }
    }

    // ============================================================
    // DTOs
    // ============================================================

    public class AnswerOptionPublicDto
    {
        public int Id { get; set; }
        public string Text { get; set; } = string.Empty;
    }

    public class SubmitLessonRequest
    {
        public int AttemptId { get; set; }
        public List<SubmitQuestionResponseDto> Responses { get; set; } = new();
    }

    public class SubmitQuestionResponseDto
    {
        public int LessonQuestionId { get; set; }
        public int? SelectedOptionId { get; set; }
        public string? ResponseText { get; set; }
    }

    public class SaveLessonProgressRequest
    {
        public int AttemptId { get; set; }
        public List<SubmitQuestionResponseDto> Responses { get; set; } = new();
    }

    public class LessonAttemptSummaryDto
    {
        public int AttemptId { get; set; }
        public DateTime? SubmittedAt { get; set; }
        public int ReadingScore { get; set; }
        public int WritingScore { get; set; }
        public int SpeakingScore { get; set; }
        public int TotalScore { get; set; }
        public bool NeedsTeacherReview { get; set; }
        public bool TeacherReviewCompleted { get; set; }
        public string ReviewStatus { get; set; } = "Pending";
    }
}
