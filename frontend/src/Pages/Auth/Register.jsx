import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Register.css";

const Register = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("Student");
  const [age, setAge] = useState("");
  const [firstLanguage, setFirstLanguage] = useState("");
  const [level, setLevel] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = { email, password, fullName, role };
    if (role === "Student") {
      payload.age = Number(age);
      payload.firstLanguage = firstLanguage;
      payload.level = level;
    }

    try {
      const res = await fetch("http://localhost:5144/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error);
      } else {
        alert("User registered successfully!");
        navigate("/login");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong.");
    }
  };

  return (
    <div className="register-page">
      <div className="register-content">
        <div className="register-card">
          <h2 className="register-title">Register {role}</h2>

          <div className="role-switch">
            <label className={role === "Teacher" ? "active" : ""}>
              <input
                type="radio"
                name="role"
                value="Teacher"
                checked={role === "Teacher"}
                onChange={() => setRole("Teacher")}
              />
              Teacher
            </label>
            <label className={role === "Student" ? "active" : ""}>
              <input
                type="radio"
                name="role"
                value="Student"
                checked={role === "Student"}
                onChange={() => setRole("Student")}
              />
              Student
            </label>
          </div>

          <form onSubmit={handleSubmit} className="register-form">
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {role === "Student" && (
              <>
                <input
                  type="number"
                  placeholder="Age"
                  min="1"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="First Language"
                  value={firstLanguage}
                  onChange={(e) => setFirstLanguage(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="Level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  required
                />
              </>
            )}

            <button type="submit" className="register-btn">Register</button>
            <p className="register-footer">
              Already have an account? <a href="/login">Login here</a>
            </p>
          </form>
        </div>

        <div className="register-placeholder">
          <h2>Welcome to EsolAI</h2>
          <p>Explore our platform and start your journey to mastering English.</p>
          <p>Placeholder for images, illustrations, or graphics.</p>
        </div>
      </div>
    </div>
  );
};

export default Register;
