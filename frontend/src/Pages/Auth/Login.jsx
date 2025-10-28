import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Register.css";

const Login = ({ setRole }) => {  // receive setRole as a prop
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = { email, password };

    try {
      const res = await fetch("http://localhost:5144/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error);
      } else {
        const data = await res.json();

        localStorage.setItem("role", data.role);
        localStorage.setItem("token", data.token);

        // Update App.js state immediately
        if (setRole) setRole(data.role.toLowerCase());

        // Navigate to the correct dashboard
        navigate("/");
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
          <h2 className="register-title">Login</h2>

          <form onSubmit={handleSubmit} className="register-form">
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

            <button type="submit" className="register-btn">
              Log In
            </button>

            <p className="register-footer">
              Don't have an account? <a href="/register">Create one here</a>
            </p>
          </form>
        </div>

        <div className="register-placeholder">
          <h2>Welcome Back!</h2>
          <p>Enter your credentials and continue your journey to mastering English.</p>
          <p>Placeholder for illustrations, images, or motivational graphics.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
