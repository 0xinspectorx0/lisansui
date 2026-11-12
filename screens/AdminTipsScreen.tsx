import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { getTipsOverride } from '../lib/adminStore';
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
} from '../components/admin/ui';
import { AdminGate } from '../components/admin/AdminGate';

export const AdminTipsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const admin = useAdmin();
  const tips = admin.tips;
  const overridden = getTipsOverride() !== null;

  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<{ mode: 'add' | 'edit'; index: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState<{ type: 'delete' | 'restore'; index: number } | null>(
    null
  );

  const filtered = search.trim()
    ? tips.filter(t => t.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR')))
    : tips;

  const realIndex = (viewIndex: number) => {
    const tip = filtered[viewIndex];
    return tips.indexOf(tip);
  };

  return (
    <AdminScaffold
      title="Hap Bilgiler"
      subtitle={`${tips.length} madde • kullanıcılar kart geçişiyle okur`}
      icon="bulb-outline"
      right={
        <AdminChip
          label={overridden ? 'Yerel liste' : 'Canlı'}
          tone={overridden ? 'warning' : 'success'}
          icon={overridden ? 'phone-portrait-outline' : 'cloud-outline'}
          compact
        />
      }
    >
      <AdminGate>
        <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Hap bilgide ara" />

        <View style={styles.topRow}>
          <AdminButton
            small
            label="Yeni hap bilgi"
            icon="add"
            onPress={() => {
              setDraft('');
              setSheet({ mode: 'add', index: -1 });
            }}
          />
          <AdminButton
            small
            tone="neutral"
            label="Başa ekle"
            icon="arrow-up-circle-outline"
            onPress={() => {
              setDraft('');
              setSheet({ mode: 'add', index: 0 });
            }}
          />
        </View>

        {filtered.length === 0 ? (
          <AdminCard>
            <AdminEmpty
              icon="bulb-outline"
              title={tips.length === 0 ? 'Liste boş' : 'Sonuç yok'}
              hint={
                tips.length === 0
                  ? 'İlk hap bilgiyi ekle — ana ekrandaki kartta ve Hap Bilgi sekmesinde görünür.'
                  : 'Aramayı temizle.'
              }
            />
          </AdminCard>
        ) : (
          <>
            <AdminSectionTitle
              label={`${filtered.length} madde`}
              hint="Oklar sırayı değiştirir; sıradaki madde ana ekrandaki “günün hap bilgisi” rotasyonunu etkiler."
            />
            <AdminCard pad={4}>
              {filtered.map((tip, i) => {
                const index = realIndex(i);
                return (
                  <AdminRow
                    key={`${index}_${tip.slice(0, 16)}`}
                    compact
                    icon="flash-outline"
                    title={`${index + 1}. ${tip}`}
                    onPress={() => {
                      setDraft(tip);
                      setSheet({ mode: 'edit', index });
                    }}
                    right={
                      <View style={styles.rowActions}>
                        <AdminIconButton
                          icon="chevron-up"
                          size={15}
                          disabled={index <= 0}
                          onPress={() => admin.moveTip(index, -1)}
                        />
                        <AdminIconButton
                          icon="chevron-down"
                          size={15}
                          disabled={index >= tips.length - 1}
                          onPress={() => admin.moveTip(index, 1)}
                        />
                        <AdminIconButton
                          icon="create-outline"
                          size={15}
                          onPress={() => {
                            setDraft(tip);
                            setSheet({ mode: 'edit', index });
                          }}
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

        {overridden && (
          <View style={styles.resetRow}>
            <AdminButton
              label="Listeyi buluttan geri yükle"
              tone="danger"
              icon="cloud-download-outline"
              onPress={() => setConfirm({ type: 'restore', index: -1 })}
              style={{ alignSelf: 'stretch' }}
            />
            <Text style={[styles.resetHint, { color: colors.textMuted }]}>
              Yerel liste silinir, kpssasistani.com üzerindeki canlı liste geri gelir.
            </Text>
          </View>
        )}
      </AdminGate>

      <AdminSheet
        visible={!!sheet}
        title={sheet?.mode === 'add' ? 'Yeni hap bilgi' : 'Hap bilgiyi düzenle'}
        onClose={() => setSheet(null)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setSheet(null)} flex />
            <AdminButton
              label="Kaydet"
              icon="checkmark"
              disabled={!draft.trim()}
              onPress={() => {
                if (sheet?.mode === 'add') admin.addTip(draft, sheet.index === 0 ? 0 : undefined);
                else if (sheet) admin.updateTip(sheet.index, draft);
                setSheet(null);
              }}
              flex
            />
          </>
        }
      >
        <AdminField
          label="Metin"
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder="Örn: Kurtuluş Savaşı’nın ilk cepheleri: Güney (Kilikya), Doğu, Sarıkamış…"
          hint="Tek cümle, 240 karakteri geçmezse kartta bölünmeden okunur."
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
          <Ionicons name="information-circle" size={14} color={colors.textMuted} />
          <Text style={{ fontSize: 11.5, color: colors.textMuted, flex: 1, lineHeight: 16 }}>
            Öğrencilerin “öğrendim / kaydettim” işaretleri metne bağlıdır; metni değiştirmek
            işaretleri sıfırlar.
          </Text>
        </View>
      </AdminSheet>

      <AdminConfirm
        visible={confirm?.type === 'delete'}
        title="Hap bilgiyi sil"
        message="Madde listeden kaldırılacak."
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) admin.deleteTip(confirm.index);
          setConfirm(null);
        }}
      />

      <AdminConfirm
        visible={confirm?.type === 'restore'}
        title="Buluttan geri yükle"
        confirmLabel="Sıfırla"
        message="Yaptığın tüm hap bilgi düzenlemeleri silinecek."
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await admin.restoreTips();
        }}
      />
    </AdminScaffold>
  );
};

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  resetRow: { marginTop: 16, gap: 6 },
  resetHint: { fontSize: 11.5, lineHeight: 16, textAlign: 'center' },
});
