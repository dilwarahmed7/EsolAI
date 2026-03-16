import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../Components/ToastProvider';

const API_BASE = 'http://localhost:5144/api/teacher';
const MIN_PUBLISH_QUESTIONS = 4;

let localQuestionId = 1;

const nextQuestionId = () => `q-${localQuestionId++}`;

const QUESTION_TEMPLATE_LIBRARY = [
  {
    key: 'reading',
    label: 'Reading',
    subtitle: 'Multiple choice',
  },
  {
    key: 'writing',
    label: 'Writing',
    subtitle: 'Essay prompt',
  },
  {
    key: 'speaking',
    label: 'Speaking',
    subtitle: 'Oral response',
  },
  {
    key: 'fillBlank',
    label: 'Fill in the blank',
    subtitle: 'Click words to hide',
  },
];

const createInitialReading = () => ({
  snippet: '',
  prompt: '',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
});

const createInitialForm = (selectedClassId = null) => ({
  title: '',
  dueDate: '',
  classIds: selectedClassId ? [selectedClassId] : [],
  questions: [],
});

const createQuestionFromTemplate = (type) => {
  if (type === 'reading') {
    return {
      id: nextQuestionId(),
      type: 'reading',
      ...createInitialReading(),
    };
  }
  if (type === 'writing') {
    return {
      id: nextQuestionId(),
      type: 'writing',
      prompt: '',
    };
  }
  if (type === 'speaking') {
    return {
      id: nextQuestionId(),
      type: 'speaking',
      prompt: '',
    };
  }
  if (type === 'fillBlank') {
    return {
      id: nextQuestionId(),
      type: 'fillBlank',
      prompt: 'Complete the sentence by filling in the blanks.',
      sentence: '',
      blankTokenIndexes: [],
    };
  }
  return null;
};

const tokeniseFillBlankSentence = (sentence) => {
  const rawTokens = (sentence || '').match(/[A-Za-z0-9']+|[^A-Za-z0-9']+/g) || [];
  let wordIndex = 0;
  return rawTokens.map((text, tokenIndex) => {
    const isWord = /^[A-Za-z0-9']+$/.test(text);
    const token = {
      text,
      tokenIndex,
      isWord,
      wordIndex: isWord ? wordIndex : null,
    };
    if (isWord) wordIndex += 1;
    return token;
  });
};

const buildFillBlankTemplate = (sentence, blankTokenIndexes) => {
  const tokens = tokeniseFillBlankSentence(sentence);
  const selected = new Set((blankTokenIndexes || []).map((idx) => Number(idx)).filter(Number.isFinite));
  const answers = [];

  const maskedSentence = tokens
    .map((token) => {
      if (!token.isWord) return token.text;
      if (selected.has(token.wordIndex)) {
        answers.push(token.text);
        return '___';
      }
      return token.text;
    })
    .join('');

  return { maskedSentence, answers };
};

const hydrateFillBlankFromSaved = (maskedSentence, answerOptions) => {
  const answers = (answerOptions || [])
    .slice()
    .sort((a, b) => Number(a?.id ?? a?.Id ?? 0) - Number(b?.id ?? b?.Id ?? 0))
    .map((o) => o.text || o.Text || '')
    .filter(Boolean);
  const parts = String(maskedSentence || '').split('___');
  if (parts.length <= 1) {
    return {
      sentence: String(maskedSentence || ''),
      blankTokenIndexes: [],
    };
  }

  let restoredSentence = '';
  let runningWordCount = 0;
  const blankTokenIndexes = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] || '';
    restoredSentence += part;
    runningWordCount += tokeniseFillBlankSentence(part).filter((t) => t.isWord).length;

    if (i < parts.length - 1) {
      const answer = answers[i] || '___';
      const answerWordCount = tokeniseFillBlankSentence(answer).filter((t) => t.isWord).length;

      if (answerWordCount > 0) {
        blankTokenIndexes.push(runningWordCount);
      }

      restoredSentence += answer;
      runningWordCount += answerWordCount;
    }
  }

  return {
    sentence: restoredSentence,
    blankTokenIndexes,
  };
};

function CreateLessonDialog({
  isOpen,
  mode,
  lessonId,
  classes,
  selectedClassId,
  token,
  onClose,
  onSaved,
  onError,
}) {
  const snapshotRef = useRef(JSON.stringify(createInitialForm()));
  const toast = useToast();
  const [form, setForm] = useState(() => createInitialForm(selectedClassId));
  const [isSaving, setIsSaving] = useState(false);

  const editingLessonId = mode === 'edit' ? lessonId : null;

  const formatInputDate = useCallback((raw) => {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }, []);

  const normaliseDate = useCallback((dateStr) => {
    if (!dateStr) return null;
    return new Date(`${dateStr}T00:00:00`).toISOString();
  }, []);

  const serializeLessonForm = useCallback(
    (candidateForm, candidateEditingId = editingLessonId) =>
      JSON.stringify({
        editingLessonId: candidateEditingId ?? null,
        title: candidateForm?.title || '',
        dueDate: candidateForm?.dueDate || '',
        classIds: [...(candidateForm?.classIds || [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b),
        questions: (candidateForm?.questions || []).map((q) => {
          if (q.type === 'reading') {
            return {
              type: q.type,
              snippet: q.snippet || '',
              prompt: q.prompt || '',
              options: (q.options || []).map((opt) => ({
                text: opt.text || '',
                isCorrect: !!opt.isCorrect,
              })),
            };
          }

          if (q.type === 'fillBlank') {
            return {
              type: q.type,
              prompt: q.prompt || '',
              sentence: q.sentence || '',
              blankTokenIndexes: [...(q.blankTokenIndexes || [])].sort((a, b) => a - b),
            };
          }

          return {
            type: q.type,
            prompt: q.prompt || '',
          };
        }),
      }),
    [editingLessonId]
  );

  const hasUnsavedDialogChanges = useMemo(() => {
    if (!isOpen) return false;
    return serializeLessonForm(form) !== snapshotRef.current;
  }, [form, isOpen, serializeLessonForm]);

  const closeDialog = useCallback(() => {
    if (isSaving) return;
    if (hasUnsavedDialogChanges && !window.confirm('Discard your lesson changes?')) {
      return;
    }
    onClose();
  }, [hasUnsavedDialogChanges, isSaving, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key !== 'Escape' || isSaving) return;
      event.preventDefault();
      closeDialog();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeDialog, isOpen, isSaving]);

  useEffect(() => {
    if (!isOpen) return;

    const resetCreateForm = () => {
      const initial = createInitialForm(selectedClassId);
      snapshotRef.current = serializeLessonForm(initial, null);
      setForm(initial);
    };

    if (mode !== 'edit') {
      resetCreateForm();
      return;
    }

    if (!token || !lessonId) return;

    const loadLesson = async () => {
      setIsSaving(true);
      onError?.('');
      try {
        const response = await fetch(`${API_BASE}/lessons/${lessonId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error((await response.text()) || 'Unable to load lesson.');
        const data = await response.json();
        const questionsRaw = data.Questions || data.questions || [];

        const normaliseType = (question) => {
          const raw = question.Type ?? question.type;
          if (typeof raw === 'string') return raw.toLowerCase();
          if (raw === 0) return 'reading';
          if (raw === 1) return 'writing';
          if (raw === 2) return 'speaking';
          if (raw === 3) return 'fillinblank';
          return '';
        };

        const questions = questionsRaw
          .slice()
          .sort((a, b) => Number(a.Order ?? a.order ?? 0) - Number(b.Order ?? b.order ?? 0))
          .map((question) => {
            const type = normaliseType(question);
            if (type === 'reading') {
              const options = (question.AnswerOptions || question.answerOptions || []).map((option) => ({
                text: option.Text || option.text || '',
                isCorrect: option.IsCorrect ?? option.isCorrect ?? false,
              }));
              while (options.length < 3) options.push({ text: '', isCorrect: false });
              return {
                id: nextQuestionId(),
                type: 'reading',
                snippet: question.ReadingSnippet || question.readingSnippet || '',
                prompt: question.Prompt || question.prompt || '',
                options: options.slice(0, 3),
              };
            }
            if (type === 'writing') {
              return {
                id: nextQuestionId(),
                type: 'writing',
                prompt: question.Prompt || question.prompt || '',
              };
            }
            if (type === 'speaking') {
              return {
                id: nextQuestionId(),
                type: 'speaking',
                prompt: question.Prompt || question.prompt || '',
              };
            }
            if (type === 'fillinblank') {
              const hydrated = hydrateFillBlankFromSaved(
                question.ReadingSnippet || question.readingSnippet || '',
                question.AnswerOptions || question.answerOptions || []
              );
              return {
                id: nextQuestionId(),
                type: 'fillBlank',
                prompt: question.Prompt || question.prompt || 'Complete the sentence by filling in the blanks.',
                sentence: hydrated.sentence,
                blankTokenIndexes: hydrated.blankTokenIndexes,
              };
            }
            return null;
          })
          .filter(Boolean);

        const nextForm = {
          title: data.Title || data.title || '',
          dueDate: formatInputDate(data.DueDate || data.dueDate),
          classIds: (data.AssignedClassIds || data.assignedClassIds || [])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id)),
          questions,
        };

        snapshotRef.current = serializeLessonForm(nextForm, lessonId);
        setForm(nextForm);
      } catch (error) {
        console.error(error);
        onError?.(error.message || 'Failed to open lesson.');
        toast.error(error.message || 'Failed to open lesson.');
        onClose();
      } finally {
        setIsSaving(false);
      }
    };

    loadLesson();
  }, [formatInputDate, isOpen, lessonId, mode, onClose, onError, selectedClassId, serializeLessonForm, toast, token]);

  const addQuestionTemplate = (type) => {
    const question = createQuestionFromTemplate(type);
    if (!question) return;
    setForm((current) => ({
      ...current,
      questions: [...current.questions, question],
    }));
  };

  const removeQuestion = (questionId) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.filter((question) => question.id !== questionId),
    }));
  };

  const updateQuestion = (questionId, field, value) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId ? { ...question, [field]: value } : question
      ),
    }));
  };

  const updateReadingOption = (questionId, optionIndex, value, asCorrect = false) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) => {
        if (question.id !== questionId || question.type !== 'reading') return question;
        const options = question.options.map((option, index) => {
          if (asCorrect) return { ...option, isCorrect: index === optionIndex };
          return index === optionIndex ? { ...option, text: value } : option;
        });
        return { ...question, options };
      }),
    }));
  };

  const updateFillBlankSentence = (questionId, sentence) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId && question.type === 'fillBlank'
          ? { ...question, sentence, blankTokenIndexes: [] }
          : question
      ),
    }));
  };

  const toggleFillBlankWord = (questionId, wordIndex) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) => {
        if (question.id !== questionId || question.type !== 'fillBlank') return question;
        const exists = (question.blankTokenIndexes || []).includes(wordIndex);
        return {
          ...question,
          blankTokenIndexes: exists
            ? question.blankTokenIndexes.filter((index) => index !== wordIndex)
            : [...question.blankTokenIndexes, wordIndex].sort((a, b) => a - b),
        };
      }),
    }));
  };

  const toggleClassSelection = (classId) => {
    setForm((current) => {
      const exists = current.classIds.includes(classId);
      return {
        ...current,
        classIds: exists ? current.classIds.filter((id) => id !== classId) : [...current.classIds, classId],
      };
    });
  };

  const buildQuestionsPayload = (strict) => {
    const questions = [];
    let order = 1;

    form.questions.forEach((question, index) => {
      if (question.type === 'reading') {
        const trimmedOptions = (question.options || []).map((option) => ({
          ...option,
          text: (option.text || '').trim(),
        }));
        let filledOptions = trimmedOptions.filter((option) => option.text);
        let correctCount = trimmedOptions.filter((option) => option.isCorrect && option.text).length;

        if (filledOptions.length > 0 && correctCount === 0) {
          const firstFilledIndex = trimmedOptions.findIndex((option) => option.text);
          if (firstFilledIndex >= 0) {
            trimmedOptions[firstFilledIndex].isCorrect = true;
            filledOptions = trimmedOptions.filter((option) => option.text);
            correctCount = 1;
          }
        }

        const snippet = (question.snippet || '').trim();
        const prompt = (question.prompt || '').trim();
        const hasContent = snippet || prompt || filledOptions.length > 0;
        const isComplete = snippet && prompt && filledOptions.length >= 2 && correctCount === 1;

        if (!hasContent) return;
        if (strict && !isComplete) {
          throw new Error(
            `Reading question #${index + 1} needs snippet, prompt, 2+ options and exactly one correct answer.`
          );
        }

        questions.push({
          type: 0,
          order: order++,
          readingSnippet: question.snippet,
          prompt: question.prompt,
          answerOptions: trimmedOptions.map((option) => ({
            text: option.text,
            isCorrect: option.isCorrect,
          })),
        });
        return;
      }

      if (question.type === 'writing' || question.type === 'speaking') {
        const prompt = (question.prompt || '').trim();
        if (!prompt) {
          if (strict) {
            throw new Error(
              `${question.type === 'writing' ? 'Writing' : 'Speaking'} question #${index + 1} needs a prompt.`
            );
          }
          return;
        }

        questions.push({
          type: question.type === 'writing' ? 1 : 2,
          order: order++,
          prompt: question.prompt,
        });
        return;
      }

      if (question.type === 'fillBlank') {
        const prompt = (question.prompt || '').trim();
        const sentence = (question.sentence || '').trim();
        const { maskedSentence, answers } = buildFillBlankTemplate(
          question.sentence || '',
          question.blankTokenIndexes || []
        );
        const hasContent = prompt || sentence;
        const isComplete = prompt && sentence && answers.length > 0 && maskedSentence.includes('___');

        if (!hasContent) return;
        if (strict && !isComplete) {
          throw new Error(
            `Fill in the blank question #${index + 1} needs a prompt, sentence, and at least one selected blank.`
          );
        }
        if (!isComplete) return;

        questions.push({
          type: 3,
          order: order++,
          prompt,
          readingSnippet: maskedSentence,
          answerOptions: answers.map((answer) => ({
            text: answer.trim(),
            isCorrect: true,
          })),
        });
      }
    });

    if (strict && questions.length < MIN_PUBLISH_QUESTIONS) {
      throw new Error(`Add at least ${MIN_PUBLISH_QUESTIONS} complete questions before publishing.`);
    }

    return questions;
  };

  const saveLesson = async (publish = false) => {
    if (!token) {
      onError?.('Please sign in again.');
      toast.error('Please sign in again.');
      return;
    }
    if (!form.title.trim()) {
      toast.info('Please add a lesson title before saving.', 'Missing required field');
      return;
    }
    if (!form.dueDate) {
      toast.info('Please add a due date before saving.', 'Missing required field');
      return;
    }

    setIsSaving(true);
    onError?.('');

    try {
      const lessonPayload = {
        title: form.title.trim(),
        dueDate: normaliseDate(form.dueDate),
      };

      let nextLessonId = editingLessonId;
      if (!nextLessonId) {
        const createResponse = await fetch(`${API_BASE}/lessons`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(lessonPayload),
        });
        if (!createResponse.ok) throw new Error((await createResponse.text()) || 'Could not create lesson.');
        const created = await createResponse.json();
        nextLessonId = created.id || created.Id;
      } else {
        const updateResponse = await fetch(`${API_BASE}/lessons/${nextLessonId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(lessonPayload),
        });
        if (!updateResponse.ok) throw new Error((await updateResponse.text()) || 'Could not update lesson.');
      }

      const questions = buildQuestionsPayload(publish);
      if (questions.length > 0) {
        const questionResponse = await fetch(`${API_BASE}/lessons/${nextLessonId}/questions`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ questions }),
        });
        if (!questionResponse.ok) throw new Error((await questionResponse.text()) || 'Could not save questions.');
      } else if (publish) {
        throw new Error('Please add questions before publishing.');
      }

      if (form.classIds.length > 0) {
        const assignResponse = await fetch(`${API_BASE}/lessons/${nextLessonId}/assign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ classIds: form.classIds }),
        });
        if (!assignResponse.ok) throw new Error((await assignResponse.text()) || 'Could not assign classes.');
      } else if (publish) {
        throw new Error('Select at least one class before publishing.');
      }

      if (publish) {
        const publishResponse = await fetch(`${API_BASE}/lessons/${nextLessonId}/publish`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!publishResponse.ok) throw new Error((await publishResponse.text()) || 'Could not publish lesson.');
      }

      snapshotRef.current = serializeLessonForm(form, nextLessonId);
      await onSaved?.();
      onClose();

      if (publish) {
        toast.success('Lesson published and assigned to classes.');
      } else if (editingLessonId) {
        toast.success('Lesson changes saved.');
      } else {
        toast.success('Lesson created successfully.');
      }
    } catch (error) {
      console.error(error);
      onError?.(error.message || 'Failed to save lesson.');
      toast.error(error.message || 'Failed to save lesson.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && closeDialog()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Lesson</p>
            <h3>{editingLessonId ? 'Edit lesson' : 'Create new lesson'}</h3>
          </div>
          <button type="button" className="ghost-btn small" onClick={closeDialog} disabled={isSaving}>
            Close
          </button>
        </div>

        <form className="lesson-form" onSubmit={(event) => event.preventDefault()}>
          <div className="form-row">
            <label>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
            />
          </div>

          <div className="form-row">
            <label>Due date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
              required
            />
          </div>

          <div className="form-row">
            <label>Assign to classes</label>
            <div className="chip-list">
              {classes.map((classroom) => {
                const classId = classroom.id || classroom.Id;
                const selected = form.classIds.includes(classId);
                return (
                  <button
                    type="button"
                    key={classId}
                    className={`chip ${selected ? 'active' : ''}`}
                    onClick={() => toggleClassSelection(classId)}
                  >
                    {classroom.name || classroom.Name}
                  </button>
                );
              })}
              {classes.length === 0 ? <span className="muted-text">No classes available</span> : null}
            </div>
          </div>

          <div className="question-group">
            <div className="group-header">
              <div>
                <p className="eyebrow">Question templates</p>
                <h4>Build lesson structure</h4>
              </div>
              <span className="muted-text">
                {form.questions.length} question{form.questions.length === 1 ? '' : 's'} added
              </span>
            </div>
            <p className="muted-text">
              Start blank and add templates in any order. You need at least {MIN_PUBLISH_QUESTIONS} complete questions
              to publish.
            </p>
            <div className="template-library">
              {QUESTION_TEMPLATE_LIBRARY.map((template) => (
                <button
                  type="button"
                  key={template.key}
                  className="ghost-btn small template-btn"
                  onClick={() => addQuestionTemplate(template.key)}
                >
                  + {template.label}
                  <span>{template.subtitle}</span>
                </button>
              ))}
            </div>
          </div>

          {form.questions.length === 0 ? (
            <div className="question-group">
              <div className="muted-text">No question templates added yet.</div>
            </div>
          ) : null}

          {form.questions.map((question, index) => {
            const title =
              question.type === 'fillBlank'
                ? 'Fill in the blank'
                : question.type.charAt(0).toUpperCase() + question.type.slice(1);
            return (
              <div className="question-group" key={question.id}>
                <div className="group-header">
                  <div>
                    <p className="eyebrow">
                      Question {index + 1} • {title}
                    </p>
                    <h4>
                      {question.type === 'reading'
                        ? 'Multiple choice'
                        : question.type === 'writing'
                          ? 'Essay prompt'
                          : question.type === 'fillBlank'
                            ? 'Fill in the blank'
                            : 'Oral response prompt'}
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="ghost-btn small danger-text-btn"
                    onClick={() => removeQuestion(question.id)}
                  >
                    Remove
                  </button>
                </div>

                {question.type === 'reading' ? (
                  <div className="reading-card">
                    <div className="form-row">
                      <label>Reading snippet</label>
                      <textarea
                        rows={3}
                        value={question.snippet}
                        onChange={(event) => updateQuestion(question.id, 'snippet', event.target.value)}
                      />
                    </div>
                    <div className="form-row">
                      <label>Question prompt</label>
                      <input
                        type="text"
                        value={question.prompt}
                        onChange={(event) => updateQuestion(question.id, 'prompt', event.target.value)}
                      />
                    </div>
                    <div className="options-grid">
                      {question.options.map((option, optionIndex) => (
                        <div className="option-row" key={`${question.id}-opt-${optionIndex}`}>
                          <input
                            type="text"
                            placeholder={`Option ${optionIndex + 1}`}
                            value={option.text}
                            onChange={(event) =>
                              updateReadingOption(question.id, optionIndex, event.target.value, false)
                            }
                          />
                          <label className="radio-label">
                            <input
                              type="radio"
                              name={`correct-${question.id}`}
                              checked={option.isCorrect}
                              onChange={() =>
                                updateReadingOption(question.id, optionIndex, option.text || ' ', true)
                              }
                            />
                            Correct
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : question.type === 'fillBlank' ? (
                  <div className="reading-card fill-blank-card">
                    <div className="form-row">
                      <label>Instruction prompt</label>
                      <textarea
                        rows={2}
                        value={question.prompt}
                        onChange={(event) => updateQuestion(question.id, 'prompt', event.target.value)}
                      />
                    </div>
                    <div className="form-row">
                      <label>Sentence</label>
                      <textarea
                        rows={3}
                        value={question.sentence || ''}
                        onChange={(event) => updateFillBlankSentence(question.id, event.target.value)}
                        placeholder="Type a sentence, then click word chips below to mark blanks."
                      />
                    </div>
                    <div className="form-row">
                      <label>Select blank word(s)</label>
                      <div className="fill-blank-token-picker" role="group" aria-label={`Select blanks for question ${index + 1}`}>
                        {tokeniseFillBlankSentence(question.sentence || '').length === 0 ? (
                          <span className="muted-text">Add a sentence first.</span>
                        ) : (
                          tokeniseFillBlankSentence(question.sentence || '').map((token, tokenIndex) => {
                            if (!token.isWord) {
                              return (
                                <span key={`${question.id}-tok-${tokenIndex}`} className="fill-blank-separator">
                                  {token.text}
                                </span>
                              );
                            }
                            const isSelected = (question.blankTokenIndexes || []).includes(token.wordIndex);
                            return (
                              <button
                                type="button"
                                key={`${question.id}-tok-${tokenIndex}`}
                                className={`fill-blank-token ${isSelected ? 'selected' : ''}`}
                                onClick={() => toggleFillBlankWord(question.id, token.wordIndex)}
                              >
                                {token.text}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="form-row">
                      <label>Preview</label>
                      <div className="fill-blank-preview">
                        {(() => {
                          const preview = buildFillBlankTemplate(
                            question.sentence || '',
                            question.blankTokenIndexes || []
                          );
                          return preview.maskedSentence || 'Sentence preview will appear here.';
                        })()}
                      </div>
                      <div className="muted-text">
                        {(question.blankTokenIndexes || []).length} blank
                        {(question.blankTokenIndexes || []).length === 1 ? '' : 's'} selected
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="form-row">
                    <label>Prompt</label>
                    <textarea
                      rows={3}
                      value={question.prompt}
                      onChange={(event) => updateQuestion(question.id, 'prompt', event.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="form-actions">
            <button type="button" className="ghost-btn" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </button>
            <button type="button" className="ghost-btn" onClick={() => saveLesson(false)} disabled={isSaving}>
              {isSaving && !editingLessonId ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" className="primary-btn" onClick={() => saveLesson(true)} disabled={isSaving}>
              {isSaving ? 'Saving…' : editingLessonId ? 'Save & publish' : 'Create & publish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateLessonDialog;
