import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '../../Components/PageLayout';
import DataGrid from '../../Components/DataGrid';
import './Students.css';

const API_BASE = 'http://localhost:5144/api/teacher/classes';

function Students({ role }) {
  const [searchParams] = useSearchParams();
  const addClassRef = useRef(null);
  const addStudentRef = useRef(null);
  const menuRefs = useRef({});
  const allowedLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [error, setError] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [showAddClass, setShowAddClass] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });

  const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);
  const requestedClassId = useMemo(() => {
    const val = searchParams.get('classId');
    if (!val) return null;
    const parsed = Number(val);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  useEffect(() => {
    const loadClasses = async () => {
      setLoadingClasses(true);
      setError('');

      if (!token) {
        setError('Please sign in again to manage your classes.');
        setLoadingClasses(false);
        return;
      }

      try {
        const res = await fetch(API_BASE, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error((await res.text()) || 'Unable to load classes.');

        const data = await res.json();
        setClasses(data);
        if (data.length > 0) {
          const firstId = Number(data[0].id || data[0].Id);
          const foundRequested = requestedClassId
            ? data.find((c) => Number(c.id || c.Id) === requestedClassId)
            : null;
          setSelectedClassId(foundRequested ? requestedClassId : firstId);
        }
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to load classes.');
      } finally {
        setLoadingClasses(false);
      }
    };

    loadClasses();
  }, [token, requestedClassId]);

  useEffect(() => {
    if (!requestedClassId || classes.length === 0) return;
    const exists = classes.some((c) => Number(c.id || c.Id) === requestedClassId);
    if (exists) setSelectedClassId(requestedClassId);
  }, [requestedClassId, classes]);

  useEffect(() => {
    const loadStudents = async () => {
      if (!selectedClassId) {
        setStudents([]);
        setShowAddStudent(false);
        setActiveMenu(null);
        return;
      }

      setLoadingStudents(true);
      setError('');

      try {
        const res = await fetch(`${API_BASE}/${selectedClassId}/students`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error((await res.text()) || 'Unable to load students.');

        const data = await res.json();
        const normalized = data.map((s) => ({
          id: s.id || s.Id,
          fullName: s.fullName || s.FullName,
          level: s.level || s.Level || '',
          averageScore: typeof s.averageScore === 'number' ? s.averageScore : null,
        }));

        setStudents(normalized);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to load students.');
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudents();
  }, [selectedClassId, token]);

  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    setError('');
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newClassName.trim() }),
      });

      if (!res.ok) throw new Error((await res.text()) || 'Could not create class.');

      const created = await res.json();
      setClasses((prev) => [...prev, created]);
      setSelectedClassId(Number(created.id || created.Id));
      setNewClassName('');
      setShowAddClass(false);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create class.');
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!selectedClassId || !newStudentEmail.trim()) return;

    setError('');
    try {
      const res = await fetch(`${API_BASE}/${selectedClassId}/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: newStudentEmail.trim() }),
      });

      if (!res.ok) throw new Error((await res.text()) || 'Could not add student.');

      setNewStudentEmail('');
      setShowAddStudent(false);
      // Refresh students after adding
      const reload = await fetch(`${API_BASE}/${selectedClassId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reload.ok) {
        const data = await reload.json();
        const normalized = data.map((s) => ({
          id: s.id || s.Id,
          fullName: s.fullName || s.FullName,
          level: s.level || s.Level || '',
          averageScore: typeof s.averageScore === 'number' ? s.averageScore : null,
        }));
        setStudents(normalized);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to add student.');
    }
  };

  const handleRemoveStudent = async (studentId) => {
    if (!selectedClassId) return;
    const confirm = window.confirm('Remove this student from the class?');
    if (!confirm) return;

    setError('');
    try {
      const res = await fetch(`${API_BASE}/${selectedClassId}/students/${studentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error((await res.text()) || 'Could not remove student.');

      setStudents((prev) => prev.filter((s) => s.id !== studentId));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to remove student.');
    }
  };

  const handleUpdateLevel = async (studentId, nextLevel, currentLevel) => {
    const trimmed = (nextLevel || '').trim().toUpperCase();
    if (!trimmed || trimmed === currentLevel) return;
    if (!allowedLevels.includes(trimmed)) return;

    setError('');
    try {
      const res = await fetch(`${API_BASE}/students/${studentId}/level`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ level: trimmed }),
      });

      if (!res.ok) throw new Error((await res.text()) || 'Could not update level.');

      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, level: trimmed } : s)),
      );
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to update level.');
    }
  };

  const filteredStudents = students.filter((s) => {
    return s;
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    const dir = sort.direction === 'asc' ? 1 : -1;
    if (sort.key === 'name') {
      return a.fullName.localeCompare(b.fullName) * dir;
    }
    if (sort.key === 'level') {
      return (a.level || '').localeCompare(b.level || '') * dir;
    }
    if (sort.key === 'score') {
      const aScore = typeof a.averageScore === 'number' ? a.averageScore : -Infinity;
      const bScore = typeof b.averageScore === 'number' ? b.averageScore : -Infinity;
      if (aScore === bScore) return 0;
      return aScore > bScore ? dir : -dir;
    }
    return 0;
  });

  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  useEffect(() => {
    const handleClickAway = (e) => {
      if (showAddClass && addClassRef.current && !addClassRef.current.contains(e.target)) {
        setShowAddClass(false);
      }
      if (showAddStudent && addStudentRef.current && !addStudentRef.current.contains(e.target)) {
        setShowAddStudent(false);
      }
      if (activeMenu) {
        const menuNode = menuRefs.current[activeMenu];
        if (!menuNode || !menuNode.contains(e.target)) {
          setActiveMenu(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [showAddClass, showAddStudent, activeMenu]);

  const noClasses = !loadingClasses && classes.length === 0;

  return (
    <PageLayout title="Students" role={role}>
      <div className="teacher-students">
        <div className="header-row">
          <div>
            <p className="eyebrow">Manage cohorts</p>
            <h2 className="page-title">Classes and students</h2>
            <p className="section-subtitle">
              Create classes, add students, and keep levels up to date.
            </p>
          </div>
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {noClasses ? (
          <div className="empty-card">
            <p>You have no classes yet. Create your first class to start adding students.</p>
            <form className="inline-form" onSubmit={handleCreateClass}>
              <input
                type="text"
                placeholder="Class name (e.g., A2 Morning Group)"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                required
              />
              <button type="submit" className="primary-btn" disabled={!newClassName.trim()}>
                Create class
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="controls">
              <div className="control-group">
                <label htmlFor="class-select">Class</label>
                <select
                  id="class-select"
                  value={selectedClassId || ''}
                  onChange={(e) => setSelectedClassId(Number(e.target.value))}
                >
                  {classes.map((c) => (
                    <option key={c.id || c.Id} value={c.id || c.Id}>
                      {c.name || c.Name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="add-actions">
                <div className="dropdown" ref={addClassRef}>
                  <button
                    type="button"
                    className="primary-btn wide"
                    onClick={() => {
                      setShowAddClass((v) => !v);
                      setShowAddStudent(false);
                    }}
                  >
                    + Add class
                  </button>
                  {showAddClass ? (
                    <form className="dropdown-panel" onSubmit={handleCreateClass}>
                      <input
                        type="text"
                        placeholder="Class name"
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        required
                      />
                      <div className="panel-actions">
                        <button type="submit" className="primary-btn" disabled={!newClassName.trim()}>
                          Save
                        </button>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => setShowAddClass(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>

                <div className="dropdown" ref={addStudentRef}>
                  <button
                    type="button"
                    className="ghost-btn wide"
                    onClick={() => {
                      setShowAddStudent((v) => !v);
                      setShowAddClass(false);
                    }}
                    disabled={!selectedClassId}
                  >
                    + Add student
                  </button>
                  {showAddStudent ? (
                    <form className="dropdown-panel" onSubmit={handleAddStudent}>
                      <input
                        type="email"
                        placeholder="Student email"
                        value={newStudentEmail}
                        onChange={(e) => setNewStudentEmail(e.target.value)}
                        required
                      />
                      <div className="panel-actions">
                        <button
                          type="submit"
                          className="primary-btn"
                          disabled={!newStudentEmail.trim()}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => setShowAddStudent(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="data-card">
              <div className="data-header">
                <div>
                  <h3>Students</h3>
                  <p className="section-subtitle">
                    {loadingStudents
                      ? 'Loading students…'
                      : `${sortedStudents.length} student${sortedStudents.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="sort-buttons">
                  <button
                    type="button"
                    className={`ghost-btn small ${sort.key === 'name' ? 'active' : ''}`}
                    onClick={() => toggleSort('name')}
                  >
                    Name {sort.key === 'name' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                  </button>
                  <button
                    type="button"
                    className={`ghost-btn small ${sort.key === 'level' ? 'active' : ''}`}
                    onClick={() => toggleSort('level')}
                  >
                    Level {sort.key === 'level' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                  </button>
                  <button
                    type="button"
                    className={`ghost-btn small ${sort.key === 'score' ? 'active' : ''}`}
                    onClick={() => toggleSort('score')}
                  >
                    Avg score {sort.key === 'score' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </div>
              </div>

              <DataGrid
                loading={loadingStudents}
                emptyMessage="No students found for this class."
                columns={[
                  { title: 'Name', width: '1.8fr' },
                  { title: 'Average score', align: 'center', width: '1fr' },
                  { title: 'Level', align: 'center', width: '1fr' },
                  { title: 'Actions', align: 'right', width: '0.9fr' },
                ]}
                rows={sortedStudents.map((student) => ({
                  key: student.id,
                  cells: [
                    <div className="cell-strong">{student.fullName}</div>,
                    typeof student.averageScore === 'number' ? `${student.averageScore}%` : 'Not set',
                    student.level || 'N/A',
                    <div className="table-actions">
                      <div
                        className="menu-wrapper"
                        ref={(node) => {
                          if (node) {
                            menuRefs.current[student.id] = node;
                          } else {
                            delete menuRefs.current[student.id];
                          }
                        }}
                      >
                        <button
                          type="button"
                          className="ghost-btn small"
                          onClick={() =>
                            setActiveMenu((prev) => (prev === student.id ? null : student.id))
                          }
                        >
                          ⋯
                        </button>
                        {activeMenu === student.id ? (
                          <div className="menu-panel">
                            <div className="menu-section-title">Set level</div>
                            <div className="menu-levels">
                              {allowedLevels.map((lvl) => (
                                <button
                                  type="button"
                                  key={lvl}
                                  className={`level-chip ${
                                    (student.level || '').toUpperCase() === lvl ? 'active' : ''
                                  }`}
                                  onClick={() => {
                                    setActiveMenu(null);
                                    handleUpdateLevel(student.id, lvl, student.level);
                                  }}
                                >
                                  {lvl}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                setActiveMenu(null);
                                handleRemoveStudent(student.id);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>,
                  ],
                }))}
              />
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default Students;
