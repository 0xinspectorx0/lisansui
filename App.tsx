import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { ThemeProvider, useAppTheme } from './lib/theme';
import { AppProvider, useApp } from './lib/AppContext';
import { AdminProvider } from './lib/AdminContext';
import { MembershipProvider } from './lib/MembershipContext';
import { MainTabParamList, RootStackParamList } from './lib/types';

import { HomeScreen } from './screens/HomeScreen';
import { TipsScreen } from './screens/TipsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { FocusStatsScreen } from './screens/FocusStatsScreen';
import { CourseTopicsScreen } from './screens/CourseTopicsScreen';
import { QuizScreen } from './screens/QuizScreen';
import { QuizResultScreen } from './screens/QuizResultScreen';
import { AdminLoginScreen } from './screens/AdminLoginScreen';
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

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabsNavigator() {
  const { colors } = useAppTheme();
  const { mistakes } = useApp();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11.5,
          fontWeight: '700',
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
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width > 540;

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
        <NavigationContainer theme={navTheme}>
          <StatusBar style={colors.isDark ? 'light' : 'dark'} />
          <Stack.Navigator
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
            <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
            <Stack.Screen name="AdminPanel" component={AdminPanelScreen} />
            <Stack.Screen name="AdminTopics" component={AdminTopicsScreen} />
            <Stack.Screen name="AdminQuestions" component={AdminQuestionsScreen} />
            <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
            <Stack.Screen name="AdminTips" component={AdminTipsScreen} />
            <Stack.Screen name="AdminCourses" component={AdminCoursesScreen} />
            <Stack.Screen name="AdminSettings" component={AdminSettingsScreen} />
            <Stack.Screen name="AdminMembership" component={AdminMembershipScreen} />
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen
              name="MembershipPaywall"
              component={MembershipPaywallScreen}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerRoot: {
    flex: 1,
  },
  appFrame: {
    flex: 1,
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
              <RootNavigator />
            </MembershipProvider>
          </AdminProvider>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
