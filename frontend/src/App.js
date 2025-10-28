import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Register from './Pages/Auth/Register';
import Login from './Pages/Auth/Login';

import StudentDashboard from './Pages/Student/StudentDashboard';
import MyLessons from './Pages/Student/MyLessons';
import Progress from './Pages/Student/Progress';
import Practice from './Pages/Student/Practice';

import TeacherDashboard from './Pages/Teacher/TeacherDashboard';
import Lessons from './Pages/Teacher/Lessons';
import Students from './Pages/Teacher/Students';

function App() {
  const [role, setRole] = useState(null);

  // Get role from localStorage and normalize to lowercase
  useEffect(() => {
    const userRole = localStorage.getItem("role"); // "Student" or "Teacher"
    if (userRole) setRole(userRole.toLowerCase()); // store as "student" or "teacher"
  }, []);

  return (
    <Router>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<Login setRole={setRole} />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes for student */}
        {role === "student" && (
          <>
            <Route path="/" element={<StudentDashboard role={role} />} />
            <Route path="/my-lessons" element={<MyLessons role={role} />} />
            <Route path="/practice" element={<Practice role={role} />} />
            <Route path="/progress" element={<Progress role={role} />} />
          </>
        )}

        {/* Protected routes for teacher */}
        {role === "teacher" && (
          <>
            <Route path="/" element={<TeacherDashboard role={role} />} />
            <Route path="/lessons" element={<Lessons role={role} />} />
            <Route path="/students" element={<Students role={role} />} />
          </>
        )}

        {/* Redirect any unknown path */}
        <Route path="*" element={<Navigate to={role ? "/" : "/login"} replace />} />
      </Routes>
    </Router>
  );
}

export default App;
