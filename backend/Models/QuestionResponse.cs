using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    public class QuestionResponse
    {
        [Key]
        public int Id { get; set; }

        [ForeignKey(nameof(LessonAttempt))]
        public int LessonAttemptId { get; set; }
        public LessonAttempt LessonAttempt { get; set; } = null!;

        [ForeignKey(nameof(LessonQuestion))]
        public int LessonQuestionId { get; set; }
        public LessonQuestion LessonQuestion { get; set; } = null!;

        // Student answer
        public string? ResponseText { get; set; }           // writing/speaking (or typed fallback)
        public int? SelectedOptionId { get; set; }          // reading MCQ

        // Auto marking (reading)
        public bool? IsCorrect { get; set; }                // for reading
        public int Score { get; set; } = 0;                 // 0/1 for reading; 0-10 for writing/speaking final

        // Provisional AI marking for writing/speaking
        public int? AiScore { get; set; }                   // 0-10 provisional
        public bool NeedsReview { get; set; } = false;      // true for writing/speaking

        // Navigation
        public FeedbackReview? FeedbackReview { get; set; }
    }
}
