import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { c, font } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.charcoal },
        headerTintColor: c.white,
        headerTitleStyle: { fontFamily: font.display },
        tabBarActiveTintColor: c.orangeDark,
        tabBarLabelStyle: { fontFamily: font.bold, fontSize: 11 },
        tabBarStyle: { borderTopColor: c.line, height: 64, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Eventos', tabBarIcon: ({ color, size }) => <Ionicons name="flag-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="races" options={{ title: 'Corridas', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="friends" options={{ title: 'Amigos', tabBarIcon: ({ color, size }) => <Ionicons name="person-add-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={String(color)} size={size} /> }} />
    </Tabs>
  );
}
