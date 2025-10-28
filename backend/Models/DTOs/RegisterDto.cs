namespace backend.Models.DTOs
{
    public class RegisterDto
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Role { get; set; } = "Student"; // Student or Teacher

        public int Age { get; set; }
        public string FirstLanguage { get; set; } = string.Empty;
        public string Level { get; set; } = string.Empty;
    }
}
