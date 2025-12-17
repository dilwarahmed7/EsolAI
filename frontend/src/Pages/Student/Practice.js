import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../Components/PageLayout';
import './Practice.css';

const API_BASE = 'http://localhost:5144/api/practice';

const ErrorCard = ({ label, description, ctaLabel, disabled, onClick, loading }) => (
  <div className="practice-card">
    <div className="card-label">{label}</div>
    <div className="card-title">{description}</div>
    <div className="card-actions">
      <button
        className="card-button"
        onClick={onClick}
        disabled={disabled || loading}
        type="button"
      >
        {loading ? 'Starting…' : ctaLabel}
      </button>
    </div>
  </div>
);

function Practice({ role }) {
  const navigate = useNavigate();
  const [errorTypes, setErrorTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState('');

  const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);

  useEffect(() => {
    const fetchErrorTypes = async () => {
      setLoading(true);
      setError('');

      if (!token) {
        setError('Please sign in again to load your practice topics.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/l1-errors`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const message = (await res.text()) || 'Unable to load common errors.';
          throw new Error(message);
        }

        const data = await res.json();
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.errors)
            ? data.errors
            : [];

        setErrorTypes(list.slice(0, 5));
      } catch (err) {
        console.error(err);
        setError(err.message || 'Something went wrong while loading errors.');
      } finally {
        setLoading(false);
      }
    };

    fetchErrorTypes();
  }, [token]);

  const handleStart = async (errorType) => {
    if (!token) {
      setError('Please sign in again to start this exercise.');
      return;
    }

    setStarting(errorType);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/l1-errors/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ errorType }),
      });

      if (!res.ok) {
        const message = (await res.text()) || 'Unable to start practice right now.';
        throw new Error(message);
      }

      const data = await res.json();
      const normalized = {
        errorType,
        questions: data?.questions || data?.Questions || [],
        modelUsed: data?.modelUsed || data?.ModelUsed || '',
      };

      sessionStorage.setItem('commonPracticeSession', JSON.stringify(normalized));
      navigate('/practice/common-errors', { state: normalized });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to start practice. Please try again.');
    } finally {
      setStarting('');
    }
  };

  return (
    <PageLayout title="Practice" role={role}>
      <div className="practice-page">
        <div>
          <p className="eyebrow">Choose your focus</p>
          <h2 className="page-title">Practice common or personalised errors</h2>
          <p className="section-subtitle">
            Target the most frequent mistakes for your first language, or tackle personalised feedback.
          </p>
        </div>

        <div className="practice-sections">
          <section className="practice-section">
            <header className="section-header">
              <div>
                <h3>Common errors</h3>
                <p className="section-subtitle">Top issues for learners with your first language</p>
              </div>
              {loading ? <span className="pill muted">Loading…</span> : null}
            </header>

            {error ? <div className="practice-error">{error}</div> : null}

            <div className="card-grid">
              {loading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <div className="practice-card skeleton" key={idx}>
                    <div className="skeleton-line short" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line button" />
                  </div>
                ))
              ) : errorTypes.length === 0 ? (
                <div className="empty-state">
                  <p>No common errors found for your profile yet.</p>
                </div>
              ) : (
                errorTypes.map((item, idx) => (
                  <ErrorCard
                    key={item || idx}
                    label={`Error ${idx + 1}`}
                    description={item}
                    ctaLabel="Start exercise"
                    loading={starting === item}
                    onClick={() => handleStart(item)}
                  />
                ))
              )}
            </div>
          </section>

          <section className="practice-section muted">
            <header className="section-header">
              <div>
                <h3>Personalised errors</h3>
                <p className="section-subtitle">
                  Coming soon — practice based on your recent work and teacher feedback.
                </p>
              </div>
              <span className="pill">Soon</span>
            </header>
            <div className="card-grid disabled">
              <div className="practice-card disabled-card">
                <div className="card-label">Personalised set</div>
                <div className="card-title">Tailored exercises based on your submissions</div>
                <div className="card-actions">
                  <button className="card-button" type="button" disabled>
                    Not available yet
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}

export default Practice;
