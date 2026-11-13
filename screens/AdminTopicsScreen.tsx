import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useAppTheme, COURSES } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { CourseId, TopicMeta } from '../lib/types';
import { ALL_COURSE_IDS, getTopicsOverride } from '../lib/adminStore';
import {
  AdminButton,
  AdminCard,
  AdminChip,
  AdminConfirm,
  AdminEmpty,
  AdminField,
  AdminIconButton,
  AdminRow,
  AdminSectionTitle,
  AdminSheet,
  AdminScaffold,
} from '../components/admin/ui';
import { AdminGate } from '../components/admin/AdminGate';

type Route = RouteProp<
  { params: { courseId?: CourseId; focusDocId?: string } },
  'params'
>;

export const AdminTopicsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const admin = useAdmin();

  const [courseId, setCourseId] = useState<CourseId>(route.params?.courseId || 'tarih');
  const [sheet, setSheet] = useState<{ mode: 'add' | 'rename'; topic?: TopicMeta } | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [confirm, setConfirm] = useState<{ type: 'delete' | 'restore'; topic?: TopicMeta } | null>(
    null
  );

  const topics = admin.topicsFor(courseId);
  const overridden = getTopicsOverride(courseId) !== null;
  const totalQuestions = useMemo(
    () => topics.reduce((s, t) => s + (t.questionCount || 0), 0),
    [topics]
  );

  const openAdd = () => {
    setNameDraft('');
    setSheet({ mode: 'add' });
  };

  const openRename = (topic: TopicMeta) => {
    setNameDraft(topic.name);
    setSheet({ mode: 'rename', topic });
  };

  const submitSheet = () => {
    if (!sheet) return;
    if (sheet.mode === 'add') {
      admin.addTopic(courseId, nameDraft);
    } else if (sheet.topic) {
      admin.renameTopic(courseId, sheet.topic.docId, nameDraft);
    }
    setSheet(null);
  };

  return (
    <AdminScaffold
      title="Konu & Katalog Yönetimi"
      subtitle={`${topics.length} konu • ${totalQuestions.toLocaleString('tr-TR')} soru`}
      icon="albums-outline"
      right={
        <AdminChip
          label={overridden ? 'Yerel düzenleme' : 'Bulut verisi'}
          tone={overridden ? 'warning' : 'success'}
          icon={overridden ? 'phone-portrait-outline' : 'cloud-outline'}
          compact
          onPress={() => (overridden ? setConfirm({ type: 'restore' }) : undefined)}
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
                onPress={() => setCourseId(id)}
                style={[
                  styles.courseTab,
                  {
                    backgroundColor: active ? COURSES[id].accentLight : colors.surface,
                    borderColor: active ? COURSES[id].accentLight : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.courseTabText,
                    { color: active ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {COURSES[id].shortTitle}
                </Text>
                <Text
                  style={[
                    styles.courseTabCount,
                    { color: active ? 'rgba(255,255,255,0.85)' : colors.textMuted },
                  ]}
                >
                  {admin.topicsFor(id).length}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <AdminSectionTitle
          label="Sıra"
          hint="Oklarla konuların sırasını değiştir; kullanıcılar ana ekranda bu sırayı görür. Satıra dokunarak sorularını yönetebilirsin."
        />

        {topics.length === 0 ? (
          <AdminCard>
            <AdminEmpty
              icon="file-tray-outline"
              title="Bu derste konu yok"
              hint="Yeni bir konu ekleyip soru havuzunu oluşturabilirsin."
              action={<AdminButton small label="Konu ekle" icon="add" onPress={openAdd} />}
            />
          </AdminCard>
        ) : (
          <AdminCard pad={4}>
            {topics.map((t, i) => (
              <AdminRow
                key={t.docId}
                compact
                icon={t.docId.startsWith('admin_') ? 'sparkles-outline' : 'document-text-outline'}
                title={`${i + 1}. ${t.name}`}
                subtitle={
                  t.questionCount > 0
                    ? `${t.questionCount} soru • docId: ${t.docId}`
                    : `Soru yok • docId: ${t.docId}`
                }
                onPress={() =>
                  navigation.navigate('AdminQuestions', { courseId, topicDocId: t.docId })
                }
                right={
                  <View style={styles.rowActions}>
                    <AdminIconButton
                      icon="chevron-up"
                      size={15}
                      disabled={i === 0}
                      onPress={() => admin.moveTopic(courseId, i, -1)}
                    />
                    <AdminIconButton
                      icon="chevron-down"
                      size={15}
                      disabled={i === topics.length - 1}
                      onPress={() => admin.moveTopic(courseId, i, 1)}
                    />
                    <AdminIconButton
                      icon="copy-outline"
                      size={15}
                      onPress={() => admin.duplicateTopic(courseId, t.docId)}
                    />
                    <AdminIconButton
                      icon="create-outline"
                      size={15}
                      onPress={() => openRename(t)}
                    />
                    <AdminIconButton
                      icon="trash-outline"
                      size={15}
                      color={colors.danger}
                      onPress={() => setConfirm({ type: 'delete', topic: t })}
                    />
                  </View>
                }
              />
            ))}
          </AdminCard>
        )}

        <View style={styles.actions}>
          <AdminButton label="Konu ekle" icon="add" onPress={openAdd} flex />
          <AdminButton
            label="Soru havuzu"
            tone="ghost"
            icon="help-circle-outline"
            onPress={() => navigation.navigate('AdminQuestions', { courseId })}
            flex
          />
        </View>

        {overridden && (
          <View style={styles.resetRow}>
            <AdminButton
              label="Bu dersin konularını buluttan geri yükle"
              tone="danger"
              icon="cloud-download-outline"
              onPress={() => setConfirm({ type: 'restore' })}
              style={{ alignSelf: 'stretch' }}
            />
            <Text style={[styles.resetHint, { color: colors.textMuted }]}>
              Yerel tüm konu ve soru düzenlemeleri silinir, Firestore içeriği geri gelir.
            </Text>
          </View>
        )}
      </AdminGate>

      <AdminSheet
        visible={!!sheet}
        title={sheet?.mode === 'add' ? 'Yeni konu' : 'Konu adı'}
        onClose={() => setSheet(null)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setSheet(null)} flex />
            <AdminButton
              label={sheet?.mode === 'add' ? 'Ekle' : 'Kaydet'}
              onPress={submitSheet}
              disabled={!nameDraft.trim()}
              flex
            />
          </>
        }
      >
        <AdminField
          label="Konu adı"
          value={nameDraft}
          onChangeText={setNameDraft}
          placeholder="Örn: Kurtuluş Savaşı Cepheleri"
        />
        {sheet?.mode === 'add' ? (
          <Text style={[styles.sheetHint, { color: colors.textMuted }]}>
            Yeni konu boş bir soru listesiyle oluşturulur; ekledikten sonra soruları girebilirsin.
          </Text>
        ) : (
          <View style={styles.sheetSortRow}>
            <AdminButton
              small
              tone="ghost"
              icon="chevron-up"
              label="Başa taşı"
              onPress={() => {
                if (sheet?.topic) admin.sendTopicTo(courseId, sheet.topic.docId, 'top');
                setSheet(null);
              }}
              flex
            />
            <AdminButton
              small
              tone="ghost"
              icon="chevron-down"
              label="Sona taşı"
              onPress={() => {
                if (sheet?.topic) admin.sendTopicTo(courseId, sheet.topic.docId, 'bottom');
                setSheet(null);
              }}
              flex
            />
            <AdminButton
              small
              tone="neutral"
              icon="copy-outline"
              label="Kopyala"
              onPress={() => {
                if (sheet?.topic) admin.duplicateTopic(courseId, sheet.topic.docId);
                setSheet(null);
              }}
              flex
            />
          </View>
        )}
      </AdminSheet>

      <AdminConfirm
        visible={confirm?.type === 'delete'}
        title="Konuyu sil"
        message={`“${confirm?.topic?.name}” ve bu konudaki tüm sorular listeden kaldırılacak. Emin misin?`}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.topic) admin.deleteTopic(courseId, confirm.topic.docId);
          setConfirm(null);
        }}
      />

      <AdminConfirm
        visible={confirm?.type === 'restore'}
        title="Buluttan geri yükle"
        message="Bu derste yaptığın tüm yerel konu ve soru düzenlemeleri silinecek. Devam edilsin mi?"
        confirmLabel="Sıfırla"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await admin.restoreCourseTopics(courseId);
        }}
      />
    </AdminScaffold>
  );
};

const styles = StyleSheet.create({
  courseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  courseTab: {
    flexBasis: '31%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  courseTabText: { fontSize: 12, fontWeight: '800' },
  courseTabCount: { fontSize: 10.5 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  resetRow: { marginTop: 16, gap: 6 },
  resetHint: { fontSize: 11.5, lineHeight: 16, textAlign: 'center' },
  sheetHint: { fontSize: 12, lineHeight: 17 },
  sheetSortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2, paddingBottom: 4 },
});
