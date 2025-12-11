using backend.Models.DTOs;
using backend.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class QuestionGeneratorController : ControllerBase
    {
        private readonly IQuestionGeneratorService _questionGeneratorService;

        public QuestionGeneratorController(IQuestionGeneratorService questionGeneratorService)
        {
            _questionGeneratorService = questionGeneratorService;
        }

        [HttpPost("generate")]
        public async Task<IActionResult> Generate([FromBody] QuestionGenerationRequest request)
        {
            if (request == null)
                return BadRequest("Invalid request data");

            var response = await _questionGeneratorService.GenerateAsync(request);

            return Ok(response);
        }
    }
}
