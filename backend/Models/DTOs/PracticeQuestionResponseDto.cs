using System.Collections.Generic;

namespace backend.Models.DTOs
{
    public class PracticeQuestion
    {
        public string QuestionText { get; set; } = string.Empty;
        public List<string> Answers { get; set; } = new();
    }

    public class PracticeQuestionResponse
    {
        public List<PracticeQuestion> Questions { get; set; } = new();
        public string? ModelUsed { get; set; }
    }
}
