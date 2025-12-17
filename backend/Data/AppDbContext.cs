using Microsoft.EntityFrameworkCore;
using backend.Models;

namespace backend.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users => Set<User>();
        public DbSet<Student> Students => Set<Student>();
        public DbSet<Teacher> Teachers => Set<Teacher>();
        public DbSet<L1ErrorType> L1ErrorTypes { get; set; }
        public DbSet<PracticeSession> PracticeSessions { get; set; }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            // Unique Email
            builder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            // User ↔ Student relationship
            builder.Entity<User>()
                .HasOne(u => u.StudentProfile)
                .WithOne(s => s.User)
                .HasForeignKey<Student>(s => s.UserId);

            // User ↔ Teacher relationship
            builder.Entity<User>()
                .HasOne(u => u.TeacherProfile)
                .WithOne(t => t.User)
                .HasForeignKey<Teacher>(t => t.UserId);
        }
    }
}
