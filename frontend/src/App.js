import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Student pages
import StudentDashboard from './Pages/Student/StudentDashboard';
import MyLessons from './Pages/Student/MyLessons';
import Progress from './Pages/Student/Progress';

// Teacher pages
import TeacherDashboard from './Pages/Teacher/TeacherDashboard';
import Lessons from './Pages/Teacher/Lessons';
import Students from './Pages/Teacher/Students';

function App() {
  const role = 'teacher'; // switch between 'student' and 'teacher' to test

  return (
    <Router>
      <Routes>
        {role === 'student' ? (
          <>
            <Route path="/" element={<StudentDashboard role={role} />} />
            <Route path="/my-lessons" element={<MyLessons role={role} />} />
            <Route path="/progress" element={<Progress role={role} />} />
          </>
        ) : (
          <>
            <Route path="/" element={<TeacherDashboard role={role} />} />
            <Route path="/lessons" element={<Lessons role={role} />} />
            <Route path="/students" element={<Students role={role} />} />
          </>
        )}
      </Routes>
    </Router>
  );
}

export default App;
