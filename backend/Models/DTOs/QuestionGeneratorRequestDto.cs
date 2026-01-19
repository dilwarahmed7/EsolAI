namespace backend.Models.DTOs
{
    public class QuestionGenerationRequest
    {
        public string ErrorType { get; set; } = string.Empty;
        public string FirstLanguage { get; set; } = string.Empty;
        public int Age { get; set; }
        public string Level { get; set; } = string.Empty;
        public string? Seed { get; set; }
    }
}