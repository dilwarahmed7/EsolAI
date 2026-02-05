import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageLayout from '../../Components/PageLayout';
import Hero from '../../Components/Hero';
import Icon from '../../Components/Icons';
import { useToast } from '../../Components/ToastProvider';
import './Review.css';

const API_BASE = 'http://localhost:5144/api/teacher/reviews';
const HIDE_CHANGES_MARKER = '[HIDE_AI_CHANGES]';

const parseChangesFromFeedback = (aiFeedback) => {
  if (!aiFeedback || typeof aiFeedback !== 'string') return [];
  const marker = 'Changes:';
  const idx = aiFeedback.indexOf(marker);
  if (idx === -1) return [];
  const json = aiFeedback.slice(idx + marker.length).trim();
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildReviewState = (item) => {
  const form = {};
  const hidden = {};
  if (!item || !item.responses) return { form, hidden };
  item.responses.forEach((resp) => {
    const rawFeedback = resp.teacherFeedback || '';
    const hide = rawFeedback.includes(HIDE_CHANGES_MARKER);
    const cleanedFeedback = rawFeedback.replace(HIDE_CHANGES_MARKER, '').trim();
    form[resp.questionResponseId] = {
      correctedText: resp.aiCorrections || '',
      teacherFeedback: cleanedFeedback,
      teacherScore: resp.teacherScore ?? (typeof resp.aiScore === 'number' ? resp.aiScore : ''),
    };
    hidden[resp.questionResponseId] = hide;
  });
  return { form, hidden };
};

function Review({ role }) {
  const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewForm, setReviewForm] = useState({});
  const [hiddenChanges, setHiddenChanges] = useState({});
  const toast = useToast();

  const loadReviewQueue = useCallback(async () => {
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
    const built = buildReviewState(list[0]);
    setReviewForm(built.form);
    setHiddenChanges(built.hidden);
  } catch (err) {
    console.error(err);
    setReviewError(err.message || 'Failed to load review queue.');
    toast.error(err.message || 'Failed to load review queue.');
    } finally {
      setReviewLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    loadReviewQueue();
  }, [loadReviewQueue]);

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
          const hide = hiddenChanges[r.questionResponseId];
          let teacherFeedback = form.teacherFeedback ?? '';
          if (hide) {
            teacherFeedback = teacherFeedback
              ? `${teacherFeedback}\n${HIDE_CHANGES_MARKER}`
              : HIDE_CHANGES_MARKER;
          }
          return {
            questionResponseId: r.questionResponseId,
            correctedText: form.correctedText ?? r.aiCorrections ?? '',
            teacherFeedback,
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
      toast.success('Review submitted.');
    } catch (err) {
      console.error(err);
      setReviewError(err.message || 'Could not complete review.');
      toast.error(err.message || 'Could not complete review.');
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <PageLayout title={null} role={role}>
      <div className="teacher-review">
        <Hero
          variant="teacher"
          eyebrow="Feedback queue"
          title="Review submissions"
          subtitle="Adjust AI corrections and scores for writing and speaking responses."
          icon={<Icon.ClipboardCheck className="icon" />}
          action={
            <button type="button" className="ghost-btn" onClick={loadReviewQueue} disabled={reviewLoading}>
              Refresh
            </button>
          }
        />

        <div className="data-card">
          <div className="data-header">
            <div>
              <h3 className="section-title">
                <span className="section-icon">
                  <Icon.List />
                </span>
                Pending reviews
              </h3>
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
                      const changes = parseChangesFromFeedback(resp.aiFeedback);
                      const hideChanges = hiddenChanges[resp.questionResponseId];
                      const showChanges = !hideChanges && changes.length > 0;
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
                        <div className="feedback-row">
                          <h5>Student answer</h5>
                          <div className="feedback-box">{resp.studentAnswer || 'No answer provided.'}</div>
                        </div>
                        <div className="feedback-row">
                          <h5>Corrected sentence (edit)</h5>
                          <textarea
                            className="feedback-textarea"
                            rows={3}
                            value={form.correctedText ?? ''}
                            onChange={(e) =>
                              handleReviewChange(resp.questionResponseId, 'correctedText', e.target.value)
                            }
                          />
                        </div>
                        <div className="feedback-row">
                          <h5>Feedback to student (edit)</h5>
                          <textarea
                            className="feedback-textarea"
                            rows={3}
                            value={form.teacherFeedback ?? ''}
                            onChange={(e) =>
                              handleReviewChange(resp.questionResponseId, 'teacherFeedback', e.target.value)
                            }
                          />
                        </div>
                        {changes.length > 0 ? (
                          <div className="feedback-row">
                            <div className="change-list">
                              {showChanges
                                ? changes.map((c, idx) => (
                                    <div className="change-row" key={`ai-change-${resp.questionResponseId}-${idx}`}>
                                      <span className="pill tiny">{(c.type || c.Type || 'change').toString()}</span>
                                      <div className="change-body">
                                        <div className="change-from">
                                          <span className="muted">From</span>
                                          <strong>{c.from || c.From || ''}</strong>
                                        </div>
                                        <span className="arrow">→</span>
                                        <div className="change-to">
                                          <span className="muted">To</span>
                                          <strong>{c.to || c.To || ''}</strong>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                : null}
                            </div>
                            <button
                              type="button"
                              className="ghost-btn small"
                              onClick={() =>
                                setHiddenChanges((prev) => ({
                                  ...prev,
                                  [resp.questionResponseId]: !hideChanges,
                                }))
                              }
                            >
                              {hideChanges ? 'Show detected changes' : 'Remove detected changes'}
                            </button>
                          </div>
                        ) : null}
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
