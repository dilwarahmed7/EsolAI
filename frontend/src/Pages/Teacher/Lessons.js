import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '../../Components/PageLayout';
import DataGrid from '../../Components/DataGrid';
import Hero from '../../Components/Hero';
import Icon from '../../Components/Icons';
import { useToast } from '../../Components/ToastProvider';
import CreateLessonDialog from './Dialogs/CreateLessonDialog';
import './Lessons.css';

const API_BASE = 'http://localhost:5144/api/teacher';
const PAGE_SIZE = 10;

function Lessons({ role }) {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);
  const autoOpenRef = useRef(false);
  const autoEditRef = useRef(null);
  const formatDate = (raw) => {
    if (!raw) return 'No due date';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'No due date';
    return d.toLocaleDateString();
  };

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [error, setError] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create');
  const [activeLessonId, setActiveLessonId] = useState(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [activeMenu, setActiveMenu] = useState(null);
  const menuRefs = useRef({});
  const toast = useToast();

  useEffect(() => {
    if (!token) {
      setError('Please sign in again to view classes.');
      setLoadingClasses(false);
      return;
    }

    const loadClasses = async () => {
      setLoadingClasses(true);
      try {
        const res = await fetch(`${API_BASE}/classes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()) || 'Unable to load classes.');
        const data = await res.json();
        setClasses(data);
        if (data.length > 0) setSelectedClassId(Number(data[0].id || data[0].Id));
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to load classes.');
      } finally {
        setLoadingClasses(false);
      }
    };

    loadClasses();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const loadLessons = async () => {
      setLoadingLessons(true);
      setError('');
      try {
        const params = selectedClassId ? `?classId=${selectedClassId}` : '';
        const res = await fetch(`${API_BASE}/lessons${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()) || 'Unable to load lessons.');
        const data = await res.json();
        setLessons(Array.isArray(data) ? data : []);
        setPage(1);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to load lessons.');
      } finally {
        setLoadingLessons(false);
      }
    };

    loadLessons();
  }, [token, selectedClassId]);

  useEffect(() => {
    const handleClickAway = (e) => {
      if (activeMenu) {
        const node = menuRefs.current[activeMenu];
        if (!node || !node.contains(e.target)) {
          setActiveMenu(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [activeMenu]);

  const openCreateDialog = useCallback(() => {
    setDialogMode('create');
    setActiveLessonId(null);
    setIsDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((lessonId) => {
    setDialogMode('edit');
    setActiveLessonId(lessonId);
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    setDialogMode('create');
    setActiveLessonId(null);
  }, []);

  useEffect(() => {
    const wantsCreate = searchParams.get('create');
    const wantsEdit = searchParams.get('edit');
    if (wantsEdit) return;
    if (!wantsCreate || autoOpenRef.current) return;
    if (loadingClasses) return;

    autoOpenRef.current = true;
    openCreateDialog();
  }, [searchParams, loadingClasses, openCreateDialog]);

  useEffect(() => {
    const wantsEdit = searchParams.get('edit');
    if (!wantsEdit) return;
    if (!token) return;
    if (loadingLessons) return;
    if (autoEditRef.current === wantsEdit) return;

    autoEditRef.current = wantsEdit;
    const parsedId = Number(wantsEdit);
    openEditDialog(Number.isFinite(parsedId) ? parsedId : wantsEdit);
  }, [openEditDialog, searchParams, token, loadingLessons]);

  const reloadLessons = async (currentSelected) => {
    const params = currentSelected ? `?classId=${currentSelected}` : '';
    const res = await fetch(`${API_BASE}/lessons${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLessons(Array.isArray(data) ? data : []);
      setPage(1);
    }
  };

  const handleArchive = async (lessonId) => {
    if (!window.confirm('Archive this lesson?')) return;
    setError('');
    try {
      const res = await fetch(`${API_BASE}/lessons/${lessonId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 2 }),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Could not archive lesson.');
      setLessons((prev) => prev.filter((l) => (l.id || l.Id) !== lessonId));
      toast.success('Lesson archived.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to archive lesson.');
      toast.error(err.message || 'Failed to archive lesson.');
    }
  };

  const handleDeleteDraft = async (lessonId) => {
    if (!window.confirm('Delete this draft permanently? This cannot be undone.')) return;
    setError('');
    try {
      const res = await fetch(`${API_BASE}/lessons/${lessonId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.text()) || 'Could not delete draft lesson.');
      setLessons((prev) => prev.filter((l) => (l.id || l.Id) !== lessonId));
      toast.success('Draft lesson deleted.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete draft lesson.');
      toast.error(err.message || 'Failed to delete draft lesson.');
    }
  };

  const filteredLessons = lessons
    .filter((lesson) => {
      const status = (lesson.status || lesson.Status || '').toString().toLowerCase();
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      return true;
    })
    .filter((lesson) => {
      if (!searchQuery.trim()) return true;
      const name = (lesson.title || lesson.Title || '').toLowerCase();
      return name.includes(searchQuery.trim().toLowerCase());
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') {
        return (a.title || a.Title || '').localeCompare(b.title || b.Title || '') * dir;
      }
      if (sortKey === 'due') {
        const aDue = a.dueDate || a.DueDate;
        const bDue = b.dueDate || b.DueDate;
        const aTime = aDue ? new Date(aDue).getTime() : Infinity;
        const bTime = bDue ? new Date(bDue).getTime() : Infinity;
        if (aTime === bTime) return 0;
        return aTime > bTime ? dir : -dir;
      }
      if (sortKey === 'created') {
        const aCreated = a.createdAt || a.CreatedAt;
        const bCreated = b.createdAt || b.CreatedAt;
        const aTime = aCreated ? new Date(aCreated).getTime() : null;
        const bTime = bCreated ? new Date(bCreated).getTime() : null;
        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;
        if (aTime === bTime) return 0;
        return aTime > bTime ? dir : -dir;
      }
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filteredLessons.length / PAGE_SIZE));
  const startIdx = (page - 1) * PAGE_SIZE;
  const currentPageLessons = filteredLessons.slice(startIdx, startIdx + PAGE_SIZE);
  const lessonCounts = useMemo(() => {
    const counts = { total: lessons.length, draft: 0, published: 0, archived: 0 };
    lessons.forEach((lesson) => {
      const status = (lesson.status || lesson.Status || '').toLowerCase();
      if (status === 'draft') counts.draft += 1;
      if (status === 'published') counts.published += 1;
      if (status === 'archived') counts.archived += 1;
    });
    return counts;
  }, [lessons]);
  const nextDueLabel = useMemo(() => {
    const dueDates = lessons
      .map((lesson) => lesson.dueDate || lesson.DueDate)
      .filter(Boolean)
      .map((raw) => new Date(raw))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a - b);

    if (!dueDates.length) return 'No upcoming due date';
    return formatDate(dueDates[0]);
  }, [lessons]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created' ? 'desc' : 'asc');
    }
    setPage(1);
  };


  return (
    <PageLayout title={null} role={role}>
      <div className="teacher-lessons">
        <Hero
          eyebrow="Plan ahead"
          title="Lessons"
          subtitle="Create, assign, and track lessons across your classes."
          variant="teacher"
          icon={<Icon.BookOpen className="icon" />}
          meta={[
            {
              label: `${lessonCounts.total} total`,
              icon: <Icon.List className="mini-icon" />,
            },
            {
              label: `${lessonCounts.published} published`,
              tone: 'ghost',
              icon: <Icon.CheckCircle className="mini-icon" />,
            },
            {
              label: `Next due: ${nextDueLabel}`,
              tone: 'subtle',
              icon: <Icon.Calendar className="mini-icon" />,
            },
          ]}
          action={
            <button type="button" className="dash-button primary" onClick={openCreateDialog}>
              + Create new lesson
            </button>
          }
        />

        {error ? <div className="notice error">{error}</div> : null}

        <div className="controls">
          <div className="control-group">
            <label htmlFor="class-select">Class</label>
            <select
              id="class-select"
              value={selectedClassId || ''}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
              disabled={loadingClasses || classes.length === 0}
            >
              {classes.map((c) => (
                <option key={c.id || c.Id} value={c.id || c.Id}>
                  {c.name || c.Name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="data-card">
          <div className="data-header">
            <div>
              <h3 className="section-title">
                <span className="section-icon">
                  <Icon.List className="icon" />
                </span>
                Lessons
              </h3>
              <p className="section-subtitle">
                {loadingLessons
                  ? 'Loading lessons…'
                  : `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="filter-row">
              <input
                type="text"
                className="status-select filter-input"
                placeholder="Search by lesson name"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
              <button
                type="button"
                className={`ghost-btn small ${sortKey === 'name' ? 'active' : ''}`}
                onClick={() => toggleSort('name')}
              >
                Name {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button
                type="button"
                className={`ghost-btn small ${sortKey === 'created' ? 'active' : ''}`}
                onClick={() => toggleSort('created')}
              >
                Creation date {sortKey === 'created' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button
                type="button"
                className={`ghost-btn small ${sortKey === 'due' ? 'active' : ''}`}
                onClick={() => toggleSort('due')}
              >
                Due date {sortKey === 'due' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <select
                className="status-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

            <div className="table">
            <DataGrid
              loading={loadingLessons}
              emptyMessage="No lessons found for this class."
              className="lessons-grid"
              columns={[
              {
                title: (
                  <span className="col-title">
                    <Icon.BookOpen className="col-icon" />
                    Name
                  </span>
                ),
                width: '1.6fr',
              },
              {
                title: (
                  <span className="col-title">
                    <Icon.Calendar className="col-icon" />
                    Due date
                  </span>
                ),
                align: 'center',
                width: '0.9fr',
              },
              {
                title: (
                  <span className="col-title">
                    <Icon.Signal className="col-icon" />
                    Status
                  </span>
                ),
                align: 'center',
                width: '0.9fr',
              },
              {
                title: (
                  <span className="col-title">
                    <Icon.Ellipsis className="col-icon" />
                    Actions
                  </span>
                ),
                align: 'right',
                width: '0.8fr',
              },
              ]}
              rows={currentPageLessons.map((lesson) => {
                const id = lesson.id || lesson.Id;
                const due = lesson.dueDate || lesson.DueDate;
                const status = lesson.status || lesson.Status;
                return {
                  key: id,
                  onDoubleClick: () => openEditDialog(id),
                  cells: [
                    <div className="cell-strong lesson-title">
                      <span className="lesson-title-icon">
                        <Icon.BookOpen />
                      </span>
                      <span>{lesson.title || lesson.Title}</span>
                    </div>,
                    due ? new Date(due).toLocaleDateString() : 'No due date',
                    <div className={`status-pill center ${status?.toLowerCase()}`}>{status}</div>,
                    <div className="table-actions">
                      <div
                        className="menu-wrapper"
                        ref={(node) => {
                          if (node) {
                            menuRefs.current[id] = node;
                          } else {
                            delete menuRefs.current[id];
                          }
                        }}
                      >
                        <button
                          type="button"
                          className="ghost-btn small"
                          onClick={() => setActiveMenu((prev) => (prev === id ? null : id))}
                        >
                          ⋯
                        </button>
                        {activeMenu === id ? (
                          <div className="menu-panel">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenu(null);
                                openEditDialog(id);
                              }}
                            >
                              Edit lesson
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                setActiveMenu(null);
                                (String(status || '').toLowerCase() === 'draft'
                                  ? handleDeleteDraft
                                  : handleArchive)(id);
                              }}
                            >
                              {String(status || '').toLowerCase() === 'draft' ? 'Delete draft' : 'Archive'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>,
                  ],
                };
              })}
            />
          </div>

          {totalPages > 1 ? (
            <div className="pagination">
              <button
                type="button"
                className="ghost-btn small"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span className="page-indicator">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="ghost-btn small"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <CreateLessonDialog
        isOpen={isDialogOpen}
        mode={dialogMode}
        lessonId={activeLessonId}
        classes={classes}
        selectedClassId={selectedClassId}
        token={token}
        onClose={closeDialog}
        onSaved={() => reloadLessons(selectedClassId)}
        onError={setError}
      />
    </PageLayout>
  );
}

export default Lessons;
