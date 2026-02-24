using backend.Data;
using backend.Models;
using backend.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Security.Claims;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/teacher/classes")]
    [Authorize(Roles = "Teacher")]
    public class TeacherClassController : ControllerBase
    {
        private readonly AppDbContext _context;

        public TeacherClassController(AppDbContext context)
        {
            _context = context;
        }

        [HttpPost]
        public async Task<IActionResult> CreateClass([FromBody] CreateClassRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Name))
                return BadRequest("Class name is required.");

            var userId = int.Parse(
                User.FindFirst(ClaimTypes.NameIdentifier)!.Value
            );

            var teacher = await _context.Teachers
                .FirstOrDefaultAsync(t => t.UserId == userId);

            if (teacher == null)
                return Unauthorized("Teacher profile not found.");

            var cls = new Models.Class
            {
                Name = request.Name,
                TeacherId = teacher.Id
            };

            _context.Classes.Add(cls);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                cls.Id,
                cls.Name
            });
        }

        [HttpGet]
        public async Task<IActionResult> GetClasses()
        {
            var userId = int.Parse(
                User.FindFirst(ClaimTypes.NameIdentifier)!.Value
            );

            var teacher = await _context.Teachers
                .FirstOrDefaultAsync(t => t.UserId == userId);

            if (teacher == null)
                return Unauthorized("Teacher profile not found.");

            var classes = await _context.Classes
                .Where(c => c.TeacherId == teacher.Id)
                .Select(c => new
                {
                    c.Id,
                    c.Name
                })
                .ToListAsync();

            return Ok(classes);
        }

        [HttpGet("{classId}/students")]
        public async Task<IActionResult> GetStudentsInClass(int classId)
        {
            var userId = int.Parse(
                User.FindFirst(ClaimTypes.NameIdentifier)!.Value
            );

            var teacher = await _context.Teachers
                .FirstOrDefaultAsync(t => t.UserId == userId);

            if (teacher == null)
                return Unauthorized("Teacher profile not found.");

            var ownsClass = await _context.Classes
                .AnyAsync(c => c.Id == classId && c.TeacherId == teacher.Id);

            if (!ownsClass)
                return Unauthorized("You do not own this class.");

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

            var attempts = await _context.LessonAttempts
                .Where(a =>
                    a.Student.ClassId == classId &&
                    a.Lesson.TeacherId == teacher.Id &&
                    a.Lesson.Status == LessonStatus.Published &&
                    a.Lesson.Assignments.Any(assign => assign.ClassId == classId) &&
                    a.SubmittedAt != null)
                .Include(a => a.Lesson)
                    .ThenInclude(l => l.Questions)
                .Include(a => a.Responses)
                    .ThenInclude(r => r.FeedbackReview)
                .Include(a => a.Responses)
                    .ThenInclude(r => r.LessonQuestion)
                .ToListAsync();

            var studentStats = attempts
                .GroupBy(a => a.StudentId)
                .ToDictionary(
                    g => g.Key,
                    g =>
                    {
                        var scored = g
                            .GroupBy(a => a.LessonId)
                            .Select(lessonAttempts =>
                            {
                                var submitted = lessonAttempts
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

                        if (scored.Count == 0)
                            return (AvgPercent: (double?)null, Trend: (string?)null);

                        var avgPercent = Math.Round(scored.Average(x => x.Percent), 1);

                        string? trend = null;
                        if (scored.Count >= 2)
                        {
                            var latest = scored[0];
                            var prevPct = scored.Skip(1).Average(x => x.Percent);
                            var delta = latest.Percent - prevPct;
                            if (Math.Abs(delta) < 0.05)
                                trend = "flat";
                            else
                                trend = delta > 0 ? "up" : "down";
                        }

                        return (AvgPercent: (double?)avgPercent, Trend: trend);
                    });

            var students = await _context.Students
                .Where(s => s.ClassId == classId)
                .Select(s => new
                {
                    s.Id,
                    s.FullName,
                    s.Level
                })
                .ToListAsync();

            var payload = students.Select(s =>
            {
                double? avgPercent = null;
                string? trend = null;
                if (studentStats.TryGetValue(s.Id, out var stats))
                {
                    avgPercent = stats.AvgPercent;
                    trend = stats.Trend;
                }

                return new
                {
                    s.Id,
                    s.FullName,
                    s.Level,
                    AverageScore = avgPercent,
                    AverageTrend = trend
                };
            });

            return Ok(payload);
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

        [HttpPost("{classId}/students")]
        public async Task<IActionResult> AddStudentToClass(
            int classId,
            [FromBody] AddStudentToClassRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Email))
                return BadRequest("Student email is required.");

            var userId = int.Parse(
                User.FindFirst(ClaimTypes.NameIdentifier)!.Value
            );

            var teacher = await _context.Teachers
                .FirstOrDefaultAsync(t => t.UserId == userId);

            if (teacher == null)
                return Unauthorized("Teacher profile not found.");

            var cls = await _context.Classes
                .FirstOrDefaultAsync(c => c.Id == classId && c.TeacherId == teacher.Id);

            if (cls == null)
                return Unauthorized("You do not own this class.");

            var student = await _context.Students
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.User.Email == request.Email);

            if (student == null)
                return NotFound("Student not found.");

            student.ClassId = classId;
            await _context.SaveChangesAsync();

            return Ok();
        }

        [HttpDelete("{classId}/students/{studentId}")]
        public async Task<IActionResult> RemoveStudentFromClass(int classId, int studentId)
        {
            var userId = int.Parse(
                User.FindFirst(ClaimTypes.NameIdentifier)!.Value
            );

            var teacher = await _context.Teachers
                .FirstOrDefaultAsync(t => t.UserId == userId);

            if (teacher == null)
                return Unauthorized("Teacher profile not found.");

            var ownsClass = await _context.Classes
                .AnyAsync(c => c.Id == classId && c.TeacherId == teacher.Id);

            if (!ownsClass)
                return Unauthorized("You do not own this class.");

            var student = await _context.Students
                .FirstOrDefaultAsync(s =>
                    s.Id == studentId &&
                    s.ClassId == classId);

            if (student == null)
                return NotFound("Student not found in this class.");

            student.ClassId = null;
            await _context.SaveChangesAsync();

            return Ok();
        }

        [HttpPut("students/{studentId}/level")]
        public async Task<IActionResult> UpdateStudentLevel(
            int studentId,
            [FromBody] UpdateStudentLevelRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Level))
                return BadRequest("Level is required.");

            var student = await _context.Students.FindAsync(studentId);

            if (student == null)
                return NotFound("Student not found.");

            student.Level = request.Level;
            await _context.SaveChangesAsync();

            return Ok();
        }
    }
}
