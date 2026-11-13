import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme, COURSES } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { CourseId, Question } from '../lib/types';
import { ALL_COURSE_IDS, questionKey } from '../lib/adminStore';
import {
  BULK_DEFAULT_MAX,
  formatBulkSummary,
  parseQuestionBulk,
  sampleBulkText,
} from '../lib/questionBulk';
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
  AdminSegmented,
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
  // Konu seçici: kapalıyken yalnız SEÇİLİ konu görünür, dokununca diğerleri açılır.
  const [pickerOpen, setPickerOpen] = useState(false);
  // "Soru ekle" sheet'i: tekli form mu, toplu yapıştırma mı?
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulk = useMemo(() => parseQuestionBulk(bulkText, { maxItems: BULK_DEFAULT_MAX }), [bulkText]);
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

  const openAdd = (mode: 'single' | 'bulk' = 'single') => {
    setAddMode(mode);
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

  /**
   * Toplu ekleme: ayrıştırıcı zaten doğruladı; burada yalnızca id'leri çakışma-
   * sız hale getirip TEK bir mutation ile listeye ekliyoruz (N soru = 1 yazma).
   */
  const applyBulk = async () => {
    if (!docId || !bulk.items.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      await admin.materializeQuestions(courseId, docId);
      const current = admin.state.content.questions[questionKey(courseId, docId)] ?? [];
      const used = new Set(current.map(q => String(q.id)));
      const stamp = Date.now().toString(36);
      const list: Question[] = bulk.items.map((item, i) => {
        const base = item.id || `${docId}_admin_${stamp}_${i}`;
        let id = base;
        let n = 2;
        while (used.has(id)) id = `${base}_${n++}`;
        used.add(id);
        return {
          id,
          question: item.question,
          options: item.options,
          answer: item.answer,
          explanation: item.explanation,
          courseId,
          topicDocId: docId,
          topicName: currentTopic?.name,
        };
      });
      admin.createQuestions(courseId, docId, list);
      setSearch('');
      setBulkText('');
      setSheet(null);
    } finally {
      setBulkBusy(false);
    }
  };

  /** Sheet şu an "toplu ekleme" ekranını mı gösteriyor? */
  const isBulkAdd = sheet?.mode === 'add' && addMode === 'bulk';

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

        {topics.length === 0 ? (
          <AdminCard>
            <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 17 }}>
              Bu derste konu yok — önce “Konular” bölümünden ekle.
            </Text>
          </AdminCard>
        ) : (
          <>
              {/* KAPALI hâl: dersin altında tek satır = seçili konu. Dokununca diğer konular açılır. */}
              <Pressable
                onPress={() => topics.length > 1 && setPickerOpen(o => !o)}
                style={[
                  styles.topicHead,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={[styles.topicIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="albums-outline" size={15} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.topicHeadName, { color: colors.text }]}>
                    {currentTopic ? currentTopic.name : 'Konu seç'}
                  </Text>
                  <Text style={[styles.topicHeadMeta, { color: colors.textMuted }]}>
                    {currentTopic
                      ? `${currentTopic.questionCount} soru · ${topics.length} konudan ${
                          topics.findIndex(t => t.docId === docId) + 1
                        }.`
                      : `${topics.length} konu var`}
                    {topics.length > 1 ? ' — diğerleri için dokun' : ''}
                  </Text>
                </View>
                {topics.length > 1 && (
                  <Ionicons
                    name={pickerOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                  />
                )}
              </Pressable>

              {/* AÇIK hâl: hangisini istiyorsa ona tıklar, liste kapanır. */}
              {pickerOpen && topics.length > 1 && (
                <AdminCard pad={4}>
                  <View style={styles.pickerHead}>
                    <Text style={[styles.pickerHeadText, { color: colors.textSecondary }]}>
                      Konu seç — {topics.length} kayıt
                    </Text>
                    <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.primary }}>
                        Kapat
                      </Text>
                    </Pressable>
                  </View>
                  <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
                    {topics.map((t, i) => {
                      const active = t.docId === docId;
                      return (
                        <Pressable
                          key={t.docId}
                          onPress={() => {
                            setDocId(t.docId);
                            setLiveRows(null);
                            setPickerOpen(false);
                          }}
                          style={[
                            styles.pickerRow,
                            {
                              borderColor: colors.border,
                              backgroundColor: active ? colors.primarySoft : 'transparent',
                            },
                          ]}
                        >
                          <Text style={[styles.pickerIdx, { color: colors.textMuted }]}>{i + 1}</Text>
                          <Text
                            numberOfLines={2}
                            style={[styles.pickerName, { color: active ? colors.primary : colors.text }]}
                          >
                            {t.name}
                          </Text>
                          <Text style={[styles.pickerCount, { color: colors.textMuted }]}>
                            {t.questionCount}
                          </Text>
                          {active && <Ionicons name="checkmark-circle" size={17} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </AdminCard>
              )}
            </>
          )}

          <AdminSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Soru metninde veya şıklarda ara"
          />

          <View style={styles.bulkRow}>
            <AdminButton
              small
              label="Tekli soru ekle"
              icon="add"
              onPress={() => openAdd('single')}
              disabled={!docId}
            />
            <AdminButton
              small
              tone="neutral"
              label="Toplu ekle"
              icon="albums-outline"
              onPress={() => openAdd('bulk')}
              disabled={!docId}
            />
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
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      <AdminButton small label="Tekli soru ekle" icon="add" onPress={() => openAdd('single')} />
                      <AdminButton
                        small
                        tone="neutral"
                        label="Toplu ekle"
                        icon="albums-outline"
                        onPress={() => openAdd('bulk')}
                      />
                    </View>
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

        {/* Question editor — Tekli form veya Toplu yapıştırma */}
        <AdminSheet
          visible={!!sheet}
          title={
            sheet?.mode === 'edit' ? 'Soruyu düzenle' : addMode === 'bulk' ? 'Toplu soru ekle' : 'Tekli soru ekle'
          }
          onClose={() => setSheet(null)}
          footer={
            <>
              <AdminButton label="Vazgeç" tone="neutral" onPress={() => setSheet(null)} flex />
              {isBulkAdd ? (
                <AdminButton
                  label={bulkBusy ? 'Ekleniyor…' : bulk.items.length ? `${bulk.items.length} soruyu ekle` : 'Soru ekleyin'}
                  icon="cloud-upload-outline"
                  onPress={applyBulk}
                  disabled={!docId || !bulk.items.length || bulkBusy}
                  flex
                />
              ) : (
                <AdminButton
                  label="Kaydet"
                  icon="checkmark"
                  onPress={saveDraft}
                  disabled={
                    !draft.question.trim() || draft.options.filter(o => o.trim()).length < 2
                  }
                  flex
                />
              )}
            </>
          }
        >
          {sheet?.mode === 'add' && (
            <AdminSegmented
              label="Ekleme biçimi"
              value={addMode}
              onChange={id => setAddMode(id as 'single' | 'bulk')}
              options={[
                { id: 'single', label: 'Tekli soru' },
                { id: 'bulk', label: 'Toplu içe aktar' },
              ]}
            />
          )}

          {isBulkAdd ? (
            <>
              <Text style={[styles.bulkHint, { color: colors.textSecondary }]}>
                Hedef konu: {currentTopic ? currentTopic.name : '—'} · tek seferde en fazla{' '}
                {BULK_DEFAULT_MAX} soru. İki biçim kabul edilir: JSON dizisi veya boş satırla
                ayrılmış metin blokları.
              </Text>
              <AdminField
                label="Soru listesi"
                value={bulkText}
                onChangeText={setBulkText}
                multiline
                autoCapitalize="none"
                hint={formatBulkSummary(bulk)}
                placeholder={'Hangisi...?\nA) ilk\nB) ikinci\nC) üçüncü\nD) dördüncü\nDoğru: B\nAçıklama: kısa gerekçe\n\n'}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <AdminButton
                  small
                  tone="ghost"
                  label="Örnek biçimi doldur"
                  icon="sparkles-outline"
                  onPress={() => setBulkText(sampleBulkText())}
                />
                <AdminButton
                  small
                  tone="neutral"
                  label="Metni temizle"
                  icon="close-outline"
                  onPress={() => setBulkText('')}
                  disabled={!bulkText.trim()}
                />
              </View>

              {bulk.items.length > 0 && (
                <AdminCard pad={10}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: 6 }}>
                    İlk {Math.min(3, bulk.items.length)} kayıt böyle anlaşılıyor
                  </Text>
                  {bulk.items.slice(0, 3).map((q, i) => (
                    <View key={`prev-${i}`} style={{ marginBottom: 8 }}>
                      <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '700', color: colors.text, lineHeight: 17 }}>
                        {i + 1}. {q.question}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 11, color: colors.success, marginTop: 2 }}>
                        Doğru: {LETTERS[q.answer]}) {q.options[q.answer]}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 10.5, color: colors.textMuted }}>
                        {q.options.length} şık{q.explanation ? ' · açıklama var' : ' · açıklama yok'}
                      </Text>
                    </View>
                  ))}
                </AdminCard>
              )}

              {bulk.issues.length > 0 && (
                <AdminCard pad={10}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.danger, marginBottom: 6 }}>
                    {bulk.issues.length} kayıt alınamadı (düzeltilirse onlar da eklenir)
                  </Text>
                  {bulk.issues.slice(0, 6).map((iss, i) => (
                    <Text key={`iss-${i}`} style={[styles.bulkIssue, { color: colors.textSecondary }]}>
                      {iss.block ? `${iss.block}. kayıt: ` : ''}
                      {iss.message}
                      {iss.excerpt ? ` — “${iss.excerpt}”` : ''}
                    </Text>
                  ))}
                  {bulk.issues.length > 6 && (
                    <Text style={[styles.bulkIssue, { color: colors.textMuted }]}>
                      +{bulk.issues.length - 6} kayıt daha
                    </Text>
                  )}
                </AdminCard>
              )}
            </>
          ) : (
            <>
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
          </>
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
  topicHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  topicIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  topicHeadName: { fontSize: 13.5, fontWeight: '800' },
  topicHeadMeta: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  pickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
  },
  pickerHeadText: { fontSize: 11, fontWeight: '800' },
  pickerList: { maxHeight: 300 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  pickerIdx: { fontSize: 10.5, fontWeight: '800', width: 20 },
  pickerName: { flex: 1, fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  pickerCount: { fontSize: 10.5, fontWeight: '800' },
  bulkHint: { fontSize: 11.5, lineHeight: 17 },
  bulkIssue: { fontSize: 11, lineHeight: 16 },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  resetRow: { marginTop: 14 },
  footLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
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
