import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme, COURSES } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { CourseId, Question } from '../lib/types';
import { ALL_COURSE_IDS, questionKey } from '../lib/adminStore';
import {
  AdminButton,
  AdminCard,
  AdminChip,
  AdminConfirm,
  AdminEmpty,
  AdminField,
  AdminIconButton,
  AdminRow,
  AdminScaffold,
  AdminSearchBar,
  AdminSectionTitle,
  AdminSheet,
  AdminSpinner,
} from '../components/admin/ui';
import { AdminGate } from '../components/admin/AdminGate';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const OPTIONS_LIMIT = 5;

type Route = RouteProp<{ params: { courseId?: CourseId; topicDocId?: string } }, 'params'>;

interface Draft {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

const emptyDraft = (): Draft => ({
  id: '',
  question: '',
  options: ['', '', '', ''],
  answer: 0,
  explanation: '',
});

const toDraft = (q: Question): Draft => ({
  id: String(q.id),
  question: q.question,
  options: q.options.length >= 2 ? [...q.options] : [...q.options, ''],
  answer: q.answer,
  explanation: q.explanation || '',
});

export const AdminQuestionsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const admin = useAdmin();

  const [courseId, setCourseId] = useState<CourseId>(route.params?.courseId || 'tarih');
  const topics = admin.topicsFor(courseId);
  const [docId, setDocId] = useState<string>(
    route.params?.topicDocId || topics[0]?.docId || ''
  );
  const [search, setSearch] = useState('');
  const [liveRows, setLiveRows] = useState<Question[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<{ mode: 'add' | 'edit'; index: number } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [confirm, setConfirm] = useState<{ type: 'delete' | 'restore'; index: number } | null>(
    null
  );
  const [moveSheet, setMoveSheet] = useState<{ index: number } | null>(null);

  const override = admin.state.content.questions[questionKey(courseId, docId)] ?? null;
  const source = override ?? liveRows;
  const rows = useMemo(() => {
    const list = source || [];
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return list;
    return list.filter(
      item =>
        item.question.toLocaleLowerCase('tr-TR').includes(q) ||
        item.options.some(o => o.toLocaleLowerCase('tr-TR').includes(q))
    );
  }, [source, search]);

  const currentTopic = topics.find(t => t.docId === docId);

  useEffect(() => {
    if (!docId || override) return;
    let cancelled = false;
    setLoading(true);
    admin
      .loadQuestions(courseId, docId)
      .then(list => {
        if (!cancelled) setLiveRows(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, docId]);

  useEffect(() => {
    if (topics.length === 0) return;
    if (!topics.some(t => t.docId === docId)) {
      setDocId(topics[0].docId);
      setLiveRows(null);
    }
  }, [topics, docId]);

  /** Materializes the override store then applies the mutation. */
  const mutate = useCallback(
    async (fn: () => void) => {
      if (!docId) return;
      await admin.materializeQuestions(courseId, docId);
      fn();
    },
    [admin, courseId, docId]
  );

  const openAdd = () => {
    setDraft(emptyDraft());
    setSheet({ mode: 'add', index: -1 });
  };

  const openEdit = (index: number) => {
    const q = rows[index];
    if (!q) return;
    setDraft(toDraft(q));
    setSheet({ mode: 'edit', index });
  };

  const saveDraft = async () => {
    if (!draft.question.trim() || draft.options.filter(o => o.trim()).length < 2) return;
    const cleanOptions = draft.options.map(o => o.trim());
    const answer = Math.min(draft.answer, cleanOptions.length - 1);
    if (sheet?.mode === 'edit') {
      const target = rows[sheet.index];
      if (!target) return;
      await mutate(() =>
        admin.updateQuestion(courseId, docId, target.id, {
          question: draft.question.trim(),
          options: cleanOptions,
          answer,
          explanation: draft.explanation.trim(),
        })
      );
    } else {
      const id =
        draft.id.trim() ||
        `${docId}_admin_${Date.now().toString(36)}${Math.floor(Math.random() * 90 + 10)}`;
      await mutate(() =>
        admin.createQuestion(courseId, docId, {
          id,
          question: draft.question.trim(),
          options: cleanOptions,
          answer,
          explanation: draft.explanation.trim(),
          courseId,
          topicDocId: docId,
          topicName: currentTopic?.name,
        })
      );
    }
    setSheet(null);
  };

  const realIndex = (indexInView: number) => {
    const q = rows[indexInView];
    if (!q) return -1;
    return (source || []).findIndex(item => String(item.id) === String(q.id));
  };

  return (
    <AdminScaffold
      title="Soru Havuzu"
      subtitle={
        currentTopic
          ? `${COURSES[courseId].shortTitle} • ${currentTopic.name}`
          : 'Konu seç'
      }
      icon="document-text-outline"
      right={
        <AdminChip
          label={override ? 'Yerel liste' : 'Canlı'}
          tone={override ? 'warning' : 'success'}
          icon={override ? 'phone-portrait-outline' : 'cloud-outline'}
          compact
        />
      }
    >
      <AdminGate>
        <View style={styles.courseRow}>
          {ALL_COURSE_IDS.map(id => {
            const active = id === courseId;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  setCourseId(id);
                  const first = admin.topicsFor(id)[0];
                  setDocId(first?.docId || '');
                  setLiveRows(null);
                }}
                style={[
                  styles.courseTab,
                  {
                    backgroundColor: active ? COURSES[id].accentLight : colors.surface,
                    borderColor: active ? COURSES[id].accentLight : colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.courseTabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}
                >
                  {COURSES[id].shortTitle}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.topicStrip}>
          {topics.length === 0 && (
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              Bu derste konu yok — önce “Konular” bölümünden ekle.
            </Text>
          )}
          {topics.map(t => {
            const active = t.docId === docId;
            return (
              <Pressable
                key={t.docId}
                onPress={() => {
                  setDocId(t.docId);
                  setLiveRows(null);
                }}
                style={[
                  styles.topicChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.topicChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}
                >
                  {t.name}
                </Text>
                <Text
                  style={[
                    styles.topicChipCount,
                    { color: active ? 'rgba(255,255,255,0.85)' : colors.textMuted },
                  ]}
                >
                  {t.questionCount}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <AdminSearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Soru metninde veya şıklarda ara"
        />

        <View style={styles.bulkRow}>
          <AdminButton small label="Soru ekle" icon="add" onPress={openAdd} disabled={!docId} />
          <AdminButton
            small
            tone="neutral"
            label="Sırayı karıştır"
            icon="shuffle"
            disabled={!docId || !source || source.length < 2}
            onPress={() => mutate(() => admin.shuffleQuestions(courseId, docId))}
          />
          <AdminButton
            small
            tone="neutral"
            label="Testi aç"
            icon="play-circle-outline"
            disabled={!docId}
            onPress={() =>
              navigation.navigate('CourseTopics', { courseId } as never)
            }
          />
        </View>

        {loading ? (
          <AdminCard>
            <AdminSpinner label="Canlı soru listesi yükleniyor…" />
          </AdminCard>
        ) : rows.length === 0 ? (
          <AdminCard>
            <AdminEmpty
              icon="help-circle-outline"
              title={docId ? 'Bu konuda soru yok' : 'Konu seçilmedi'}
              hint={
                docId
                  ? 'Yeni soru ekleyerek bu konunun havuzunu oluşturabilirsin.'
                  : 'Yukarıdan bir konu seç.'
              }
              action={
                docId ? (
                  <AdminButton small label="Soru ekle" icon="add" onPress={openAdd} />
                ) : undefined
              }
            />
          </AdminCard>
        ) : (
          <>
            <AdminSectionTitle
              label={`${rows.length} soru`}
              hint={
                override
                  ? 'Yerel liste etkin — sıralama, düzenleme ve silmeler anında uygulamaya yansır.'
                  : 'Liste canlı veriden okunuyor; ilk düzenlemede kopyası oluşturulur.'
              }
            />
            <AdminCard pad={4}>
              {rows.map((q, i) => {
                const index = realIndex(i);
                return (
                  <AdminRow
                    key={String(q.id)}
                    compact
                    icon="help-outline"
                    title={`${index + 1}. ${q.question}`}
                    subtitle={`Doğru: ${LETTERS[q.answer] || '?'} — ${
                      (q.options[q.answer] || '').slice(0, 60) || 'şık yok'
                    }`}
                    onPress={() => openEdit(i)}
                    right={
                      <View style={styles.rowActions}>
                        <AdminIconButton
                          icon="chevron-up"
                          size={15}
                          disabled={index <= 0}
                          onPress={() => mutate(() => admin.moveQuestion(courseId, docId, index, -1))}
                        />
                        <AdminIconButton
                          icon="chevron-down"
                          size={15}
                          disabled={index >= (source?.length || 0) - 1}
                          onPress={() => mutate(() => admin.moveQuestion(courseId, docId, index, 1))}
                        />
                        <AdminIconButton
                          icon="copy-outline"
                          size={15}
                          onPress={() => mutate(() => admin.duplicateQuestion(courseId, docId, q.id))}
                        />
                        <AdminIconButton
                          icon="arrow-forward-circle-outline"
                          size={15}
                          onPress={() => setMoveSheet({ index })}
                        />
                        <AdminIconButton
                          icon="trash-outline"
                          size={15}
                          color={colors.danger}
                          onPress={() => setConfirm({ type: 'delete', index })}
                        />
                      </View>
                    }
                  />
                );
              })}
            </AdminCard>
          </>
        )}

        {!!override && (
          <View style={styles.resetRow}>
            <AdminButton
              label="Bu konunun sorularını buluttan geri yükle"
              tone="danger"
              icon="cloud-download-outline"
              onPress={() => setConfirm({ type: 'restore', index: -1 })}
              style={{ alignSelf: 'stretch' }}
            />
          </View>
        )}

        <View style={styles.footLinks}>
          <AdminButton
            small
            tone="ghost"
            label="Konu listesini yönet"
            icon="albums-outline"
            onPress={() => navigation.navigate('AdminTopics', { courseId, focusDocId: docId })}
            flex
          />
          <AdminButton
            small
            tone="ghost"
            label="Hap bilgiler"
            icon="bulb-outline"
            onPress={() => navigation.navigate('AdminTips')}
            flex
          />
        </View>
      </AdminGate>

      {/* Question editor */}
      <AdminSheet
        visible={!!sheet}
        title={sheet?.mode === 'add' ? 'Yeni soru' : 'Soruyu düzenle'}
        onClose={() => setSheet(null)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setSheet(null)} flex />
            <AdminButton
              label="Kaydet"
              icon="checkmark"
              onPress={saveDraft}
              disabled={
                !draft.question.trim() || draft.options.filter(o => o.trim()).length < 2
              }
              flex
            />
          </>
        }
      >
        <AdminField
          label="Soru metni"
          value={draft.question}
          onChangeText={t => setDraft(d => ({ ...d, question: t }))}
          multiline
          placeholder="Örn: Türkiye Cumhuriyeti’nin ilk başkenti aşağıdakilerden hangisidir?"
        />

        <Text style={[styles.optionsLabel, { color: colors.textSecondary }]}>
          Şıklar — doğru cevabı daireye dokunarak işaretle
        </Text>
        {draft.options.map((opt, i) => (
          <View key={i} style={styles.optionRow}>
            <Pressable
              onPress={() => setDraft(d => ({ ...d, answer: i }))}
              style={[
                styles.letter,
                {
                  backgroundColor: draft.answer === i ? colors.success : colors.surfaceSecondary,
                  borderColor: draft.answer === i ? colors.success : colors.border,
                },
              ]}
            >
              <Ionicons
                name={draft.answer === i ? 'checkmark' : 'ellipse-outline'}
                size={15}
                color={draft.answer === i ? '#FFFFFF' : colors.textMuted}
              />
            </Pressable>
            <View style={{ flex: 1 }}>
              <AdminField
                value={opt}
                onChangeText={t =>
                  setDraft(d => ({
                    ...d,
                    options: d.options.map((o, idx) => (idx === i ? t : o)),
                  }))
                }
                placeholder={`${LETTERS[i]}) şık metni`}
              />
            </View>
            <AdminIconButton
              icon="remove-circle-outline"
              size={18}
              color={colors.danger}
              disabled={draft.options.length <= 2}
              onPress={() =>
                setDraft(d => {
                  const options = d.options.filter((_, idx) => idx !== i);
                  return {
                    ...d,
                    options,
                    answer: Math.min(d.answer, options.length - 1),
                  };
                })
              }
            />
          </View>
        ))}
        <AdminButton
          small
          tone="ghost"
          label="Şık ekle"
          icon="add"
          disabled={draft.options.length >= OPTIONS_LIMIT}
          onPress={() => setDraft(d => ({ ...d, options: [...d.options, ''] }))}
          style={{ marginBottom: 14 }}
        />

        <AdminField
          label="Açıklama / çözüm"
          value={draft.explanation}
          onChangeText={t => setDraft(d => ({ ...d, explanation: t }))}
          multiline
          placeholder="Öğrencinin test sonrası göreceği açıklama"
        />

        {sheet?.mode === 'edit' && (
          <Text style={[styles.idHint, { color: colors.textMuted }]}>
            Soru kimliği: {draft.id} — değişiklik yapmadığın sürece sabit kalır (favori ve hata
            defteri bu kimliği kullanır).
          </Text>
        )}
      </AdminSheet>

      {/* Move to another topic */}
      <AdminSheet
        visible={!!moveSheet}
        title="Başka konuya taşı"
        onClose={() => setMoveSheet(null)}
      >
        {topics
          .filter(t => t.docId !== docId)
          .map(t => (
            <AdminRow
              key={t.docId}
              icon="folder-open-outline"
              title={t.name}
              subtitle={`${t.questionCount} soru`}
              right={<Ionicons name="arrow-forward" size={16} color={colors.primary} />}
              onPress={async () => {
                const index = moveSheet?.index ?? -1;
                const q = (source || [])[index];
                setMoveSheet(null);
                if (!q) return;
                await admin.moveQuestionToTopic(courseId, docId, t.docId, q.id);
              }}
            />
          ))}
        {topics.filter(t => t.docId !== docId).length === 0 && (
          <Text style={{ fontSize: 12.5, color: colors.textMuted, paddingBottom: 6 }}>
            Taşıyabileceğin başka konu yok.
          </Text>
        )}
      </AdminSheet>

      <AdminConfirm
        visible={confirm?.type === 'delete'}
        title="Soruyu sil"
        message="Soru konu havuzundan kaldırılacak. Öğrencilerin hata defterinde duran kopyaları etkilenmez."
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const index = confirm?.index ?? -1;
          const q = (source || [])[index];
          setConfirm(null);
          if (q) await mutate(() => admin.deleteQuestion(courseId, docId, q.id));
        }}
      />

      <AdminConfirm
        visible={confirm?.type === 'restore'}
        title="Buluttan geri yükle"
        confirmLabel="Sıfırla"
        message="Bu konudaki yerel soru listesi silinecek ve canlı Firestore içeriği geri gelecek."
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          setLiveRows(null);
          await admin.restoreTopicQuestions(courseId, docId);
        }}
      />
    </AdminScaffold>
  );
};

const styles = StyleSheet.create({
  courseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  courseTab: {
    flexBasis: '18%',
    flexGrow: 1,
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 7,
    alignItems: 'center',
  },
  courseTabText: { fontSize: 11.5, fontWeight: '800' },
  topicStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  topicChipText: { fontSize: 12, fontWeight: '700', maxWidth: 190 },
  topicChipCount: { fontSize: 10.5, fontWeight: '800' },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  resetRow: { marginTop: 14 },
  footLinks: { flexDirection: 'row', gap: 8, marginTop: 16 },
  optionsLabel: { fontSize: 11.5, fontWeight: '800', marginBottom: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  letter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  idHint: { fontSize: 11, lineHeight: 16, paddingBottom: 4 },
});
