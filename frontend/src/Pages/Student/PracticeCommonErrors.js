import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageLayout from '../../Components/PageLayout';
import './PracticeCommonErrors.css';

const countBlanks = (text, fallback = 1) => {
  const matches = text?.match(/___/g) || [];
  return matches.length > 0 ? matches.length : Math.max(fallback, 1);
};

const normalizeQuestions = (rawQuestions = []) =>
  rawQuestions
    .map((q, idx) => ({
      id: q?.id || idx,
      text: q?.questionText || q?.QuestionText || '',
      answers: q?.answers || q?.Answers || [],
    }))
    .filter((q) => q.text);

function PracticeCommonErrors({ role }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [sessionData, setSessionData] = useState(() => {
    const fromState = location.state;
    if (fromState?.questions) return fromState;

    const stored = sessionStorage.getItem('commonPracticeSession');
    return stored ? JSON.parse(stored) : null;
  });

  const questions = useMemo(
    () => normalizeQuestions(sessionData?.questions),
    [sessionData],
  );

  const [userAnswers, setUserAnswers] = useState(() =>
    questions.map((q) => Array(countBlanks(q.text, q.answers.length)).fill('')),
  );
  const totalQuestions = questions.length || 3;
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);

  useEffect(() => {
    if (location.state?.questions) {
      sessionStorage.setItem('commonPracticeSession', JSON.stringify(location.state));
      setSessionData(location.state);
    }
  }, [location.state]);

  useEffect(() => {
    setUserAnswers(
      questions.map((q) => Array(countBlanks(q.text, q.answers.length)).fill('')),
    );
    setSubmitted(false);
    setScore(null);
  }, [questions]);

  const handleChange = (qIdx, blankIdx, value) => {
    setUserAnswers((prev) => {
      const next = [...prev];
      const blanks = [...(next[qIdx] || [])];
      blanks[blankIdx] = value;
      next[qIdx] = blanks;
      return next;
    });
  };

  const isQuestionCorrect = (qIdx) => {
    const question = questions[qIdx];
    const blanks = countBlanks(question.text, question.answers.length);
    const expected = (question.answers || []).slice(0, blanks);
    const provided = (userAnswers[qIdx] || []).slice(0, blanks);
    if (provided.length < blanks) return false;
    return provided.every(
      (ans, idx) =>
        ans.trim().toLowerCase() === (expected[idx] || '').trim().toLowerCase(),
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const totalCorrect = questions.reduce(
      (acc, _, idx) => acc + (isQuestionCorrect(idx) ? 1 : 0),
      0,
    );
    setScore(totalCorrect);
    setSubmitted(true);
  };

  const handleReset = () => {
    setUserAnswers(
      questions.map((q) => Array(countBlanks(q.text, q.answers.length)).fill('')),
    );
    setSubmitted(false);
    setScore(null);
  };

  if (!sessionData || questions.length === 0) {
    return (
      <PageLayout title="Practice common errors" role={role}>
        <div className="practice-common">
          <div className="empty-state">
            <p>We could not find an active practice session.</p>
            <button
              type="button"
              className="card-button"
              onClick={() => navigate('/practice')}
            >
              Back to practice
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Practice common errors" role={role}>
      <form className="practice-common" onSubmit={handleSubmit}>
        <div className="common-header">
          <div>
            <p className="eyebrow">Common error</p>
            <h2 className="page-title">{sessionData.errorType}</h2>
            <p className="section-subtitle">
              Fill in the blanks for each sentence. We will score you out of {totalQuestions} once you submit.
            </p>
          </div>
          <div className="pill muted">
            {totalQuestions} {totalQuestions === 1 ? 'question' : 'questions'}
          </div>
        </div>

        {score !== null ? (
          <div className="score-banner">
            <div>
              <div className="score-title">Your score</div>
              <div className="score-value">
                {score}
                <span className="score-total">/{totalQuestions}</span>
              </div>
            </div>
            <div className="score-actions">
              <button type="button" className="ghost-button" onClick={handleReset}>
                Try again
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => navigate('/practice')}
              >
                Choose another error
              </button>
            </div>
          </div>
        ) : null}

        <div className="question-list">
          {questions.map((question, qIdx) => {
            const parts = question.text.split('___');
            const blanks = countBlanks(question.text, question.answers.length);
            const userBlankAnswers = userAnswers[qIdx] || [];
            const correct = submitted ? isQuestionCorrect(qIdx) : null;

            return (
              <div className="question-card" key={question.id}>
                <div className="question-header">
                  <div className="pill muted">Question {qIdx + 1}</div>
                  {submitted && (
                    <span className={`pill ${correct ? 'success' : 'danger'}`}>
                      {correct ? 'Correct' : 'Check answer'}
                    </span>
                  )}
                </div>

                <div className="question-text">
                  {parts.map((segment, idx) => (
                    <Fragment key={`${question.id}-${idx}`}>
                      <span>{segment}</span>
                      {idx < blanks ? (
                        <input
                          type="text"
                          value={userBlankAnswers[idx] || ''}
                          onChange={(e) => handleChange(qIdx, idx, e.target.value)}
                          placeholder="Your answer"
                          disabled={submitted}
                        />
                      ) : null}
                    </Fragment>
                  ))}
                </div>

                {submitted ? (
                  <div className="answer-reveal">
                    <span>Answer:</span>
                    <div className="answer-list">
                      {question.answers.slice(0, blanks).map((ans, idx) => (
                        <div className="answer-chip" key={`${question.id}-ans-${idx}`}>
                          {ans}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!submitted ? (
          <div className="practice-actions">
            <button type="submit" className="card-button">
              Submit answers
            </button>
            <button type="button" className="ghost-button" onClick={handleReset}>
              Clear answers
            </button>
          </div>
        ) : null}
      </form>
    </PageLayout>
  );
}

export default PracticeCommonErrors;
