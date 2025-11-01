using backend.Data;
using backend.Models;
using backend.Models.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BCrypt.Net;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IConfiguration _config;

        public AuthController(AppDbContext db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register(RegisterDto dto)
        {
            // Check if email already exists
            if (await _db.Users.AnyAsync(u => u.Email == dto.Email))
                return BadRequest("Email already in use");

            // Hash the password
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);

            // Create user
            var user = new User
            {
                Email = dto.Email,
                PasswordHash = passwordHash,
                Role = dto.Role
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            // Role-specific creation
            if (dto.Role == "Student")
            {
                var student = new Student
                {
                    UserId = user.Id,
                    FullName = dto.FullName,
                    Age = dto.Age,
                    FirstLanguage = dto.FirstLanguage,
                    Level = dto.Level
                };
                _db.Students.Add(student);
            }
            else if (dto.Role == "Teacher")
            {
                var teacher = new Teacher
                {
                    UserId = user.Id,
                    FullName = dto.FullName
                };
                _db.Teachers.Add(teacher);
            }
            else
            {
                return BadRequest("Invalid role specified. Must be 'Student' or 'Teacher'.");
            }

            await _db.SaveChangesAsync();
            return Ok("User registered successfully");
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginDto dto)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == dto.Email);
            if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
                return Unauthorized("Invalid credentials");

            var token = GenerateJwtToken(user);
            return Ok(new { token, role = user.Role });
        }

        private string GenerateJwtToken(User user)
        {
            var jwtKey = _config["JWT_KEY"] ?? _config["Jwt:Key"];
            if (string.IsNullOrWhiteSpace(jwtKey))
                throw new Exception("JWT_KEY / Jwt:Key is missing in configuration");

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Role, user.Role),
                new Claim(ClaimTypes.Email, user.Email)
            };

            var token = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"],
                audience: _config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
