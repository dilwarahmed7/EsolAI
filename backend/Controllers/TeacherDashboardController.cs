using backend.Data;
using backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/teacher/dashboard")]
    [Authorize(Roles = "Teacher")]
    public class TeacherDashboardController : ControllerBase
    {
        private readonly AppDbContext _db;

        public TeacherDashboardController(AppDbContext db)
        {
            _db = db;
        }

        private int GetUserId() => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        private async Task<Teacher?> GetTeacherAsync()
        {
            var userId = GetUserId();
            return await _db.Teachers.FirstOrDefaultAsync(t => t.UserId == userId);
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary()
        {
            var teacher = await GetTeacherAsync();
            if (teacher == null)
                return Unauthorized("Teacher profile not found.");

            var classIds = await _db.Classes
                .Where(c => c.TeacherId == teacher.Id)
                .Select(c => c.Id)
                .ToListAsync();

            var activeStudents = await _db.Students
                .Where(s => s.ClassId != null && classIds.Contains(s.ClassId.Value))
                .CountAsync();

            var lessonsInProgress = await _db.Lessons
                .Where(l => l.TeacherId == teacher.Id && l.Status == LessonStatus.Published)
                .CountAsync();

            int ResolveScore(LessonAttempt attempt, QuestionType type, int fallback)
            {
                var responses = attempt.Responses
                    .Where(r => r.LessonQuestion.Type == type)
                    .ToList();

                if (responses.Count == 0)
                    return fallback;

                return responses.Sum(response =>
                {
                    if (response.FeedbackReview?.TeacherScore != null)
                        return response.FeedbackReview.TeacherScore.Value;
                    if (!response.NeedsReview || attempt.TeacherReviewCompleted)
                        return response.Score;
                    if (response.AiScore != null)
                        return response.AiScore.Value;
                    return response.Score;
                });
            }

            var attempts = await _db.LessonAttempts
                .Where(a =>
                    a.SubmittedAt != null &&
                    a.Lesson.TeacherId == teacher.Id &&
                    a.Lesson.Status == LessonStatus.Published &&
                    a.Lesson.Assignments.Any(assign => classIds.Contains(assign.ClassId)))
                .Include(a => a.Lesson)
                    .ThenInclude(l => l.Questions)
                .Include(a => a.Responses)
                    .ThenInclude(r => r.FeedbackReview)
                .Include(a => a.Responses)
                    .ThenInclude(r => r.LessonQuestion)
                .ToListAsync();

            double avgScorePercent = 0;
            string? avgTrend = null;
            if (attempts.Count > 0)
            {
                var scored = attempts
                    .GroupBy(a => new { a.StudentId, a.LessonId })
                    .Select(group =>
                    {
                        var submitted = group
                            .Where(a => a.SubmittedAt != null)
                            .OrderBy(a => a.SubmittedAt)
                            .ToList();
                        if (submitted.Count == 0)
                            return null;

                        var originalSubmitted =
                            submitted.FirstOrDefault(a => !a.IsRetry) ??
                            submitted.FirstOrDefault();
                        if (originalSubmitted == null)
                            return null;

                        var writing = ResolveScore(originalSubmitted, QuestionType.Writing, originalSubmitted.WritingScore);
                        var speaking = ResolveScore(originalSubmitted, QuestionType.Speaking, originalSubmitted.SpeakingScore);
                        var total = originalSubmitted.ReadingScore + writing + speaking;
                        var scoreOutOf = CalculateLessonScoreOutOf(originalSubmitted.Lesson.Questions);
                        if (scoreOutOf <= 0)
                            return null;

                        return new
                        {
                            Percent = (total / (double)scoreOutOf) * 100.0,
                            originalSubmitted.SubmittedAt
                        };
                    })
                    .Where(x => x != null)
                    .Select(x => x!)
                    .OrderByDescending(x => x.SubmittedAt)
                    .ToList();

                if (scored.Count > 0)
                {
                    avgScorePercent = Math.Round(scored.Average(x => x.Percent), 1);
                }

                if (scored.Count >= 2)
                {
                    var latest = scored[0];
                    var prevPct = scored.Skip(1).Average(x => x.Percent);
                    var delta = latest.Percent - prevPct;
                    if (Math.Abs(delta) < 0.05)
                        avgTrend = "flat";
                    else
                        avgTrend = delta > 0 ? "up" : "down";
                }
            }

            return Ok(new
            {
                ActiveStudents = activeStudents,
                LessonsInProgress = lessonsInProgress,
                AverageScorePercent = avgScorePercent,
                AverageTrend = avgTrend
            });
        }

        private static int CountFillBlankPlaceholders(string? sentenceTemplate)
        {
            if (string.IsNullOrWhiteSpace(sentenceTemplate))
                return 0;

            return sentenceTemplate.Split("___").Length - 1;
        }

        private static int GetQuestionScoreOutOf(QuestionType type, string? readingSnippet)
        {
            if (type == QuestionType.Reading)
                return 1;
            if (type == QuestionType.FillInBlank)
                return Math.Max(1, CountFillBlankPlaceholders(readingSnippet));
            if (type == QuestionType.Writing || type == QuestionType.Speaking)
                return 10;
            return 0;
        }

        private static int CalculateLessonScoreOutOf(IEnumerable<LessonQuestion> questions)
            => questions.Sum(q => GetQuestionScoreOutOf(q.Type, q.ReadingSnippet));
    }
}
