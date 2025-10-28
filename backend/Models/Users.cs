using System;
using System.ComponentModel.DataAnnotations;

namespace backend.Models
{
    public class User
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        public string PasswordHash { get; set; } = string.Empty;

        [Required]
        public string Role { get; set; } = "Student";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public Student? StudentProfile { get; set; }
        public Teacher? TeacherProfile { get; set; }
    }
}
