using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    public class Student
    {
        [Key]
        public int Id { get; set; }

        [ForeignKey("User")]
        public int UserId { get; set; }

        [Required]
        public string FullName { get; set; } = string.Empty;

        [Required]
        public string FirstLanguage { get; set; } = string.Empty;

        [Range(1, 120)]
        public int Age { get; set; }

        public string Level { get; set; } = string.Empty;

        // Navigation property
        public User User { get; set; } = null!;
    }
}
