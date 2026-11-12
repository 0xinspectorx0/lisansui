import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme, COURSE_LIST, COURSES } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { useApp } from '../lib/AppContext';
import { CourseId } from '../lib/types';
import {
  AdminButton,
  AdminCard,
  AdminChip,
  AdminField,
  AdminIconButton,
  AdminScaffold,
  AdminSectionTitle,
  AdminSheet,
} from '../components/admin/ui';
import { AdminGate } from '../components/admin/AdminGate';

export const AdminCoursesScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const { catalog } = useApp();
  const admin = useAdmin();
  const { courseOrder, hiddenCourses, settings } = admin;
  const [editor, setEditor] = useState<{ courseId: CourseId; title: string } | null>(null);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= courseOrder.length) return;
    const next = [...courseOrder];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    admin.setCourseOrder(next);
  };

  return (
    <AdminScaffold
      title="Dersler"
      subtitle="Ana ekrandaki kart sırası, görünürlük ve başlıklar"
      icon="grid-outline"
      right={
        <AdminChip
          label={`${courseOrder.length - hiddenCourses.length} görünür`}
          tone={hiddenCourses.length ? 'warning' : 'success'}
          compact
        />
      }
    >
      <AdminGate>
        <AdminSectionTitle
          label="Sıra ve görünürlük"
          hint="Oklarla sırayı değiştir; göz simgesi dersi ana ekrandan kaldırır (ilerleme kayıtları korunur)."
        />
        {courseOrder.map((id, i) => {
          const cfg = COURSES[id];
          const hidden = hiddenCourses.includes(id);
          const topicCount = catalog[id]?.length || 0;
          const questionCount = (catalog[id] || []).reduce((s, t) => s + (t.questionCount || 0), 0);
          const customTitle = admin.state.content.courseTitles[id];
          return (
            <View
              key={id}
              style={[
                styles.courseCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: hidden ? colors.border : colors.borderStrong,
                  opacity: hidden ? 0.62 : 1,
                },
              ]}
            >
              <View style={[styles.courseBadge, { backgroundColor: colors.isDark ? cfg.softBgDark : cfg.softBgLight }]}>
                <Ionicons name={cfg.icon as any} size={19} color={colors.isDark ? cfg.accentDark : cfg.accentLight} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.courseTitle, { color: colors.text }]}>
                    {i + 1}. {customTitle || cfg.title}
                  </Text>
                  {hidden && <AdminChip label="Gizli" tone="danger" compact />}
                  {customTitle && <AdminChip label="Yeniden adlandırıldı" tone="info" compact />}
                </View>
                <Text style={[styles.courseSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {cfg.subtitle}
                </Text>
                <Text style={[styles.courseMeta, { color: colors.textSecondary }]}>
                  {topicCount} konu • {questionCount.toLocaleString('tr-TR')} soru
                </Text>
              </View>
              <View style={styles.courseActions}>
                <AdminIconButton icon="chevron-up" size={15} disabled={i === 0} onPress={() => move(i, -1)} />
                <AdminIconButton
                  icon="chevron-down"
                  size={15}
                  disabled={i === courseOrder.length - 1}
                  onPress={() => move(i, 1)}
                />
                <AdminIconButton
                  icon={hidden ? 'eye-off-outline' : 'eye-outline'}
                  size={15}
                  onPress={() => admin.toggleCourseHidden(id)}
                />
                <AdminIconButton
                  icon="create-outline"
                  size={15}
                  onPress={() => setEditor({ courseId: id, title: customTitle || cfg.title })}
                />
              </View>
            </View>
          );
        })}

        <AdminSectionTitle label="Ana ekran" hint="Kart sırası ve görünürlük burada, test boyutu Ayarlar’da" />
        <AdminCard>
          <View style={styles.karmaRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
                Test başına soru: {settings.quizDefaults.questionCount}
              </Text>
              <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2, lineHeight: 16 }}>
                Konu testleri bu büyüklükte bölünür; karma deneme 25 soru olarak hazırlanır.
              </Text>
            </View>
            <AdminChip
              label="Ayarlar"
              tone="info"
              compact
              onPress={() => navigation.navigate('AdminSettings')}
            />
          </View>
        </AdminCard>

        <View style={styles.footer}>
          <AdminButton
            label="Varsayılan sıraya dön"
            tone="neutral"
            icon="reorder-two-outline"
            onPress={() => admin.setCourseOrder(COURSE_LIST.map(c => c.id))}
            flex
          />
          <AdminButton
            label="Tümünü görünür yap"
            tone="ghost"
            icon="eye-outline"
            onPress={() => hiddenCourses.forEach(id => admin.toggleCourseHidden(id))}
            disabled={hiddenCourses.length === 0}
            flex
          />
        </View>
      </AdminGate>

      <AdminSheet
        visible={!!editor}
        title="Ders başlığı"
        onClose={() => setEditor(null)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setEditor(null)} flex />
            <AdminButton
              label="Kaydet"
              icon="checkmark"
              onPress={() => {
                if (editor) admin.renameCourse(editor.courseId, editor.title);
                setEditor(null);
              }}
              flex
            />
          </>
        }
      >
        <AdminField
          label="Ana ekranda görünecek ad"
          value={editor?.title || ''}
          onChangeText={t => setEditor(prev => (prev ? { ...prev, title: t } : prev))}
          placeholder="Örn: Tarih (GY)"
          hint="Boş bırakırsan orijinal ders adı kullanılır."
        />
        <View style={styles.iconPick}>
          <Ionicons name="image-outline" size={15} color={colors.primary} />
          <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1, lineHeight: 17 }}>
            Ders rengi ve simgesi <Text style={{ fontWeight: '800' }}>lib/theme.ts</Text> içindeki
            COURSES tablosunda tanımlıdır — oradaki accent/ikon değerlerini değiştirdiğinde tüm
            uygulama anında yeni kimliği kullanır.
          </Text>
        </View>
      </AdminSheet>

    </AdminScaffold>
  );
};

const styles = StyleSheet.create({
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  courseBadge: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  courseTitle: { fontSize: 14, fontWeight: '900', flexShrink: 1 },
  courseSub: { fontSize: 11, marginTop: 2 },
  courseMeta: { fontSize: 11.5, marginTop: 3, fontWeight: '700' },
  courseActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  karmaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footer: { flexDirection: 'row', gap: 8, marginTop: 12 },
  iconPick: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingBottom: 4 },
});
