using backend.Data;
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

            const double scoreOutOf = 22.0;

            // Average only the first (non-retry) submitted attempts for students in this class
            var averageLookup = await _context.LessonAttempts
                .Where(a =>
                    a.Student.ClassId == classId &&
                    a.Lesson.TeacherId == teacher.Id &&
                    a.IsRetry == false &&
                    a.SubmittedAt != null)
                .GroupBy(a => a.StudentId)
                .Select(g => new
                {
                    StudentId = g.Key,
                    AvgRaw = g.Average(a => (double)a.TotalScore)
                })
                .ToDictionaryAsync(x => x.StudentId, x => x.AvgRaw);

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
                if (averageLookup.TryGetValue(s.Id, out var avgRaw))
                {
                    avgPercent = Math.Round((avgRaw / scoreOutOf) * 100.0, 1);
                }

                return new
                {
                    s.Id,
                    s.FullName,
                    s.Level,
                    AverageScore = avgPercent
                };
            });

            return Ok(payload);
        }

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
