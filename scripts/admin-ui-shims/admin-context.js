/*
 * useAdmin() sahtesi — SSR duman testi için sabit içerik.
 * `globalThis.__UI_ADMIN_SEED__` verilirse soru/konu listesi onunla değiştirilir.
 * Mutasyonlar `globalThis.__UI_CALLS__` içine yazılır (test oradan okur).
 */
import React from 'react';

export const ADMIN_SEED_QUESTIONS = [
  {
    id: 'q1',
    question: '1. Bucaş Antlaşması hangi padişah döneminde imzalanmıştır?',
    options: ['I. Ahmet', 'IV. Mehmet', 'II. Selim'],
    answer: 1,
    explanation: 'IV. Mehmet dönemi.',
  },
  {
    id: 'q2',
    question: '2. Aşağıdakilerden hangisi Bucaş Antlaşması’nın sonucudur?',
    options: ['Podolya katıldı', 'Boğazlar kapandı', 'Kıbrıs alındı'],
    answer: 0,
    explanation: '',
  },
  {
    id: 'q3',
    question: '3. Lehistan’ın baskı yaptığı topluluk hangisidir?',
    options: ['Ukrayna Kazakları', 'Sırplar', 'Arnavutlar'],
    answer: 0,
    explanation: '',
  },
  {
    id: 'q4',
    question: '4. Vergi maddesini iptal eden kurul hangisidir?',
    options: ['Diyet Meclisi', 'Avam Kamarası', 'Senato'],
    answer: 0,
    explanation: '',
  },
  {
    id: 'q5',
    question: '5. Bucaş Antlaşması hangi yıl imzalanmıştır?',
    options: ['1672', '1683', '1699'],
    answer: 0,
    explanation: '',
  },
];

export const ADMIN_SEED_TOPICS = [
  { docId: 'd1', id: 't1', name: 'Osmanlı-Lehistan Savaşları', questionCount: 5 },
  { docId: 'd2', id: 't2', name: 'Boş Konu', questionCount: 0 },
];

const key = (courseId, docId) => `${courseId}:${docId}`;

export function useAdmin() {
  return React.useMemo(() => {
    const seed = globalThis.__UI_ADMIN_SEED__ || {};
    const questions = seed.questions || ADMIN_SEED_QUESTIONS;
    const topics = seed.topics || ADMIN_SEED_TOPICS;
    const calls = (globalThis.__UI_CALLS__ = globalThis.__UI_CALLS__ || []);
    const rec = (name, args) => calls.push({ name, args });
    return {
      state: {
        ready: true,
        isAdmin: true,
        auth: { status: 'admin' },
        content: { questions: { [key('tarih', 'd1')]: questions }, tips: [] },
        activity: [],
        users: [],
        tips: [],
        settings: {},
      },
      topicsFor: courseId => topics.map(t => ({ ...t, courseId })),
      loadQuestions: async () => questions,
      materializeQuestions: async () => {},
      createQuestion: (c, d, q) => rec('createQuestion', [c, d, q && q.id]),
      createQuestions: (c, d, list) => rec('createQuestions', [c, d, (list || []).map(x => x.id)]),
      updateQuestion: (c, d, id) => rec('updateQuestion', [c, d, id]),
      deleteQuestion: (c, d, id) => rec('deleteQuestion', [c, d, id]),
      deleteQuestions: (c, d, ids) => rec('deleteQuestions', [c, d, ids]),
      duplicateQuestion: (c, d, id) => rec('duplicateQuestion', [c, d, id]),
      moveQuestion: (c, d, index, dir) => rec('moveQuestion', [c, d, index, dir]),
      moveQuestionToTopic: (c, index, to) => rec('moveQuestionToTopic', [c, index, to]),
      shuffleQuestions: (c, d) => rec('shuffleQuestions', [c, d]),
      restoreTopicQuestions: (c, d) => rec('restoreTopicQuestions', [c, d]),
      login: () => {},
      logout: () => {},
    };
  }, []);
}

export const AdminProvider = ({ children }) => children;
