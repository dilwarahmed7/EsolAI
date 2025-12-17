using System.Security.Claims;
using backend.Data;
using backend.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/practice")]
    [Authorize]
    public class PracticeController : ControllerBase
    {
        private readonly AppDbContext _context;

        public PracticeController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("l1-errors")]
        public async Task<IActionResult> GetTopL1Errors()
        {
            var userId = GetUserIdFromJwt();
            if (userId == null)
                return Unauthorized();

            var student = await _context.Students
                .FirstOrDefaultAsync(s => s.UserId == userId.Value);

            if (student == null)
                return Unauthorized();

            var errors = await _context.L1ErrorTypes
                .Where(e => e.FirstLanguage == student.FirstLanguage)
                .OrderByDescending(e => e.Weight)
                .Take(5)
                .Select(e => e.ErrorType)
                .ToListAsync();

            return Ok(errors);
        }

        [HttpPost("l1-errors/start")]
        public async Task<IActionResult> StartL1Practice(
            [FromBody] StartPracticeRequest request,
            [FromServices] backend.Services.Interfaces.IQuestionGeneratorService questionGenerator)
        {
            if (string.IsNullOrWhiteSpace(request.ErrorType))
                return BadRequest("ErrorType is required.");

            var userId = GetUserIdFromJwt();
            if (userId == null)
                return Unauthorized();

            var student = await _context.Students
                .FirstOrDefaultAsync(s => s.UserId == userId.Value);

            if (student == null)
                return Unauthorized();

            var generationRequest = new QuestionGenerationRequest
            {
                ErrorType = request.ErrorType,
                FirstLanguage = student.FirstLanguage,
                Age = student.Age,
                Level = student.Level
            };

            var response = await questionGenerator.GenerateAsync(generationRequest);

            return Ok(response);
        }

        private int? GetUserIdFromJwt()
        {
            var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrWhiteSpace(idClaim))
                return null;

            return int.TryParse(idClaim, out int userId)
                ? userId
                : null;
        }
    }
}
