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

            var firstAttempts = await _db.LessonAttempts
                .Where(a =>
                    a.IsRetry == false &&
                    a.SubmittedAt != null &&
                    a.Lesson.TeacherId == teacher.Id)
                .Select(a => a.TotalScore)
                .ToListAsync();

            double avgScorePercent = 0;
            if (firstAttempts.Count > 0)
            {
                var avgRaw = firstAttempts.Average();
                avgScorePercent = Math.Round((avgRaw / 22.0) * 100.0, 1);
            }

            return Ok(new
            {
                ActiveStudents = activeStudents,
                LessonsInProgress = lessonsInProgress,
                AverageScorePercent = avgScorePercent
            });
        }
    }
}
