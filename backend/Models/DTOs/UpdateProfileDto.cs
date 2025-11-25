using System.ComponentModel.DataAnnotations;

namespace backend.Models.DTOs
{
    public class UpdateProfileDto
    {
        [Required]
        public string FullName { get; set; } = string.Empty;

        public int? Age { get; set; }

        public string? FirstLanguage { get; set; }

        public string? Level { get; set; }
    }
}
