using Microsoft.EntityFrameworkCore;

namespace backend.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options)
        {
        }

        // You can add DbSets later here like:
        // public DbSet<User> Users { get; set; }
    }
}
