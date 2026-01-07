import React, { useEffect, useMemo, useState } from 'react';
import PageLayout from '../../Components/PageLayout';
import './Review.css';

const API_BASE = 'http://localhost:5144/api/teacher/reviews';

const buildReviewForm = (item) => {
  const form = {};
  if (!item || !item.responses) return form;
  item.responses.forEach((resp) => {
    form[resp.questionResponseId] = {
      correctedText: resp.aiCorrections || '',
      teacherFeedback: resp.teacherFeedback || resp.aiFeedback || '',
      teacherScore: resp.teacherScore ?? (typeof resp.aiScore === 'number' ? resp.aiScore : ''),
    };
  });
  return form;
};

function Review({ role }) {
  const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewForm, setReviewForm] = useState({});

  const loadReviewQueue = async () => {
    if (!token) return;
    setReviewLoading(true);
    setReviewError('');
    try {
      const res = await fetch(API_BASE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.text()) || 'Unable to load review queue.');
      const data = await res.json();
      const list = Array.isArray(data)
        ? data.map((item) => ({
            id: item.id || item.Id,
            lessonId: item.lessonId || item.LessonId,
            lessonTitle: item.lessonTitle || item.LessonTitle,
            submittedAt: item.submittedAt || item.SubmittedAt,
            studentName: item.studentName || item.StudentName || 'Student',
            responses: (item.responses || item.Responses || []).map((r) => ({
              questionResponseId: r.questionResponseId || r.QuestionResponseId,
              questionId: r.questionId || r.QuestionId,
              type: r.type || r.Type,
              prompt: r.prompt || r.Prompt,
              studentAnswer: r.studentAnswer || r.StudentAnswer,
              aiCorrections: r.aiCorrections || r.AiCorrections,
              aiFeedback: r.aiFeedback || r.AiFeedback,
              aiScore: r.aiScore ?? r.AiScore,
              teacherFeedback: r.teacherFeedback || r.TeacherFeedback,
              teacherScore: r.teacherScore ?? r.TeacherScore,
            })),
          }))
        : [];
      setReviewQueue(list);
      setReviewForm(buildReviewForm(list[0]));
    } catch (err) {
      console.error(err);
      setReviewError(err.message || 'Failed to load review queue.');
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    loadReviewQueue();
  }, []);

  const handleReviewChange = (respId, field, value) => {
    setReviewForm((prev) => ({
      ...prev,
      [respId]: {
        ...(prev[respId] || {}),
        [field]: value,
      },
    }));
  };

  const submitReview = async () => {
    const current = reviewQueue[0];
    if (!current || !token) return;
    setReviewSaving(true);
    setReviewError('');
    try {
      const payload = {
        responses: current.responses.map((r) => {
          const form = reviewForm[r.questionResponseId] || {};
          return {
            questionResponseId: r.questionResponseId,
            correctedText: form.correctedText ?? r.aiCorrections ?? '',
            teacherFeedback: form.teacherFeedback ?? r.aiFeedback ?? '',
            teacherScore: Number.isFinite(Number(form.teacherScore))
              ? Number(form.teacherScore)
              : r.aiScore ?? 0,
          };
        }),
      };

      const res = await fetch(`${API_BASE}/${current.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Failed to submit review.');

      await loadReviewQueue();
    } catch (err) {
      console.error(err);
      setReviewError(err.message || 'Could not complete review.');
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <PageLayout title="Review" role={role}>
      <div className="teacher-review">
        <div className="header-row">
          <div>
            <p className="eyebrow">Feedback queue</p>
            <h1 className="page-title">Review submissions</h1>
            <p className="section-subtitle">
              Adjust AI corrections and scores for writing and speaking responses.
            </p>
          </div>
          <button type="button" className="ghost-btn" onClick={loadReviewQueue} disabled={reviewLoading}>
            Refresh
          </button>
        </div>

        <div className="data-card">
          <div className="data-header">
            <div>
              <h3>Pending reviews</h3>
              <p className="section-subtitle">
                {reviewLoading
                  ? 'Loading…'
                  : `${reviewQueue.length} submission${reviewQueue.length === 1 ? '' : 's'} waiting`}
              </p>
            </div>
          </div>

          {reviewError ? <div className="notice error">{reviewError}</div> : null}

          {reviewLoading ? (
            <div className="table-row muted">
              <div>Loading queue…</div>
            </div>
          ) : reviewQueue.length === 0 ? (
            <div className="table-row muted">
              <div>No pending writing/speaking reviews. 🎉</div>
            </div>
          ) : (
            (() => {
              const item = reviewQueue[0];
              return (
                <div className="review-panel">
                  <div className="review-meta">
                    <div>
                      <p className="eyebrow">Student</p>
                      <h4>{item.studentName}</h4>
                      <p className="muted">Lesson: {item.lessonTitle}</p>
                    </div>
                    <div className="pill tiny">
                      Submitted {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'recently'}
                    </div>
                  </div>

                  <div className="review-questions">
                    {item.responses.map((resp) => {
                      const form = reviewForm[resp.questionResponseId] || {};
                      return (
                        <div className="question-card" key={resp.questionResponseId}>
                          <div className="question-head">
                            <div>
                              <p className="eyebrow">{resp.type}</p>
                              <h4>{resp.prompt}</h4>
                            </div>
                            <span className="chip-small info">
                              AI score: {resp.aiScore != null ? `${resp.aiScore}/10` : '—'}
                            </span>
                          </div>

                          <div className="feedback-block">
                            <h5>Student answer</h5>
                            <p>{resp.studentAnswer}</p>
                            <h5>AI corrections</h5>
                            <p>{resp.aiCorrections || '—'}</p>
                            <p className="muted">{resp.aiFeedback}</p>
                          </div>

                          <div className="form-row">
                            <label>Corrected sentence (teacher)</label>
                            <textarea
                              rows={3}
                              value={form.correctedText ?? ''}
                              onChange={(e) =>
                                handleReviewChange(resp.questionResponseId, 'correctedText', e.target.value)
                              }
                            />
                          </div>
                          <div className="form-row">
                            <label>Feedback to student</label>
                            <textarea
                              rows={3}
                              value={form.teacherFeedback ?? ''}
                              onChange={(e) =>
                                handleReviewChange(resp.questionResponseId, 'teacherFeedback', e.target.value)
                              }
                            />
                          </div>
                          <div className="form-row score-input-row">
                            <label>Final score (0-10)</label>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={1}
                              value={form.teacherScore ?? ''}
                              onChange={(e) =>
                                handleReviewChange(resp.questionResponseId, 'teacherScore', e.target.value)
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="form-actions">
                    <button type="button" className="ghost-btn" onClick={loadReviewQueue} disabled={reviewSaving}>
                      Skip/refresh
                    </button>
                    <button type="button" className="primary-btn" onClick={submitReview} disabled={reviewSaving}>
                      {reviewSaving ? 'Saving…' : 'Submit review'}
                    </button>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default Review;
