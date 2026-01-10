import React, { useEffect, useMemo, useRef, useState } from 'react';
import PageLayout from '../../Components/PageLayout';
import Hero from '../../Components/Hero';
import DataGrid from '../../Components/DataGrid';
import './MyLessons.css';

const API_BASE = 'http://localhost:5144/api/student/lessons';
const FALLBACK_OUT_OF = 22;

const formatDate = (raw) => {
  if (!raw) return 'No due date';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString();
};

const normalizeLesson = (lesson) => {
  const scoreOutOf = lesson.scoreOutOf || lesson.ScoreOutOf || FALLBACK_OUT_OF;
  const active = lesson.activeAttempt || lesson.ActiveAttempt;
  const latest = lesson.latestAttempt || lesson.LatestAttempt;
  const original = lesson.originalAttempt || lesson.OriginalAttempt;
  const retry = lesson.retryAttempt || lesson.RetryAttempt;
  const retryAllowed = lesson.retryAllowed ?? lesson.RetryAllowed ?? false;

  const normalizeAttempt = (raw) => {
    if (!raw) return null;
    return {
      attemptId: raw.attemptId || raw.AttemptId,
      submittedAt: raw.submittedAt || raw.SubmittedAt,
      readingScore: raw.readingScore ?? raw.ReadingScore ?? 0,
      writingScore: raw.writingScore ?? raw.WritingScore ?? 0,
      speakingScore: raw.speakingScore ?? raw.SpeakingScore ?? 0,
      totalScore: raw.totalScore ?? raw.TotalScore ?? 0,
      reviewStatus: raw.reviewStatus || raw.ReviewStatus || 'Pending',
      needsTeacherReview: raw.needsTeacherReview ?? raw.NeedsTeacherReview ?? false,
      teacherReviewCompleted: raw.teacherReviewCompleted ?? raw.TeacherReviewCompleted ?? false,
    };
  };

  return {
    id: lesson.id || lesson.Id,
    title: lesson.title || lesson.Title,
    dueDate: lesson.dueDate || lesson.DueDate,
    status: lesson.status || lesson.Status,
    scoreOutOf,
    retryAllowed,
    originalAttempt: normalizeAttempt(original),
    retryAttempt: normalizeAttempt(retry),
    activeAttempt: active
      ? {
          attemptId: active.attemptId || active.AttemptId,
          startedAt: active.startedAt || active.StartedAt,
        }
      : null,
    latestAttempt: normalizeAttempt(latest),
  };
};

const computeStatus = (lesson) => {
  if (lesson.latestAttempt) return 'Completed';
  const due = lesson.dueDate;
  const dueTime = due ? new Date(due).getTime() : NaN;
  if (!Number.isNaN(dueTime) && dueTime < Date.now()) return 'Late';
  return 'Active';
};

const mapQuestionsFromDetail = (detail) => detail?.Questions || detail?.questions || [];
const mapAttemptMeta = (detail) => detail?.Attempt || detail?.attempt || {};
const mapLessonMeta = (detail) => detail?.Lesson || detail?.lesson || {};

const buildResponseState = (detail) => {
  const questions = mapQuestionsFromDetail(detail);
  const initial = {};
  questions.forEach((q) => {
    const resp = q.Response || q.response;
    const key = q.Id || q.id;
    const type = q.Type || q.type;
    if (type === 'Reading') {
      initial[key] = {
        selectedOptionId: resp?.SelectedOptionId ?? resp?.selectedOptionId ?? null,
      };
    } else {
      initial[key] = {
        responseText: resp?.ResponseText ?? resp?.responseText ?? '',
      };
    }
  });
  return initial;
};

const parseAiChanges = (text) => {
  if (!text) return [];
  const marker = 'Changes:';
  const idx = text.indexOf(marker);
  if (idx === -1) return [];
  const jsonPart = text.slice(idx + marker.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const stripChangesText = (text) => {
  if (!text) return '';
  const idx = text.indexOf('Changes:');
  return idx === -1 ? text : text.slice(0, idx).trim();
};

const Icon = ({ children, className = '' }) => (
  <svg
    className={`icon ${className}`.trim()}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const parseChangeLines = (text) => {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const startIdx = lines.findIndex((l) => l.toLowerCase().includes('changes detected'));
  if (startIdx === -1) return [];

  const results = [];
  const changeLineRegex =
    /^(?:\d+\.\s*)?\(?([^)]+?)\)?\s*['"“”]?(.*?)['"“”]?\s*(?:→|->)\s*['"“”]?(.*?)['"“”]?$/;

  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(changeLineRegex);
    if (match) {
      results.push({
        type: match[1].replace(/^\(/, '').replace(/\)$/, ''),
        from: match[2],
        to: match[3],
      });
      continue;
    }

    const arrowIdx = line.indexOf('→') !== -1 ? line.indexOf('→') : line.indexOf('->');
    if (arrowIdx !== -1) {
      const left = line.slice(0, arrowIdx).replace(/^\d+\.\s*/, '').trim().replace(/['"“”]/g, '');
      const right = line.slice(arrowIdx + (line.includes('→') ? 1 : 2)).trim().replace(/['"“”]/g, '');
      if (left || right) {
        results.push({
          type: 'change',
          from: left,
          to: right,
        });
      }
    }
  }

  return results;
};

const changesFromFeedback = (feedback) => {
  if (!feedback) return [];
  const raw = feedback.changes ?? feedback.Changes ?? null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
    }
  }

  const combinedText =
    (feedback.TeacherFeedback || feedback.teacherFeedback || '') +
    '\n' +
    (feedback.AiFeedback || feedback.aiFeedback || '') +
    '\n' +
    (feedback.AiCorrections || feedback.aiCorrections || '');

  const jsonChanges = parseAiChanges(combinedText);
  if (jsonChanges.length > 0) return jsonChanges;

  return parseChangeLines(combinedText);
};

const deriveScores = (detail) => {
  if (!detail) return { reading: 0, writing: 0, speaking: 0, total: null };
  const attemptMeta = mapAttemptMeta(detail) || {};
  const questions = mapQuestionsFromDetail(detail);

  let reading = 0;
  let writing = null;
  let speaking = null;

  questions.forEach((q) => {
    const resp = q.Response || q.response;
    if (!resp) return;
    const type = q.Type || q.type;
    if (type === 'Reading') {
      const score = Number(resp.Score ?? resp.score ?? 0);
      reading += Number.isFinite(score) ? score : 0;
    } else if (type === 'Writing') {
      const feedback = resp.Feedback || resp.feedback || {};
      const teacherScore = feedback.TeacherScore ?? feedback.teacherScore;
      const score = Number(
        teacherScore ?? resp.AiScore ?? resp.aiScore ?? resp.Score ?? resp.score ?? attemptMeta.WritingScore ?? attemptMeta.writingScore ?? 0
      );
      if (Number.isFinite(score)) writing = (writing ?? 0) + score;
    } else if (type === 'Speaking') {
      const feedback = resp.Feedback || resp.feedback || {};
      const teacherScore = feedback.TeacherScore ?? feedback.teacherScore;
      const score = Number(
        teacherScore ?? resp.AiScore ?? resp.aiScore ?? resp.Score ?? resp.score ?? attemptMeta.SpeakingScore ?? attemptMeta.speakingScore ?? 0
      );
      if (Number.isFinite(score)) speaking = (speaking ?? 0) + score;
    }
  });

  if (writing === null) writing = attemptMeta.WritingScore ?? attemptMeta.writingScore ?? 0;
  if (speaking === null) speaking = attemptMeta.SpeakingScore ?? attemptMeta.speakingScore ?? 0;

  const total = Number.isFinite(reading + writing + speaking)
    ? reading + writing + speaking
    : attemptMeta.TotalScore ?? attemptMeta.totalScore ?? null;

  return { reading, writing, speaking, total };
};

function MyLessons({ role }) {
  const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [attemptDetail, setAttemptDetail] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
  const [responses, setResponses] = useState({});
  const [modalMode, setModalMode] = useState('work');
  const [selectedFeedbackAttempt, setSelectedFeedbackAttempt] = useState('original');
  const [loadingAttempt, setLoadingAttempt] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attemptMessage, setAttemptMessage] = useState('');

  const [micError, setMicError] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const listeningQuestionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError('Microphone capture is not available in this browser.');
      return () => {};
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      if (!listeningQuestionRef.current) return;
      const last = event.results[event.results.length - 1];
      const chunk = last[0].transcript;
      const questionId = listeningQuestionRef.current;

      setResponses((prev) => {
        const existing = prev[questionId]?.responseText || '';
        return {
          ...prev,
          [questionId]: {
            ...(prev[questionId] || {}),
            responseText: `${existing} ${chunk}`.trim(),
          },
        };
      });
    };

    recognition.onerror = () => {
      setMicError('Mic error. Please check permissions and try again.');
      setListening(false);
      listeningQuestionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      listeningQuestionRef.current = null;
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.stop();
    };
  }, []);

  const refreshLessons = async () => {
    try {
      const res = await fetch(API_BASE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setLessons(Array.isArray(data) ? data.map(normalizeLesson) : []);
    } catch {
      // ignore refresh errors
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setError('Please sign in again.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const res = await fetch(API_BASE, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()) || 'Unable to load lessons.');

        const data = await res.json();
        const normalized = Array.isArray(data) ? data.map(normalizeLesson) : [];
        setLessons(normalized);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to load lessons.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  const rows = lessons.map((lesson) => ({
    ...lesson,
    computedStatus: computeStatus(lesson),
  }));

  const activeRows = rows.filter((r) => r.computedStatus !== 'Completed');
  const completedRows = rows.filter((r) => r.computedStatus === 'Completed');
  const nextDueLabel = useMemo(() => {
    const dueDates = activeRows
      .map((lesson) => lesson.dueDate)
      .filter(Boolean)
      .map((raw) => new Date(raw))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a - b);

    if (!dueDates.length) return 'No upcoming due date';
    return formatDate(dueDates[0]);
  }, [activeRows]);

  const stopListening = () => {
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
    }
  };

  const closeModal = () => {
    stopListening();
    setAttemptDetail(null);
    setResponses({});
    setActiveLesson(null);
    setModalMode('work');
    setSelectedFeedbackAttempt('original');
    setAttemptMessage('');
    setMicError('');
  };

  const fetchAttemptDetail = async (lessonId, attemptId, forceFeedback = false) => {
    setAttemptMessage('');
    const res = await fetch(`${API_BASE}/${lessonId}/attempts/${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await res.text()) || 'Could not load attempt.');
    const data = await res.json();
    setAttemptDetail(data);
    setResponses(buildResponseState(data));
    const attemptMeta = mapAttemptMeta(data);
    const submittedAt = attemptMeta.submittedAt || attemptMeta.SubmittedAt;
    setModalMode(forceFeedback || submittedAt ? 'feedback' : 'work');
  };

  const openAttempt = async (lesson, attemptId = null, viewFeedback = false) => {
    if (!lesson) return;
    if (!token) {
      setError('Please sign in again.');
      return;
    }

    setLoadingAttempt(true);
    setError('');
    setActiveLesson(lesson);
    try {
      let targetAttemptId = attemptId || lesson?.activeAttempt?.attemptId;
      let startedAt = lesson?.activeAttempt?.startedAt;

      if (viewFeedback) {
        if (lesson?.originalAttempt?.attemptId) {
          targetAttemptId = lesson.originalAttempt.attemptId;
          setSelectedFeedbackAttempt('original');
        } else if (lesson?.retryAttempt?.attemptId) {
          targetAttemptId = lesson.retryAttempt.attemptId;
          setSelectedFeedbackAttempt('retry');
        }
      }

      if (!targetAttemptId && !viewFeedback) {
        const startRes = await fetch(`${API_BASE}/${lesson.id}/start`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!startRes.ok) throw new Error((await startRes.text()) || 'Could not start lesson.');
        const startData = await startRes.json();
        targetAttemptId = startData.attemptId || startData.AttemptId;
        startedAt = startData.startedAt || startData.StartedAt;

        if (targetAttemptId) {
          setLessons((prev) =>
            prev.map((l) =>
              l.id === lesson.id
                ? { ...l, activeAttempt: { attemptId: targetAttemptId, startedAt } }
                : l
            )
          );
        }
      }

      if (!targetAttemptId) throw new Error('No attempt found for this lesson yet.');

      setActiveLesson(lesson);
      await fetchAttemptDetail(lesson.id, targetAttemptId, viewFeedback);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to open lesson.');
      closeModal();
    } finally {
      setLoadingAttempt(false);
    }
  };

  const handleAnswerChange = (questionId, payload) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        ...payload,
      },
    }));
  };

  const buildSubmissionPayload = () => {
    if (!attemptDetail) return [];
    const questions = mapQuestionsFromDetail(attemptDetail);
    return questions.map((q) => {
      const key = q.Id || q.id;
      const type = q.Type || q.type;
      const state = responses[key] || {};
      return {
        lessonQuestionId: key,
        selectedOptionId: type === 'Reading' ? state.selectedOptionId ?? null : null,
        responseText: type === 'Reading' ? null : state.responseText || '',
      };
    });
  };

  const handleSaveForLater = async () => {
    if (!attemptDetail) return;
    const attemptMeta = mapAttemptMeta(attemptDetail);
    const lessonMeta = mapLessonMeta(attemptDetail);
    const lessonId = lessonMeta.Id || lessonMeta.id || activeLesson?.id;
    const attemptId = attemptMeta.AttemptId || attemptMeta.attemptId || attemptMeta.Id;

    setAttemptMessage('');
    setSavingProgress(true);
    try {
      const payload = {
        attemptId,
        responses: buildSubmissionPayload(),
      };
      const res = await fetch(`${API_BASE}/${lessonId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Could not save progress.');
      setAttemptMessage('Progress saved. You can continue later from the lessons list.');
      await fetchAttemptDetail(lessonId, attemptId, false);
      await refreshLessons();
      closeModal();
    } catch (err) {
      console.error(err);
      setAttemptMessage(err.message || 'Failed to save progress.');
    } finally {
      setSavingProgress(false);
    }
  };

  const handleSubmit = async () => {
    if (!attemptDetail) return;
    const attemptMeta = mapAttemptMeta(attemptDetail);
    const lessonMeta = mapLessonMeta(attemptDetail);
    const lessonId = lessonMeta.Id || lessonMeta.id || activeLesson?.id;
    const attemptId = attemptMeta.AttemptId || attemptMeta.attemptId || attemptMeta.Id;

    const responsesPayload = buildSubmissionPayload();
    const questions = mapQuestionsFromDetail(attemptDetail);

    const missing = questions.find((q, idx) => {
      const type = q.Type || q.type;
      const resp = responsesPayload[idx];
      if (type === 'Reading') return !resp.selectedOptionId;
      return !(resp.responseText && resp.responseText.trim());
    });

    if (missing) {
      setAttemptMessage('Please answer every question before submitting.');
      return;
    }

    setAttemptMessage('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/${lessonId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ attemptId, responses: responsesPayload }),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Could not submit attempt.');
      const data = await res.json();
      setAttemptDetail(data);
      setResponses(buildResponseState(data));
      setModalMode('feedback');
      setAttemptMessage('Submitted! Instant feedback is ready below.');
      await refreshLessons();
    } catch (err) {
      console.error(err);
      setAttemptMessage(err.message || 'Failed to submit attempt.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMic = (questionId) => {
    setMicError('');
    if (!recognitionRef.current) {
      setMicError('Mic not available in this browser.');
      return;
    }

    if (listening && listeningQuestionRef.current === questionId) {
      recognitionRef.current.stop();
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
    }

    listeningQuestionRef.current = questionId;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (err) {
      console.error(err);
      setMicError('Unable to start microphone.');
    }
  };

  const renderQuestion = (q) => {
    const key = q.Id || q.id;
    const type = q.Type || q.type;
    const resp = q.Response || q.response;
    const inFeedback = modalMode === 'feedback';
    const answerOptions = q.AnswerOptions || q.answerOptions || [];
    const correctOptionId = q.CorrectOptionId || q.correctOptionId || null;

    if (type === 'Reading') {
      const selected = responses[key]?.selectedOptionId ?? null;
      return (
        <div className="question-card" key={key}>
          <div className="question-head">
            <div>
              <p className="eyebrow">Reading</p>
              <h4>{q.Prompt || q.prompt}</h4>
            </div>
            {inFeedback && resp ? (
              <span className={`chip-small ${resp.IsCorrect || resp.isCorrect ? 'success' : 'danger'}`}>
                {resp.IsCorrect || resp.isCorrect ? 'Correct' : 'Incorrect'}
              </span>
            ) : null}
          </div>
          <div className="reading-snippet">{q.ReadingSnippet || q.readingSnippet}</div>
          <div className="options-grid">
            {answerOptions.map((opt) => {
              const id = opt.Id || opt.id;
              const isSelected = selected === id;
              const isCorrect = correctOptionId && correctOptionId === id;
              const showCorrect = inFeedback && (isCorrect || isSelected);
              return (
                <label
                  key={id}
                  className={`option-tile ${isSelected ? 'selected' : ''} ${
                    showCorrect && isCorrect ? 'correct' : ''
                  } ${showCorrect && !isCorrect && isSelected ? 'incorrect' : ''}`}
                >
                  <input
                    type="radio"
                    name={`reading-${key}`}
                    checked={isSelected}
                    disabled={inFeedback}
                    onChange={() => handleAnswerChange(key, { selectedOptionId: id })}
                  />
                  <span>{opt.Text || opt.text}</span>
                  {showCorrect ? (
                    <span className="pill tiny">{isCorrect ? 'Correct answer' : 'Your choice'}</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    const currentText = responses[key]?.responseText || '';
    const feedback = resp?.Feedback || resp?.feedback;
    const teacherScore = feedback?.TeacherScore ?? feedback?.teacherScore;
    const aiScore = resp?.AiScore ?? resp?.aiScore ?? null;
    const scoreLabel = teacherScore != null ? `${teacherScore}/10` : aiScore != null ? `${aiScore}/10` : '—';
    const isFinalScore =
      teacherScore != null || attemptMeta.TeacherReviewCompleted || attemptMeta.teacherReviewCompleted;
    const isSpeaking = type === 'Speaking';
    const changes = changesFromFeedback(feedback);
    const feedbackText = stripChangesText(
      feedback?.TeacherFeedback || feedback?.teacherFeedback || feedback?.AiFeedback || feedback?.aiFeedback
    );

    return (
      <div className="question-card" key={key}>
        <div className="question-head">
          <div>
            <p className="eyebrow">{type}</p>
            <h4>{q.Prompt || q.prompt}</h4>
          </div>
          {inFeedback && (
            <span className="chip-small info">{isFinalScore ? 'Final score' : 'Provisional score'}: {scoreLabel}</span>
          )}
        </div>
        <div className="text-response">
          <textarea
            rows={4}
            value={currentText}
            onChange={(e) => handleAnswerChange(key, { responseText: e.target.value })}
            disabled={inFeedback}
            placeholder={isSpeaking ? 'Tap the mic and start speaking…' : 'Type your response'}
          />
          {isSpeaking ? (
            <button
              type="button"
              className={`ghost-btn mic-btn ${listening && listeningQuestionRef.current === key ? 'active' : ''}`}
              onClick={() => toggleMic(key)}
              disabled={inFeedback}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 0 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 0 1-2 0v-3.07A7 7 0 0 1 5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0Z"
                />
              </svg>
              {listening && listeningQuestionRef.current === key ? 'Listening…' : 'Speak'}
            </button>
          ) : null}
        </div>
        {inFeedback && feedback ? (
          <div className="feedback-block">
            <h5>Corrections</h5>
            <p>{feedback.AiCorrections || feedback.aiCorrections || 'No corrections suggested.'}</p>
            {changes.length > 0 ? (
              <div className="change-list">
                {changes.map((c, idx) => (
                  <div className="change-row" key={`${key}-change-${idx}`}>
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
                ))}
              </div>
            ) : null}
            <p className="muted">{feedbackText}</p>
          </div>
        ) : null}
      </div>
    );
  };

  const attemptMeta = attemptDetail ? mapAttemptMeta(attemptDetail) : {};
  const lessonMeta = attemptDetail ? mapLessonMeta(attemptDetail) : {};
  const scoreOutOf =
    attemptMeta.ScoreOutOf ??
    attemptMeta.scoreOutOf ??
    activeLesson?.scoreOutOf ??
    FALLBACK_OUT_OF;
  const awaitingReview = attemptMeta.needsTeacherReview && !attemptMeta.teacherReviewCompleted;
  const derivedScores = deriveScores(attemptDetail);
  const totalScore = derivedScores.total ?? attemptMeta.TotalScore ?? attemptMeta.totalScore;
  const retryAllowed = activeLesson?.retryAllowed ?? false;
  const originalAttemptId = activeLesson?.originalAttempt?.attemptId;
  const retryAttemptId = activeLesson?.retryAttempt?.attemptId;

  return (
    <PageLayout title={null} role={role}>
      <div className="student-lessons">
        <Hero
          eyebrow="Assigned to you"
          title="My Lessons"
          subtitle="Work through your lessons."
          variant="student"
          icon={
            <Icon>
              <path d="M2 4.5h7a4 4 0 0 1 4 4v11.5a3 3 0 0 0-3-3H2z" />
              <path d="M22 4.5h-7a4 4 0 0 0-4 4v11.5a3 3 0 0 1 3-3h8z" />
            </Icon>
          }
          meta={[
            {
              label: `${activeRows.length} active`,
              icon: (
                <Icon className="mini-icon">
                  <path d="M6 6h12" />
                  <path d="M6 12h12" />
                  <path d="M6 18h8" />
                </Icon>
              ),
            },
            {
              label: `${completedRows.length} completed`,
              tone: 'ghost',
              icon: (
                <Icon className="mini-icon">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                </Icon>
              ),
            },
            {
              label: `Next due: ${nextDueLabel}`,
              tone: 'subtle',
              icon: (
                <Icon className="mini-icon">
                  <path d="M7 3v3" />
                  <path d="M17 3v3" />
                  <rect x="3" y="6" width="18" height="14" rx="2" />
                  <path d="M3 10h18" />
                </Icon>
              ),
            },
          ]}
        />

        {error ? <div className="notice error">{error}</div> : null}

        <div className="data-card">
          <div className="data-header">
            <div>
              <h3 className="section-title">
                <span className="section-icon">
                  <Icon>
                    <rect x="4" y="5" width="4" height="4" rx="1" />
                    <path d="M10 7h10" />
                    <rect x="4" y="11" width="4" height="4" rx="1" />
                    <path d="M10 13h10" />
                    <rect x="4" y="17" width="4" height="4" rx="1" />
                    <path d="M10 19h10" />
                  </Icon>
                </span>
                To Do
              </h3>
              <p className="section-subtitle">
                {loading
                  ? 'Loading lessons…'
                  : `${activeRows.length} lesson${activeRows.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          <DataGrid
            loading={loading}
            emptyMessage="No active lessons."
            className="lessons-grid"
            columns={[
              {
                title: (
                  <span className="col-title">
                    <Icon className="col-icon">
                      <path d="M3 4h7a4 4 0 0 1 4 4v12a2 2 0 0 0-2-2H3z" />
                      <path d="M21 4h-7a4 4 0 0 0-4 4v12a2 2 0 0 1 2-2h9z" />
                    </Icon>
                    Name
                  </span>
                ),
                width: '1.6fr',
              },
              {
                title: (
                  <span className="col-title">
                    <Icon className="col-icon">
                      <path d="M7 3v3" />
                      <path d="M17 3v3" />
                      <rect x="3" y="6" width="18" height="14" rx="2" />
                      <path d="M3 10h18" />
                    </Icon>
                    Due date
                  </span>
                ),
                align: 'center',
                width: '1fr',
              },
              {
                title: (
                  <span className="col-title">
                    <Icon className="col-icon">
                      <path d="M6 18v-5" />
                      <path d="M12 18v-9" />
                      <path d="M18 18v-3" />
                    </Icon>
                    Status
                  </span>
                ),
                align: 'center',
                width: '1fr',
              },
              { title: '', align: 'right', width: '0.9fr' },
            ]}
            rows={activeRows.map((lesson) => {
              const status = lesson.computedStatus;
              const hasDraft = !!lesson.activeAttempt;
              return {
                key: lesson.id,
                cells: [
                  <div className="cell-strong lesson-title">
                    <span className="lesson-title-icon">
                      <Icon>
                        <path d="M4 5h8a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4z" />
                        <path d="M20 5h-5a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h6z" />
                      </Icon>
                    </span>
                    <span>{lesson.title}</span>
                  </div>,
                  formatDate(lesson.dueDate),
                  <div className={`status-pill center ${status.toLowerCase()}`}>{status}</div>,
                  <div className="table-actions actions-cell">
                    <button
                      type="button"
                      className="primary-btn small"
                      disabled={loadingAttempt}
                      onClick={() =>
                        openAttempt(lesson, hasDraft ? lesson.activeAttempt.attemptId : null, false)
                      }
                    >
                      <span className="btn-icon" aria-hidden="true">
                        <Icon>
                          <path d="M5 4l14 8-14 8z" />
                        </Icon>
                      </span>
                      {hasDraft ? 'Continue' : 'Start'}
                    </button>
                  </div>,
                ],
              };
            })}
          />
        </div>

        <div className="data-card">
          <div className="data-header">
            <div>
              <h3 className="section-title">
                <span className="section-icon">
                  <Icon>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                  </Icon>
                </span>
                Completed
              </h3>
              <p className="section-subtitle">
                {loading
                  ? 'Loading lessons…'
                  : `${completedRows.length} lesson${completedRows.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          <DataGrid
            loading={loading}
            emptyMessage="No completed lessons yet."
            className="lessons-grid"
            columns={[
              {
                title: (
                  <span className="col-title">
                    <Icon className="col-icon">
                      <path d="M3 4h7a4 4 0 0 1 4 4v12a2 2 0 0 0-2-2H3z" />
                      <path d="M21 4h-7a4 4 0 0 0-4 4v12a2 2 0 0 1 2-2h9z" />
                    </Icon>
                    Name
                  </span>
                ),
                width: '1.6fr',
              },
              {
                title: (
                  <span className="col-title">
                    <Icon className="col-icon">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M6 22h12" />
                      <path d="M8 18h8" />
                    </Icon>
                    Score
                  </span>
                ),
                align: 'center',
                width: '1fr',
              },
              {
                title: (
                  <span className="col-title">
                    <Icon className="col-icon">
                      <path d="M4 6h16" />
                      <path d="M4 12h10" />
                      <path d="M4 18h8" />
                    </Icon>
                    Review
                  </span>
                ),
                align: 'center',
                width: '1fr',
              },
              { title: '', align: 'right', width: '0.9fr' },
            ]}
            rows={completedRows.map((lesson) => {
              const latestAttempt = lesson.latestAttempt;
              const primaryAttempt = lesson.originalAttempt || latestAttempt;
              const retryAttempt = lesson.retryAttempt;
              const retryAllowed = lesson.retryAllowed ?? false;
              const primaryScore =
                primaryAttempt && typeof primaryAttempt.totalScore === 'number'
                  ? `${primaryAttempt.totalScore}/${lesson.scoreOutOf || FALLBACK_OUT_OF}`
                  : '—';
              const retryScore =
                retryAttempt && typeof retryAttempt.totalScore === 'number'
                  ? `${retryAttempt.totalScore}/${lesson.scoreOutOf || FALLBACK_OUT_OF}`
                  : null;

              return {
                key: lesson.id,
                cells: [
                  <div className="cell-strong lesson-title">
                    <span className="lesson-title-icon">
                      <Icon>
                        <path d="M4 5h8a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4z" />
                        <path d="M20 5h-5a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h6z" />
                      </Icon>
                    </span>
                    <span>{lesson.title}</span>
                  </div>,
                  <div className="score-stack center">
                    <div>
                      <strong>Score:</strong> {primaryScore}
                    </div>
                    {retryScore !== null ? (
                      <div className="muted small-text">Retry (practice): {retryScore}</div>
                    ) : null}
                  </div>,
                  <div className="center">
                    <span
                      className={`status-pill ${
                        latestAttempt?.reviewStatus?.toLowerCase() === 'reviewed' ? 'reviewed' : 'pending'
                      }`}
                    >
                      {latestAttempt?.reviewStatus || 'Pending'}
                    </span>
                  </div>,
                  <div className="table-actions gap-small actions-cell">
                    <button
                      type="button"
                      className="ghost-btn small"
                      disabled={loadingAttempt || !retryAllowed}
                      onClick={() => openAttempt(lesson)}
                    >
                      <span className="btn-icon" aria-hidden="true">
                        <Icon>
                          <path d="M4 4v6h6" />
                          <path d="M20 20v-6h-6" />
                          <path d="M20 8a8 8 0 0 0-14-4" />
                          <path d="M4 16a8 8 0 0 0 14 4" />
                        </Icon>
                      </span>
                      {retryAllowed ? 'Retry lesson' : 'Retry used'}
                    </button>
                    <button
                      type="button"
                      className="primary-btn small"
                      disabled={loadingAttempt || !latestAttempt}
                      onClick={() => openAttempt(lesson, latestAttempt?.attemptId, true)}
                    >
                      <span className="btn-icon" aria-hidden="true">
                        <Icon>
                          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h6" />
                          <path d="M18 8h6" />
                          <path d="M21 5v6" />
                        </Icon>
                      </span>
                      View feedback
                    </button>
                  </div>,
                ],
              };
            })}
          />
        </div>
      </div>

      {attemptDetail ? (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !submitting && closeModal()}>
          <div className="modal lesson-attempt-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">{modalMode === 'feedback' ? 'Feedback' : 'Lesson in progress'}</p>
                <h3>{lessonMeta.Title || lessonMeta.title || activeLesson?.title}</h3>
                <p className="section-subtitle">
                  {modalMode === 'feedback'
                    ? 'Review your answers and provisional AI feedback.'
                    : 'Answer each prompt below. You can save and continue later.'}
                </p>
              </div>
              <button type="button" className="ghost-btn small" onClick={closeModal} disabled={submitting}>
                Close
              </button>
            </div>

            <div className="attempt-summary">
              <div className="score-pill">
                <span>Score</span>
                <strong>{totalScore != null ? `${totalScore}/${scoreOutOf}` : '—'}</strong>
                {awaitingReview ? <span className="pill tiny muted">Provisional</span> : null}
              </div>
              <div className="pill-stack">
                <span className="pill tiny">Reading: {derivedScores.reading}/2</span>
                <span className="pill tiny">
                  Writing: {derivedScores.writing}/10 {awaitingReview ? '(provisional)' : ''}
                </span>
                <span className="pill tiny">
                  Speaking: {derivedScores.speaking}/10 {awaitingReview ? '(provisional)' : ''}
                </span>
              </div>
              {modalMode === 'feedback' && originalAttemptId && retryAttemptId ? (
                <div className="toggle-row">
                  <span className="muted small-text">Feedback for:</span>
                  <button
                    type="button"
                    className={`ghost-btn small ${selectedFeedbackAttempt === 'original' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedFeedbackAttempt('original');
                      fetchAttemptDetail(activeLesson.id, originalAttemptId, true);
                    }}
                  >
                    First attempt
                  </button>
                  <button
                    type="button"
                    className={`ghost-btn small ${selectedFeedbackAttempt === 'retry' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedFeedbackAttempt('retry');
                      fetchAttemptDetail(activeLesson.id, retryAttemptId, true);
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>

            {attemptMessage ? <div className="notice subtle">{attemptMessage}</div> : null}
            {micError ? <div className="notice error">{micError}</div> : null}

            <div className="attempt-body">
              {loadingAttempt ? (
                <div className="muted">Loading lesson…</div>
              ) : (
                mapQuestionsFromDetail(attemptDetail).map((q) => renderQuestion(q))
              )}
            </div>

            <div className="form-actions">
              {modalMode === 'feedback' ? (
                <>
                  <button type="button" className="ghost-btn" onClick={closeModal}>
                    Done
                  </button>
                  {retryAllowed ? (
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => openAttempt(activeLesson)}
                      disabled={loadingAttempt}
                    >
                      Retry lesson
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button type="button" className="ghost-btn" onClick={closeModal} disabled={submitting || savingProgress}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={handleSaveForLater}
                    disabled={savingProgress || submitting}
                  >
                    {savingProgress ? 'Saving…' : 'Save & continue later'}
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting…' : 'Submit for feedback'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </PageLayout>
  );
}

export default MyLessons;
