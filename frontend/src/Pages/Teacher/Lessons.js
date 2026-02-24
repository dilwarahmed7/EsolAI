import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '../../Components/PageLayout';
import DataGrid from '../../Components/DataGrid';
import Hero from '../../Components/Hero';
import Icon from '../../Components/Icons';
import { useToast } from '../../Components/ToastProvider';
import './Lessons.css';

const API_BASE = 'http://localhost:5144/api/teacher';
const PAGE_SIZE = 10;
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

const createInitialForm = () => ({
  title: '',
  dueDate: '',
  classIds: [],
  questions: [],
});

function Lessons({ role }) {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);
  const dialogRef = useRef(null);
  const formContainerRef = useRef(null);
  const autoOpenRef = useRef(false);
  const autoEditRef = useRef(null);
  const formatInputDate = (raw) => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  };
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
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(createInitialForm());
  const [editingLessonId, setEditingLessonId] = useState(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [activeMenu, setActiveMenu] = useState(null);
  const menuRefs = useRef({});

  const normaliseDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(`${dateStr}T00:00:00`).toISOString();
  };
  const toast = useToast();

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsDialogOpen(false);
        setEditingLessonId(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

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
    const initial = createInitialForm();
    if (selectedClassId) initial.classIds = [selectedClassId];
    setForm(initial);
    setEditingLessonId(null);
    setIsDialogOpen(true);
  }, [selectedClassId]);

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
  }, [searchParams, token, loadingLessons]);

  const openEditDialog = async (lessonId) => {
    if (!token) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/lessons/${lessonId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.text()) || 'Unable to load lesson.');
      const data = await res.json();
      const questionsRaw = data.Questions || data.questions || [];

      const normaliseType = (q) => {
        const raw = q.Type ?? q.type;
        if (typeof raw === 'string') return raw.toLowerCase();
        if (raw === 0) return 'reading';
        if (raw === 1) return 'writing';
        if (raw === 2) return 'speaking';
        if (raw === 3) return 'fillinblank';
        return '';
      };
      const normaliseOrder = (q) => Number(q.Order ?? q.order ?? 0);
      const questions = questionsRaw
        .slice()
        .sort((a, b) => normaliseOrder(a) - normaliseOrder(b))
        .map((q) => {
          const type = normaliseType(q);
          if (type === 'reading') {
            const opts = (q.AnswerOptions || q.answerOptions || []).map((o) => ({
              text: o.Text || o.text || '',
              isCorrect: o.IsCorrect ?? o.isCorrect ?? false,
            }));
            while (opts.length < 3) opts.push({ text: '', isCorrect: false });
            return {
              id: nextQuestionId(),
              type: 'reading',
              snippet: q.ReadingSnippet || q.readingSnippet || '',
              prompt: q.Prompt || q.prompt || '',
              options: opts.slice(0, 3),
            };
          }
          if (type === 'writing') {
            return {
              id: nextQuestionId(),
              type: 'writing',
              prompt: q.Prompt || q.prompt || '',
            };
          }
          if (type === 'speaking') {
            return {
              id: nextQuestionId(),
              type: 'speaking',
              prompt: q.Prompt || q.prompt || '',
            };
          }
          if (type === 'fillinblank') {
            const answerOptions = q.AnswerOptions || q.answerOptions || [];
            const hydrated = hydrateFillBlankFromSaved(q.ReadingSnippet || q.readingSnippet || '', answerOptions);
            return {
              id: nextQuestionId(),
              type: 'fillBlank',
              prompt: q.Prompt || q.prompt || 'Complete the sentence by filling in the blanks.',
              sentence: hydrated.sentence,
              blankTokenIndexes: hydrated.blankTokenIndexes,
            };
          }
          return null;
        })
        .filter(Boolean);

      setForm({
        title: data.Title || data.title || '',
        dueDate: formatInputDate(data.DueDate || data.dueDate),
        classIds: (data.AssignedClassIds || data.assignedClassIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id)),
        questions,
      });
      setEditingLessonId(lessonId);
      setIsDialogOpen(true);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to open lesson.');
      toast.error(err.message || 'Failed to open lesson.');
    } finally {
      setIsSaving(false);
    }
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingLessonId(null);
  };

  const addQuestionTemplate = (type) => {
    const question = createQuestionFromTemplate(type);
    if (!question) return;
    setForm((prev) => {
      return {
        ...prev,
        questions: [...prev.questions, question],
      };
    });
  };

  const removeQuestion = (questionId) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== questionId),
    }));
  };

  const updateQuestion = (questionId, field, value) => {
    setForm((prev) => {
      return {
        ...prev,
        questions: prev.questions.map((q) => (q.id === questionId ? { ...q, [field]: value } : q)),
      };
    });
  };

  const updateReadingOption = (questionId, optIdx, value, asCorrect = false) => {
    setForm((prev) => {
      return {
        ...prev,
        questions: prev.questions.map((q) => {
          if (q.id !== questionId || q.type !== 'reading') return q;
          const options = q.options.map((opt, i) => {
            if (asCorrect) return { ...opt, isCorrect: i === optIdx };
            return i === optIdx ? { ...opt, text: value } : opt;
          });
          return { ...q, options };
        }),
      };
    });
  };

  const updateFillBlankSentence = (questionId, sentence) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => {
        if (q.id !== questionId || q.type !== 'fillBlank') return q;
        return { ...q, sentence, blankTokenIndexes: [] };
      }),
    }));
  };

  const toggleFillBlankWord = (questionId, wordIndex) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => {
        if (q.id !== questionId || q.type !== 'fillBlank') return q;
        const exists = (q.blankTokenIndexes || []).includes(wordIndex);
        const nextIndexes = exists
          ? q.blankTokenIndexes.filter((idx) => idx !== wordIndex)
          : [...q.blankTokenIndexes, wordIndex].sort((a, b) => a - b);
        return { ...q, blankTokenIndexes: nextIndexes };
      }),
    }));
  };

  const buildQuestionsPayload = (strict) => {
    const questions = [];
    let order = 1;

    form.questions.forEach((q, idx) => {
      if (q.type === 'reading') {
        const trimmedOptions = (q.options || []).map((opt) => ({
          ...opt,
          text: (opt.text || '').trim(),
        }));
        let filledOptions = trimmedOptions.filter((o) => o.text);
        let correctCount = trimmedOptions.filter((o) => o.isCorrect && o.text).length;

        if (filledOptions.length > 0 && correctCount === 0) {
          const firstFilledIdx = trimmedOptions.findIndex((o) => o.text);
          if (firstFilledIdx >= 0) {
            trimmedOptions[firstFilledIdx].isCorrect = true;
            filledOptions = trimmedOptions.filter((o) => o.text);
            correctCount = 1;
          }
        }

        const snippet = (q.snippet || '').trim();
        const prompt = (q.prompt || '').trim();
        const hasContent = snippet || prompt || filledOptions.length > 0;
        const isComplete = snippet && prompt && filledOptions.length >= 2 && correctCount === 1;

        if (!hasContent) return;
        if (strict && !isComplete) {
          throw new Error(
            `Reading question #${idx + 1} needs snippet, prompt, 2+ options and exactly one correct answer.`
          );
        }

        questions.push({
          type: 0,
          order: order++,
          readingSnippet: q.snippet,
          prompt: q.prompt,
          answerOptions: trimmedOptions.map((opt) => ({
            text: opt.text,
            isCorrect: opt.isCorrect,
          })),
        });
        return;
      }

      if (q.type === 'writing' || q.type === 'speaking') {
        const prompt = (q.prompt || '').trim();
        if (!prompt) {
          if (strict) {
            throw new Error(`${q.type === 'writing' ? 'Writing' : 'Speaking'} question #${idx + 1} needs a prompt.`);
          }
          return;
        }
        questions.push({
          type: q.type === 'writing' ? 1 : 2,
          order: order++,
          prompt: q.prompt,
        });
        return;
      }

      if (q.type === 'fillBlank') {
        const prompt = (q.prompt || '').trim();
        const sentence = (q.sentence || '').trim();
        const { maskedSentence, answers } = buildFillBlankTemplate(q.sentence || '', q.blankTokenIndexes || []);
        const hasContent = prompt || sentence;
        const isComplete = prompt && sentence && answers.length > 0 && maskedSentence.includes('___');

        if (!hasContent) return;
        if (strict && !isComplete) {
          throw new Error(`Fill in the blank question #${idx + 1} needs a prompt, sentence, and at least one selected blank.`);
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

  const saveLesson = async (publish = false) => {
    if (!token) {
      setError('Please sign in again.');
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
    setError('');

    const lessonPayload = {
      title: form.title.trim(),
      dueDate: normaliseDate(form.dueDate),
    };

    try {
      let lessonId = editingLessonId;
      if (!lessonId) {
        const createRes = await fetch(`${API_BASE}/lessons`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(lessonPayload),
        });
        if (!createRes.ok) throw new Error((await createRes.text()) || 'Could not create lesson.');
        const created = await createRes.json();
        lessonId = created.id || created.Id;
      } else {
        const updateRes = await fetch(`${API_BASE}/lessons/${lessonId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(lessonPayload),
        });
        if (!updateRes.ok) throw new Error((await updateRes.text()) || 'Could not update lesson.');
      }

      // Questions and assignments
      const questions = buildQuestionsPayload(publish);
      if (questions.length > 0) {
        const qRes = await fetch(`${API_BASE}/lessons/${lessonId}/questions`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ questions }),
        });
        if (!qRes.ok) throw new Error((await qRes.text()) || 'Could not save questions.');
      } else if (publish) {
        throw new Error('Please add questions before publishing.');
      }

      if (form.classIds.length > 0) {
        const assignRes = await fetch(`${API_BASE}/lessons/${lessonId}/assign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ classIds: form.classIds }),
        });
        if (!assignRes.ok) throw new Error((await assignRes.text()) || 'Could not assign classes.');
      } else if (publish) {
        throw new Error('Select at least one class before publishing.');
      }

      if (publish) {
        const publishRes = await fetch(`${API_BASE}/lessons/${lessonId}/publish`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!publishRes.ok) throw new Error((await publishRes.text()) || 'Could not publish lesson.');
      }

      closeDialog();
      await reloadLessons(selectedClassId);
      if (publish) {
        toast.success('Lesson published and assigned to classes.');
      } else if (editingLessonId) {
        toast.success('Lesson changes saved.');
      } else {
        toast.success('Lesson created successfully.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save lesson.');
      toast.error(err.message || 'Failed to save lesson.');
    } finally {
      setIsSaving(false);
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

  const toggleClassSelection = (classId) => {
    setForm((prev) => {
      const exists = prev.classIds.includes(classId);
      return {
        ...prev,
        classIds: exists ? prev.classIds.filter((id) => id !== classId) : [...prev.classIds, classId],
      };
    });
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

      {isDialogOpen ? (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !isSaving && closeDialog()}>
            <div className="modal" ref={dialogRef}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Lesson</p>
                  <h3>{editingLessonId ? 'Edit lesson' : 'Create new lesson'}</h3>
                </div>
              <button type="button" className="ghost-btn small" onClick={closeDialog} disabled={isSaving}>
                Close
              </button>
            </div>

            <form className="lesson-form" ref={formContainerRef} onSubmit={(e) => e.preventDefault()}>
              <div className="form-row">
                <label>Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>

              <div className="form-row">
                <label>Due date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                  required
                />
              </div>

              <div className="form-row">
                <label>Assign to classes</label>
                <div className="chip-list">
                  {classes.map((cls) => {
                    const id = cls.id || cls.Id;
                    const selected = form.classIds.includes(id);
                    return (
                      <button
                        type="button"
                        key={id}
                        className={`chip ${selected ? 'active' : ''}`}
                        onClick={() => toggleClassSelection(id)}
                      >
                        {cls.name || cls.Name}
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
                  Start blank and add templates in any order. You need at least {MIN_PUBLISH_QUESTIONS} complete
                  questions to publish.
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

              {form.questions.map((q, idx) => {
                const title =
                  q.type === 'fillBlank'
                    ? 'Fill in the blank'
                    : q.type.charAt(0).toUpperCase() + q.type.slice(1);
                return (
                  <div className="question-group" key={q.id}>
                    <div className="group-header">
                      <div>
                        <p className="eyebrow">
                          Question {idx + 1} • {title}
                        </p>
                        <h4>
                          {q.type === 'reading'
                            ? 'Multiple choice'
                            : q.type === 'writing'
                              ? 'Essay prompt'
                              : q.type === 'fillBlank'
                                ? 'Fill in the blank'
                              : 'Oral response prompt'}
                        </h4>
                      </div>
                      <button type="button" className="ghost-btn small danger-text-btn" onClick={() => removeQuestion(q.id)}>
                        Remove
                      </button>
                    </div>

                    {q.type === 'reading' ? (
                      <div className="reading-card">
                        <div className="form-row">
                          <label>Reading snippet</label>
                          <textarea
                            rows={3}
                            value={q.snippet}
                            onChange={(e) => updateQuestion(q.id, 'snippet', e.target.value)}
                          />
                        </div>
                        <div className="form-row">
                          <label>Question prompt</label>
                          <input
                            type="text"
                            value={q.prompt}
                            onChange={(e) => updateQuestion(q.id, 'prompt', e.target.value)}
                          />
                        </div>
                        <div className="options-grid">
                          {q.options.map((opt, optIdx) => (
                            <div className="option-row" key={`${q.id}-opt-${optIdx}`}>
                              <input
                                type="text"
                                placeholder={`Option ${optIdx + 1}`}
                                value={opt.text}
                                onChange={(e) => updateReadingOption(q.id, optIdx, e.target.value, false)}
                              />
                              <label className="radio-label">
                                <input
                                  type="radio"
                                  name={`correct-${q.id}`}
                                  checked={opt.isCorrect}
                                  onChange={() => updateReadingOption(q.id, optIdx, opt.text || ' ', true)}
                                />
                                Correct
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : q.type === 'fillBlank' ? (
                      <div className="reading-card fill-blank-card">
                        <div className="form-row">
                          <label>Instruction prompt</label>
                          <textarea
                            rows={2}
                            value={q.prompt}
                            onChange={(e) => updateQuestion(q.id, 'prompt', e.target.value)}
                          />
                        </div>
                        <div className="form-row">
                          <label>Sentence</label>
                          <textarea
                            rows={3}
                            value={q.sentence || ''}
                            onChange={(e) => updateFillBlankSentence(q.id, e.target.value)}
                            placeholder="Type a sentence, then click word chips below to mark blanks."
                          />
                        </div>
                        <div className="form-row">
                          <label>Select blank word(s)</label>
                          <div className="fill-blank-token-picker" role="group" aria-label={`Select blanks for question ${idx + 1}`}>
                            {tokeniseFillBlankSentence(q.sentence || '').length === 0 ? (
                              <span className="muted-text">Add a sentence first.</span>
                            ) : (
                              tokeniseFillBlankSentence(q.sentence || '').map((token, tokenIdx) => {
                                if (!token.isWord) {
                                  return (
                                    <span key={`${q.id}-tok-${tokenIdx}`} className="fill-blank-separator">
                                      {token.text}
                                    </span>
                                  );
                                }
                                const isSelected = (q.blankTokenIndexes || []).includes(token.wordIndex);
                                return (
                                  <button
                                    type="button"
                                    key={`${q.id}-tok-${tokenIdx}`}
                                    className={`fill-blank-token ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggleFillBlankWord(q.id, token.wordIndex)}
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
                              const preview = buildFillBlankTemplate(q.sentence || '', q.blankTokenIndexes || []);
                              return preview.maskedSentence || 'Sentence preview will appear here.';
                            })()}
                          </div>
                          <div className="muted-text">
                            {(q.blankTokenIndexes || []).length} blank{(q.blankTokenIndexes || []).length === 1 ? '' : 's'} selected
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="form-row">
                        <label>Prompt</label>
                        <textarea
                          rows={3}
                          value={q.prompt}
                          onChange={(e) => updateQuestion(q.id, 'prompt', e.target.value)}
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
      ) : null}
    </PageLayout>
  );
}

export default Lessons;
