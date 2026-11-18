import React, { useCallback, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  LinkingOptions,
  createNavigationContainerRef,
  StackActions,
  getStateFromPath as defaultGetStateFromPath,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { ThemeProvider, useAppTheme } from './lib/theme';
import { AppProvider, useApp } from './lib/AppContext';
import { AdminProvider } from './lib/AdminContext';
import { MembershipProvider, useMembership } from './lib/MembershipContext';
import { ProfileIcon } from './components/ProfileButton';
import { StackTabBar, type StackTabTarget } from './components/StackTabBar';
import { AdminAccessProvider } from './lib/AdminAccessContext';
import { AdminGate } from './components/admin/AdminGate';
import { hasPendingAuthRedirect } from './lib/authClient';
import { MainTabParamList, RootStackParamList } from './lib/types';

import { HomeScreen } from './screens/HomeScreen';
import { TipsScreen } from './screens/TipsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { FocusStatsScreen } from './screens/FocusStatsScreen';
import { CourseTopicsScreen } from './screens/CourseTopicsScreen';
import { QuizScreen } from './screens/QuizScreen';
import { QuizResultScreen } from './screens/QuizResultScreen';
import { AdminPanelScreen } from './screens/AdminPanelScreen';
import { AdminTopicsScreen } from './screens/AdminTopicsScreen';
import { AdminQuestionsScreen } from './screens/AdminQuestionsScreen';
import { AdminUsersScreen } from './screens/AdminUsersScreen';
import { AdminTipsScreen } from './screens/AdminTipsScreen';
import { AdminCoursesScreen } from './screens/AdminCoursesScreen';
import { AdminSettingsScreen } from './screens/AdminSettingsScreen';
import { AdminMembershipScreen } from './screens/AdminMembershipScreen';
import { AuthScreen } from './screens/AuthScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { MembershipPaywallScreen } from './screens/MembershipPaywallScreen';
import { AdminMaintenanceGate } from './components/admin/MaintenanceGate';
import { SqlDeliveryScreen, sqlDeliveryRequested } from './screens/SqlDeliveryScreen';

// Gate before mounting the screen, so even its effects cannot run for non-admins.
function protectAdmin(Component: React.ComponentType<any>) {
  return function ProtectedAdminRoute(props: any) {
    return <AdminGate><Component {...props} /></AdminGate>;
  };
}
const ProtectedAdminPanel = protectAdmin(AdminPanelScreen);
const ProtectedAdminTopics = protectAdmin(AdminTopicsScreen);
const ProtectedAdminQuestions = protectAdmin(AdminQuestionsScreen);
const ProtectedAdminUsers = protectAdmin(AdminUsersScreen);
const ProtectedAdminTips = protectAdmin(AdminTipsScreen);
const ProtectedAdminCourses = protectAdmin(AdminCoursesScreen);
const ProtectedAdminSettings = protectAdmin(AdminSettingsScreen);
const ProtectedAdminMembership = protectAdmin(AdminMembershipScreen);

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['https://lisansui.vercel.app', 'http://localhost:8081', 'http://localhost:3000'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          HomeTab: '',
          TipsTab: 'ipuclari',
          ReviewTab: 'tekrar',
          FocusStatsTab: 'istatistik',
        },
      },
      CourseTopics: 'ders/:courseId?',
      Quiz: 'test',
      QuizResult: 'sonuc',
      Auth: 'giris/:mode?',
      Profile: 'profil',
      MembershipPaywall: 'vip',
      AdminPanel: 'admin',
      AdminTopics: 'admin/konular/:courseId?',
      AdminQuestions: 'admin/sorular/:courseId?/:topicDocId?',
      AdminUsers: 'admin/uyeler',
      AdminMembership: 'admin/vip',
      AdminTips: 'admin/ipuclari',
      AdminCourses: 'admin/dersler',
      AdminSettings: 'admin/ayarlar',
    },
  },
  getStateFromPath(path, options) {
    const raw = String(path || '/');
    const qIdx = raw.indexOf('?');
    const pathname = (qIdx >= 0 ? raw.slice(0, qIdx) : raw).replace(/^\/+|\/+$/g, '');
    const search = qIdx >= 0 ? raw.slice(qIdx) : '';
    let mapped = `/${pathname}`;
    if (pathname === 'uye-ol' || pathname === 'kayit') mapped = '/giris/uye-ol';
    else if (pathname === 'sifremi-unuttum') mapped = '/giris/sifremi-unuttum';
    else if (pathname === 'yeni-sifre') mapped = '/giris/yeni-sifre';
    else if (pathname === 'hesabim') mapped = '/profil';
    else if (pathname === 'yonetici' || pathname === 'admin/giris') mapped = '/admin';
    return defaultGetStateFromPath(`${mapped}${search}`, options);
  },
};

function MainTabsNavigator() {
  const { colors } = useAppTheme();
  const { mistakes } = useApp();
  const membership = useMembership();
  // Alt güvenli alan (iPhone çentiği/Android gezinme çubuğu) — kütüphanenin kendi
  // `paddingBottom: insets.bottom` değeri biz tabBarStyle'da paddingBottom yazınca
  // eziliyor; bu yüzden inset'i kendimiz ekliyoruz. Web'de 0 (iOS Safari'de >0).
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        // ── Neden bu sayılar? ────────────────────────────────────────────────
        // bottom-tabs'ın uikit dikey yerleşimi her sekmede şunu harcıyor:
        //   .tabVerticalUiKit padding 5+5 = 10  +  TabBarIcon kutusu 28 (simge 22
        //   değil, KUTU 28)  +  etiket satır kutusu 16  =  54px İÇERİK gerekir.
        // Eskiden: height 62 − paddingTop 6 − paddingBottom 8 = 48 → 6px eksikti
        // ve etiketin altı (ğ/ı/Ç kuyrukları) kesiliyordu. Şimdi 64 − 3 − 3 = 58
        // içerik → 4px pay kalıyor; justifyContent:'center' bu payı eşit dağıtıyor
        // (rozetin tepe kesimi yok: rozet ikon kutusunun 3px üstüne taşıyor, 7px pay).
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64 + insets.bottom,
          paddingTop: 3,
          paddingBottom: 3 + insets.bottom,
          // Not: çubuğa `overflow: 'visible'` vermiyoruz — yer açıldığı için
          // gerek yok ve Android'deki borderless ripple'ı çubuğun dışına taşırır.
          // Kesilmeyi engelleyen şey etiketin kendi overflow'u (aşağıda).
          // Sekme çubuğu ekran içeriğinin ÜSTÜNDE kalsın.
          zIndex: 20,
        },
        tabBarLabelStyle: {
          fontSize: 11.5,
          fontWeight: '700',
          // Satır kutusunu kendimiz veriyoruz: tema `fonts.medium` yalnız
          // fontFamily/fontWeight taşıyor, yükseklik tarayıcıya kalıyordu.
          lineHeight: 16,
          flexShrink: 0,
          overflow: 'visible',
          // Yazı katman olarak en üstte (zIndex konumlanmış öğede çalışır).
          position: 'relative',
          zIndex: 10,
        },
        // Kütüphane simge+etiket bloğunu buton içinde üstten başlatıyor
        // (.tabVerticalUiKit justifyContent:'flex-start'); bu stil o bloğu
        // sekmenin tam yüksekliğinde ortalamasını sağlar.
        tabBarItemStyle: {
          justifyContent: 'center',
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Çalış',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'book' : 'book-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="TipsTab"
        component={TipsScreen}
        options={{
          title: 'Hap Bilgi',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'bulb' : 'bulb-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="ReviewTab"
        component={ReviewScreen}
        options={{
          title: 'Tekrarım',
          tabBarBadge: mistakes.length > 0 ? mistakes.length : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.danger,
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '800',
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'refresh-circle' : 'refresh-circle-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="FocusStatsTab"
        component={FocusStatsScreen}
        options={{
          title: 'Odak & Net',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={HomeScreen}
        listeners={({ navigation }) => ({
          tabPress: event => {
            event.preventDefault();
            const parent = navigation.getParent();
            if (membership.signedIn) parent?.navigate('Profile');
            else parent?.navigate('Auth');
          },
        })}
        options={{
          title: membership.signedIn ? (membership.isVip ? 'VIP Profil' : 'Profil') : 'Giriş',
          tabBarAccessibilityLabel: membership.signedIn
            ? (membership.isVip ? 'Hesabım, VIP üye' : 'Hesabım') : 'Giriş yap',
          tabBarIcon: ({ color }) => (
            <ProfileIcon signedIn={membership.signedIn} isVip={membership.isVip} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function MainTabsScreen() {
  return (
    <AdminMaintenanceGate>
      <MainTabsNavigator />
    </AdminMaintenanceGate>
  );
}

function RootNavigator() {
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width > 540;
  const membership = useMembership();
  const navRef = useRef(createNavigationContainerRef<RootStackParamList>()).current;
  const [rootRoute, setRootRoute] = useState('MainTabs');
  const updateRootRoute = useCallback(() => {
    const state = navRef.getRootState();
    if (state) setRootRoute(state.routes[state.index]?.name || 'MainTabs');
  }, [navRef]);
  const selectTab = useCallback((tab: StackTabTarget) => {
    if (!navRef.isReady()) return;
    const destination = tab === 'ProfileTab' ? (membership.signedIn ? 'Profile' : 'Auth') : null;
    if (destination === rootRoute) return;
    const state = navRef.getRootState();
    const currentKey = state?.routes[state.index]?.key;
    const perform = () => {
      if (!navRef.isReady()) return;
      const latest = navRef.getRootState();
      if (!latest || latest.routes[latest.index]?.key !== currentKey) return;
      if (destination) {
        // Replace an unfinished quiz so its timer cannot keep running underneath.
        if (rootRoute === 'Quiz') navRef.dispatch(StackActions.replace(destination));
        else navRef.navigate(destination);
      } else navRef.dispatch(StackActions.popTo('MainTabs', { screen: tab }));
    };
    if (rootRoute !== 'Quiz') { perform(); return; }
    const message = 'Testten ayrılırsanız mevcut yanıtlarınız kaydedilmez. Ayrılmak istiyor musunuz?';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) perform();
    } else {
      Alert.alert('Testten ayrıl', message, [
        { text: 'Devam et', style: 'cancel' },
        { text: 'Ayrıl', style: 'destructive', onPress: perform },
      ]);
    }
  }, [membership.signedIn, navRef, rootRoute]);

  // `?sql=1` → PIN'siz, salt-okunur SQL teslim sayfası. Kasıtlı olarak en başta
  // dönülür: veri katmanı/oturum bozukken de açılabilsin (kurulumda panel
  // kilitli kalabilir; tek gereken şey SQL metnini kopyalamak).
  if (sqlDeliveryRequested()) {
    return <View style={[styles.outerRoot, Platform.OS === 'web' && { height }]}><SqlDeliveryScreen /></View>;
  }

  const navTheme = colors.isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: colors.background,
          card: colors.surface,
          border: colors.border,
          text: colors.text,
          primary: colors.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.background,
          card: colors.surface,
          border: colors.border,
          text: colors.text,
          primary: colors.primary,
        },
      };

  return (
    <View
      style={[
        styles.outerRoot,
        Platform.OS === 'web' && { height },
        {
          backgroundColor: isWideWeb
            ? colors.isDark
              ? '#050914'
              : '#E2E8F0'
            : colors.background,
        },
      ]}
    >
      <View
        style={[
          styles.appFrame,
          isWideWeb && {
            maxWidth: 480,
            alignSelf: 'center',
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.border,
          },
        ]}
      >
        <NavigationContainer ref={navRef} onReady={updateRootRoute} onStateChange={updateRootRoute} theme={navTheme} linking={linking}>
          <StatusBar style={colors.isDark ? 'light' : 'dark'} />
          <View style={styles.stackWindow}>
          <Stack.Navigator
            initialRouteName={hasPendingAuthRedirect() ? 'Auth' : 'MainTabs'}
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="MainTabs" component={MainTabsScreen} />
            <Stack.Screen name="CourseTopics" component={CourseTopicsScreen} />
            <Stack.Screen
              name="Quiz"
              component={QuizScreen}
              options={{ gestureEnabled: false }}
            />
            <Stack.Screen
              name="QuizResult"
              component={QuizResultScreen}
              options={{ gestureEnabled: false }}
            />
            <Stack.Screen name="AdminPanel" component={ProtectedAdminPanel} />
            <Stack.Screen name="AdminTopics" component={ProtectedAdminTopics} />
            <Stack.Screen name="AdminQuestions" component={ProtectedAdminQuestions} />
            <Stack.Screen name="AdminUsers" component={ProtectedAdminUsers} />
            <Stack.Screen name="AdminTips" component={ProtectedAdminTips} />
            <Stack.Screen name="AdminCourses" component={ProtectedAdminCourses} />
            <Stack.Screen name="AdminSettings" component={ProtectedAdminSettings} />
            <Stack.Screen name="AdminMembership" component={ProtectedAdminMembership} />
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen
              name="MembershipPaywall"
              component={MembershipPaywallScreen}
            />
          </Stack.Navigator>
          </View>
          {rootRoute !== 'MainTabs' && <StackTabBar routeName={rootRoute} onSelect={selectTab} />}
        </NavigationContainer>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerRoot: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  stackWindow: { flex: 1, minHeight: 0 },
  appFrame: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <AdminProvider>
            <MembershipProvider>
              <AdminAccessProvider>
                <RootNavigator />
              </AdminAccessProvider>
            </MembershipProvider>
          </AdminProvider>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
